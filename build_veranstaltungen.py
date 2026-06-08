#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
build_veranstaltungen.py
========================
Wandelt einen DataHub-RLP API-Export (dataCycle, JSON-LD) in das App-Format
`DATA_VERANSTALTUNGEN_ALLE` der PWA "Guck ma, Westerwald" um.

Aufruf:
    python build_veranstaltungen.py export1.json [export2.json ...] -o veranstaltungen-datahub.js

Die Eingabedateien sind die per API gespeicherten Seiten der gespeicherten Suche
`gmw-veranstaltungen-ww` (mit include=location,organizer,image,eventSchedule,
dc:additionalInformation). Mehrere Seiten werden zusammengeführt und dedupliziert.

Erzeugt eine JS-Datei im exakt gleichen Format wie veranstaltungen-konsolidiert.js,
sodass die bestehenden App-Renderer ohne Anpassung funktionieren.
"""

import argparse
import html
import json
from landkreise_helper import bezirk_aus_plz_ort
import os
import re
import sys
import urllib.request
from datetime import date, datetime, timedelta

HEUTE = date.today()

# ---------------------------------------------------------------------------
# Hilfsfunktionen
# ---------------------------------------------------------------------------

def strip_html(s):
    """Entfernt HTML-Tags, wandelt <br>/</p> in Leerzeichen, entschlüsselt Entities."""
    if not s:
        return ""
    s = re.sub(r"<\s*br\s*/?\s*>", " ", s, flags=re.I)
    s = re.sub(r"</\s*p\s*>", " ", s, flags=re.I)
    s = re.sub(r"<[^>]+>", "", s)          # alle übrigen Tags
    s = html.unescape(s)                    # &amp; &uuml; usw.
    s = re.sub(r"\s+", " ", s).strip()      # Mehrfach-Whitespace
    return s


def parse_dt(iso):
    """'2026-09-05T10:00:00.000+02:00' -> datetime (ohne tz-Komplikationen)."""
    if not iso:
        return None
    m = re.match(r"(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})", iso)
    if not m:
        # evtl. nur Datum
        m2 = re.match(r"(\d{4})-(\d{2})-(\d{2})", iso)
        if m2:
            y, mo, d = map(int, m2.groups())
            return datetime(y, mo, d)
        return None
    y, mo, d, h, mi = map(int, m.groups())
    return datetime(y, mo, d, h, mi)


def fmt_datum_de(dt):
    return dt.strftime("%d.%m.%Y") if dt else ""


def fmt_datum_iso(dt):
    return dt.strftime("%Y-%m-%d") if dt else ""


def fmt_zeit(dt):
    """'10:00 Uhr' -- nur wenn die Uhrzeit nicht 00:00 ist."""
    if not dt:
        return ""
    if dt.hour == 0 and dt.minute == 0:
        return ""
    return dt.strftime("%H:%M Uhr")


def iso_duration_to_human(dur):
    """'PT3H' -> '3 Std.', 'PT1H30M' -> '1,5 Std.', 'PT90M' -> '1,5 Std.'."""
    if not dur:
        return ""
    m = re.match(r"P(?:T)?(?:(\d+)H)?(?:(\d+)M)?", dur)
    if not m:
        return ""
    h = int(m.group(1) or 0)
    mi = int(m.group(2) or 0)
    total_min = h * 60 + mi
    if total_min <= 0:
        return ""
    std = total_min / 60
    if std == int(std):
        return f"{int(std)} Std."
    return f"{std:.1f}".replace(".", ",") + " Std."


def first_addr_field(*addrs):
    """Liefert je Feld den ersten nicht-leeren Wert aus mehreren Adressen."""
    out = {}
    for key in ("telephone", "email", "url"):
        for a in addrs:
            v = (a or {}).get(key)
            if v:
                out[key] = v
                break
        out.setdefault(key, "")
    return out


def get_addiinfo(ev, *namen):
    """Sucht in dc:additionalInformation nach einem Eintrag mit passendem Namen."""
    for ai in ev.get("dc:additionalInformation", []):
        nm = (ai.get("name") or "").strip().lower()
        for ziel in namen:
            if ziel.lower() in nm:
                return strip_html(ai.get("description", ""))
    return ""


# Heuristik kostenlos / Kinder
RE_KOSTENFREI = re.compile(r"kostenlos|kostenfrei|eintritt\s+(?:ist\s+)?frei|freier eintritt|gratis", re.I)
RE_KIDS = re.compile(r"\bkinder\b|\bfamilie\b|\bkids\b|kindgerecht|für jung", re.I)


# ---------------------------------------------------------------------------
# Wiederholungs-Erkennung und -Expansion
# ---------------------------------------------------------------------------

WEEKDAY_MAP = {
    "monday": 0, "tuesday": 1, "wednesday": 2, "thursday": 3,
    "friday": 4, "saturday": 5, "sunday": 6,
}
# Cap: maximal so viele Tage in die Zukunft expandieren
# (der nightly Build laeuft jeden Tag und schiebt das Fenster vorwaerts)
MAX_FORWARD_TAGE = 365


def parse_byday(byday_list):
    """byDay-Liste (z.B. ['https://schema.org/Friday']) zu Set von Wochentag-Nummern (0=Mo)."""
    if not isinstance(byday_list, list):
        return set()
    result = set()
    for bd in byday_list:
        if isinstance(bd, str):
            name = bd.rsplit("/", 1)[-1].lower()
            if name in WEEKDAY_MAP:
                result.add(WEEKDAY_MAP[name])
    return result


def should_expand(dt_start, dt_end, repeat, byday_set, sched_sd=None, sched_ed=None):
    """Soll dieses Event in einzelne Termine aufgespalten werden?

    Kriterien (alle muessen erfuellt sein):
    - Event hat sowohl Start- als auch End-Datum, Ende > Start
    - repeatFrequency ist P1W (woechentlich)
    - byDay nennt 1 oder 2 Wochentage (mehr = "taeglich-aehnliche" Ausstellung, nicht zerlegen)
    - Datumsbereich >= 7 Tage (Mindest-Spanne fuer min. 2 Wochenvorkommnisse)
    - WICHTIG: eventSchedule.startDate/endDate haben Vorrang. Wenn das Schedule
      explizit nur einen einzigen Tag umfasst (sched_sd.date() == sched_ed.date()),
      dann ist es eine Eintagesveranstaltung -- KEINE Expansion, auch wenn das
      aeussere endDate weit in der Zukunft liegt. Dieser Fall kommt im DataHub
      sehr haeufig vor (Pfleger setzt outerEnd = "naechster Termin", Schedule
      bleibt auf 1 Tag).
    """
    if not dt_start or not dt_end or dt_end <= dt_start:
        return False
    if repeat != "P1W":
        return False
    if not (1 <= len(byday_set) <= 2):
        return False
    if (dt_end.date() - dt_start.date()).days < 7:
        return False
    # NEU: Schedule-Daten respektieren -- 1 Tag im Schedule => Eintagesveranstaltung
    if sched_sd and sched_ed and sched_sd.date() == sched_ed.date():
        return False
    return True


def find_occurrences(dt_start, dt_end, byday_set):
    """Erzeugt eine Liste von datetime-Vorkommnissen im sinnvollen Fenster.

    - Iteration ab max(dt_start, heute) -- vergangene Vorkommnisse werden NICHT generiert
    - Forward-Cap: max. MAX_FORWARD_TAGE Tage ab heute
    - Nur Tage, deren Wochentag in byday_set ist
    - Uhrzeit wird vom Event-startDate uebernommen
    """
    if not dt_start or not byday_set:
        return [dt_start] if dt_start else []

    heute_dt = datetime.combine(date.today(), dt_start.time())
    iter_start = max(dt_start, heute_dt)

    cap_dt = datetime.combine(date.today() + timedelta(days=MAX_FORWARD_TAGE), dt_start.time())
    iter_end = min(dt_end, cap_dt) if dt_end else cap_dt

    occurrences = []
    cur = iter_start
    while cur <= iter_end:
        if cur.weekday() in byday_set:
            occurrences.append(cur)
        cur += timedelta(days=1)

    return occurrences


# ---------------------------------------------------------------------------
# Kern: ein DataHub-Event -> ein oder mehrere App-Eintraege
# ---------------------------------------------------------------------------

def map_events(ev):
    """Wandelt ein DataHub-Event in 1..N App-Eintraege um.

    Liefert mehrere Eintraege, wenn das Event eine echte Wochen-/Zweiwochen-
    Wiederholung ist (z.B. Wochenmarkt, Sonntagsgottesdienst).
    """
    uid = ev.get("@id", "")
    name = ev.get("name", "") or ""

    dt_start = parse_dt(ev.get("startDate"))
    dt_end = parse_dt(ev.get("endDate"))

    loc = (ev.get("location") or [{}])[0]
    loc_addr = loc.get("address", {}) if isinstance(loc, dict) else {}
    geo = loc.get("geo", {}) if isinstance(loc, dict) else {}

    org = (ev.get("organizer") or [{}])[0]
    org_addr = org.get("address", {}) if isinstance(org, dict) else {}

    img = (ev.get("image") or [{}])[0]
    # ALLE Bilder als Array fuer die Slideshow im Detail-View
    img_list_raw = ev.get("image") or []
    if isinstance(img_list_raw, dict): img_list_raw = [img_list_raw]
    bilder_alle = []
    for _im in img_list_raw:
        if not isinstance(_im, dict): continue
        _url = _im.get("dc:webUrl") or _im.get("contentUrl") or ""
        if not _url: continue
        _au = _im.get("author")
        if isinstance(_au, dict): _au = _au.get("name", "") if _au.get("name") else ""
        elif isinstance(_au, list):
            _au = next((x.get("name", "") for x in _au if isinstance(x, dict) and x.get("name")), "")
        bilder_alle.append({
            "url":     _url,
            "autor":   str(_au or _im.get("copyrightNotice") or "").strip(),
            "lizenz":  str(_im.get("license") or _im.get("sdLicense") or "").strip(),
            "caption": str(_im.get("caption") or "").strip()
        })
    sched = (ev.get("eventSchedule") or [{}])[0] if isinstance(ev.get("eventSchedule"), list) else {}

    plz = loc_addr.get("postalCode", "") or ""
    ort = loc_addr.get("addressLocality", "") or ""
    plz_ort = (f"{plz} {ort}").strip()

    kontakt = first_addr_field(org_addr, loc_addr)
    beschreibung = strip_html(ev.get("description", ""))

    # Bild: web-optimierte Version bevorzugen
    bild = ""
    bild_lizenz = ""
    bild_urheber = ""
    if isinstance(img, dict) and img.get("@id"):
        bild = img.get("dc:webUrl") or img.get("contentUrl") or ""
        bild_lizenz = img.get("license") or img.get("sdLicense") or ""
        bild_urheber = img.get("copyrightNotice") or ""

    geo_lat = geo.get("latitude")
    geo_lng = geo.get("longitude")
    lat = str(geo_lat) if geo_lat is not None else ""
    lng = str(geo_lng) if geo_lng is not None else ""

    anmeldung = get_addiinfo(ev, "Wichtige Information", "Anmeldung")
    beachten = get_addiinfo(ev, "Hinweis", "Anreise", "zu beachten")

    kostenfrei = bool(RE_KOSTENFREI.search(beschreibung))
    fuer_kids = bool(RE_KIDS.search(name + " " + beschreibung))

    # Wiederholungs-Pruefung
    byday_set = parse_byday(sched.get("byDay") if isinstance(sched, dict) else None)
    repeat = sched.get("repeatFrequency") if isinstance(sched, dict) else None
    # Schedule-eigene Start-/End-Daten extra parsen (sind im DataHub oft genauer
    # als die aeusseren ev.startDate/endDate -- letztere werden bei wiederkehrenden
    # Events vom Pfleger oft auf "letzter Termin" gesetzt)
    sched_sd = parse_dt(sched.get("startDate")) if isinstance(sched, dict) else None
    sched_ed = parse_dt(sched.get("endDate"))   if isinstance(sched, dict) else None

    # KORREKTUR fuer falsch konfigurierte Eintagesveranstaltungen:
    # Wenn Schedule nur 1 Tag, aber outerEnd ein anderes (spaeteres) Datum hat,
    # nehmen wir outerEnd als das echte Event-Datum -- das ist im DataHub-Workflow
    # uebliche Praxis (outerEnd = aktueller Termin, sched_*Date = Pflegestempel).
    if (sched_sd and sched_ed and sched_sd.date() == sched_ed.date()
            and dt_start and dt_end and dt_end.date() > dt_start.date()):
        dt_start = dt_end
        dt_end = None
        # Wiederholung wird unwirksam -- ist faktisch ein Eintag
        repeat = None
        byday_set = set()

    # Faelle:
    # 1) Echte Wiederholung -> mehrere Eintraege
    # 2) Ein-/Mehrtages-Event -> ein Eintrag (mit datumBisIso bei mehrtaegig)
    if should_expand(dt_start, dt_end, repeat, byday_set, sched_sd, sched_ed):
        occurrences = find_occurrences(dt_start, dt_end, byday_set)
        if len(occurrences) >= 2:
            # Mehrere Eintraege erzeugen
            entries = []
            for occ in occurrences:
                e = _baue_eintrag(
                    eid=f"dh-{uid}-{occ.strftime('%Y%m%d')}",
                    dt_at=occ, dt_end=None,  # einzelne Vorkommnisse = Tageseintraege
                    name=name, beschreibung=beschreibung, ort=ort,
                    adresse=loc_addr.get("streetAddress", "") or "",
                    plz=plz, plz_ort=plz_ort,
                    org_name=(org.get("name") if isinstance(org, dict) else "") or "",
                    kontakt=kontakt, sched=sched,
                    bild=bild, bild_lizenz=bild_lizenz, bild_urheber=bild_urheber,
                    lat=lat, lng=lng,
                    anmeldung=anmeldung, beachten=beachten,
                    kostenfrei=kostenfrei, fuer_kids=fuer_kids,
                    bilder=bilder_alle,
                )
                entries.append(e)
            return entries

    # Standard: ein Eintrag
    return [_baue_eintrag(
        eid=f"dh-{uid}",
        dt_at=dt_start, dt_end=dt_end,
        name=name, beschreibung=beschreibung, ort=ort,
        adresse=loc_addr.get("streetAddress", "") or "",
        plz=plz, plz_ort=plz_ort,
        org_name=(org.get("name") if isinstance(org, dict) else "") or "",
        kontakt=kontakt, sched=sched,
        bild=bild, bild_lizenz=bild_lizenz, bild_urheber=bild_urheber,
        lat=lat, lng=lng,
        anmeldung=anmeldung, beachten=beachten,
        kostenfrei=kostenfrei, fuer_kids=fuer_kids,
        bilder=bilder_alle,
    )]


def _baue_eintrag(eid, dt_at, dt_end, name, beschreibung, ort, adresse, plz, plz_ort,
                  org_name, kontakt, sched, bild, bild_lizenz, bild_urheber,
                  lat, lng, anmeldung, beachten, kostenfrei, fuer_kids, bilder=None):
    """Baut einen einzelnen App-Eintrag (eine Belegung des Schemas)."""
    # datumBisIso nur, wenn dt_end gegeben und vom dt_at-Datum abweicht
    if dt_end and dt_at and dt_end.date() != dt_at.date():
        datum_bis_iso = fmt_datum_iso(dt_end)
    else:
        datum_bis_iso = ""

    dauer = ""
    if isinstance(sched, dict):
        dauer = iso_duration_to_human(sched.get("duration", ""))

    return {
        "id": eid,
        "quelle": "event",
        "datumIso": fmt_datum_iso(dt_at),
        "datumBisIso": datum_bis_iso,
        "datumDe": fmt_datum_de(dt_at),
        "zeit": fmt_zeit(dt_at),
        "titel": name,
        "beschreibung": beschreibung,
        "ort": ort,
        "adresse": adresse,
        "plzOrt": plz_ort,
        "region": "Westerwald",
        "bezirk": bezirk_aus_plz_ort(plz, ort),
        "veranstalter": org_name,
        "leitung": "",
        "telefon": kontakt["telephone"],
        "email": kontakt["email"],
        "website": kontakt["url"],
        "anmeldung": anmeldung,
        "anmeldungKontakt": kontakt["email"] or kontakt["url"],
        "dauer": dauer,
        "kosten": "kostenfrei" if kostenfrei else "",
        "kostenfrei": kostenfrei,
        "fuerKids": fuer_kids,
        "mitbringen": "",
        "beachten": beachten,
        "kategorie": "",
        "sourceUrl": "",
        "lat": lat,
        "lng": lng,
        "bild": bild,
        "bilder": (bilder or []),
        "bildLizenz": bild_lizenz,
        "bildUrheber": bild_urheber,
    }


# ---------------------------------------------------------------------------
# Datei-Verarbeitung
# ---------------------------------------------------------------------------

DEFAULT_INCLUDE = "location,organizer,image,eventSchedule,dc:additionalInformation"
DEFAULT_FIELDS = ("*,location.*,organizer.*,image.*,eventSchedule.*,"
                  "dc:additionalInformation.*")


def fetch_from_api(endpoint, token, page_size=1000, base="https://data.rlp-tourismus.de"):
    """Holt alle Seiten einer gespeicherten Suche per HTTP-POST und gibt die
    zusammengefuehrte @graph-Liste zurueck. Nutzt nur die Standardbibliothek."""
    url = f"{base}/api/v4/endpoints/{endpoint}"
    alle = []
    seite = 1
    while True:
        payload = {
            "page": {"size": page_size, "number": seite},
            "include": DEFAULT_INCLUDE,
            "fields": DEFAULT_FIELDS,
        }
        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            method="POST",
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
                "Accept": "application/json",
            },
        )
        with urllib.request.urlopen(req, timeout=120) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        graph = data.get("@graph", [])
        alle.extend(graph)
        total = data.get("meta", {}).get("total")
        print(f"  Seite {seite}: {len(graph)} Events "
              f"(gesamt bisher {len(alle)}/{total})", file=sys.stderr)
        # Abbruch: keine next-Link mehr oder leere Seite
        if not data.get("links", {}).get("next") or not graph:
            break
        seite += 1
    return alle


def load_graph(pfade):
    """Liest alle Eingabe-JSONs, fuehrt @graph zusammen, dedupliziert nach @id."""
    seen = {}
    for p in pfade:
        with open(p, "r", encoding="utf-8") as f:
            data = json.load(f)
        for ev in data.get("@graph", []):
            seen[ev.get("@id")] = ev   # spaetere ueberschreiben fruehere
    return list(seen.values())


def main():
    ap = argparse.ArgumentParser(description="DataHub -> Guck ma Westerwald Veranstaltungen")
    ap.add_argument("inputs", nargs="*", help="DataHub-JSON-Export(e) (Datei-Modus)")
    ap.add_argument("-o", "--output", default="veranstaltungen-datahub.js")
    ap.add_argument("--alle", action="store_true",
                    help="Auch vergangene Termine ausgeben (Standard: nur ab heute)")
    ap.add_argument("--endpoint", default=os.environ.get("DATAHUB_ENDPOINT", ""),
                    help="Endpoint-ID/Slug fuer Direkt-Abruf (statt Datei). "
                         "Default aus Umgebungsvariable DATAHUB_ENDPOINT.")
    ap.add_argument("--token", default=os.environ.get("DATAHUB_TOKEN", ""),
                    help="API-Bearer-Token. Default aus Umgebungsvariable DATAHUB_TOKEN.")
    ap.add_argument("--page-size", type=int, default=1000)
    args = ap.parse_args()

    if args.endpoint:
        if not args.token:
            sys.exit("FEHLER: --token bzw. DATAHUB_TOKEN noetig fuer den API-Abruf.")
        print(f"API-Abruf von Endpoint {args.endpoint} ...", file=sys.stderr)
        roh = fetch_from_api(args.endpoint, args.token, args.page_size)
        # Deduplizieren nach @id
        roh = list({ev.get("@id"): ev for ev in roh}.values())
    elif args.inputs:
        # Windows: CMD/PowerShell expandieren *.json nicht -> selbst machen
        import glob
        expanded = []
        for _p in args.inputs:
            if any(c in _p for c in "*?["):
                _matches = sorted(glob.glob(_p))
                if not _matches:
                    print("WARN: kein Treffer fuer Muster: " + _p, file=sys.stderr)
                expanded.extend(_matches)
            else:
                expanded.append(_p)
        if not expanded:
            sys.exit("FEHLER: keine Eingabe-Dateien gefunden")
        roh = load_graph(expanded)
    else:
        sys.exit("FEHLER: Entweder Eingabedatei(en) ODER --endpoint angeben.")

    print(f"Gelesen: {len(roh)} Events", file=sys.stderr)

    eintraege = []
    ohne_datum = ohne_geo = vergangen = 0
    expandiert = 0     # Wie viele zusaetzliche Eintraege durch Wiederholungs-Expansion entstanden
    for ev in roh:
        sub = map_events(ev)
        if len(sub) > 1:
            expandiert += len(sub) - 1
        for e in sub:
            if not e["datumIso"]:
                ohne_datum += 1
                continue
            # "vergangen" = das Event ist VORBEI, also Ende vor heute.
            # Bei mehrtaegigen Events bleibt der Eintrag drin solange das Ende >= heute.
            effektives_ende = e.get("datumBisIso") or e["datumIso"]
            if not args.alle and effektives_ende < HEUTE.strftime("%Y-%m-%d"):
                vergangen += 1
                continue
            if not e["lat"]:
                ohne_geo += 1
            eintraege.append(e)

    # Sortieren nach Datum
    eintraege.sort(key=lambda x: x["datumIso"])

    # JS-Datei schreiben (IIFE-Merge-Pattern wie data_veranstaltungen_neu.js)
    body = ",\n    ".join(
        json.dumps(e, ensure_ascii=False) for e in eintraege
    )
    js = (
        "/* " + "=" * 64 + "\n"
        "   Veranstaltungen aus DataHub RLP (dataCycle)\n"
        f"   Quelle: gespeicherte Suche gmw-veranstaltungen-ww\n"
        f"   Generiert: {datetime.now():%d.%m.%Y %H:%M}\n"
        f"   Eintraege: {len(eintraege)} (nur zukuenftige Termine ab {HEUTE:%d.%m.%Y})\n"
        "   " + "=" * 64 + " */\n\n"
        "(function() {\n"
        "  // Idempotenz: nicht doppelt registrieren, auch bei Mehrfach-Laden\n"
        "  if (window.__WW_EVENTS_DATAHUB_LOADED__) {\n"
        "    console.warn(\"[Veranstaltungen DATAHUB] Datei wurde mehrfach geladen \\u2014 zweiter Load uebersprungen.\");\n"
        "    return;\n"
        "  }\n"
        "  window.__WW_EVENTS_DATAHUB_LOADED__ = true;\n\n"
        "  var neueEvents = [\n"
        f"    {body}\n"
        "  ];\n\n"
        "  // Bestehende Liste initialisieren falls nicht vorhanden\n"
        "  window.DATA_VERANSTALTUNGEN_ALLE = window.DATA_VERANSTALTUNGEN_ALLE || [];\n"
        "  var bestand = window.DATA_VERANSTALTUNGEN_ALLE;\n"
        "  var bestandVor = bestand.length;\n\n"
        "  function machSchluessel(e) {\n"
        "    if (e.sourceUrl) return \"url:\" + e.sourceUrl.trim().toLowerCase();\n"
        "    return \"td:\" + (e.titel||\"\").trim().toLowerCase() + \"|\" + (e.datumIso||\"\");\n"
        "  }\n\n"
        "  var bekannt = {};\n"
        "  for (var i = 0; i < bestand.length; i++) {\n"
        "    bekannt[machSchluessel(bestand[i])] = true;\n"
        "  }\n\n"
        "  var hinzugefuegt = 0, uebersprungen = 0;\n"
        "  for (var j = 0; j < neueEvents.length; j++) {\n"
        "    var k = machSchluessel(neueEvents[j]);\n"
        "    if (bekannt[k]) { uebersprungen++; continue; }\n"
        "    bekannt[k] = true;\n"
        "    bestand.push(neueEvents[j]);\n"
        "    hinzugefuegt++;\n"
        "  }\n\n"
        "  console.log(\"[Veranstaltungen DATAHUB] Bestand vorher: \" + bestandVor + \", neue Datei: \" + neueEvents.length + \", hinzugefuegt: \" + hinzugefuegt + \", uebersprungen (Duplikat): \" + uebersprungen + \", Bestand nachher: \" + bestand.length);\n"
        "})();\n"
    )
    with open(args.output, "w", encoding="utf-8") as f:
        f.write(js)

    print(f"Geschrieben: {args.output}", file=sys.stderr)
    print(f"  Eintraege:           {len(eintraege)}", file=sys.stderr)
    print(f"    davon expandiert:  {expandiert} zusaetzliche durch Wochen-Wiederholung", file=sys.stderr)
    print(f"  Ohne Datum (weg):    {ohne_datum}", file=sys.stderr)
    print(f"  Vergangen (weg):     {vergangen}", file=sys.stderr)
    print(f"  Ohne Geo:            {ohne_geo}", file=sys.stderr)


if __name__ == "__main__":
    main()
