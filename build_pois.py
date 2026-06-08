#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
build_pois.py — Mapper DataHub-RLP POIs -> App-Format

Liest entweder lokale JSON-Dateien (eine pro Seite vom Browser-Export) oder
holt die Daten direkt per HTTPS aus dem DataHub-Endpoint
'gmw-pois-ww' (braucht --token).

Schreibt eine IIFE-JS-Datei, die sich in window.DATA_POIS_ALLE einklinkt --
analog zur wandertouren-datahub.js / radtouren-datahub.js.

FILTER (im Mapper, nicht im DataHub):
  * Inaktive Eintraege werden uebersprungen
  * Treffer mit "Infotafel" im Namen werden uebersprungen
  * Klassifizierung "Spielplatz" wird uebersprungen

Aufruf (lokal):
    python build_pois.py pois-1.json pois-2.json -o pois-datahub.js

Aufruf (API):
    python build_pois.py --token <TOKEN> -o pois-datahub.js
"""

import argparse
import glob
import json
from landkreise_helper import bezirk_aus_plz_ort
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime


# ---------------------------------------------------------------------------
# Filter-Konfiguration für die Mapper-Sortierung
# ---------------------------------------------------------------------------

# POIs mit diesen Strings im Namen rausfiltern (case-insensitive)
NAMENS_BLACKLIST = [
    "infotafel",
    "infopunkt",
    "infopoint",
    "wandertafel",
    "hinweistafel",
]

# POIs mit diesen Klassifizierungs-Labels rausfiltern (case-insensitive)
KLASSIFIZIERUNGS_BLACKLIST = [
    "spielplatz",
]

# Diese Klassifikations-Labels sind Metadaten (Lizenz, Datenquelle, Region,
# Zielgruppen-Marker, Saison) und gehoeren NICHT in die UI-Filterpillen.
METADATA_BLACKLIST_EXACT = {
    "poi", "place", "touristattraction",
    "aktiv", "inaktiv",
    "open data", "internet", "katalog",
    "lokaler expertclient", "infomedia/informator",
    "westerwald", "westerwald - ganz nach deiner natur!",
    "cc by-sa", "cc0", "cc0 universell",
    "online buchbarkeit", "buchbar",
    "germany", "deutschland", "deutsch",
    "ganzjährig", "sommer", "winter", "frühling", "herbst",
    "outdoor", "indoor",
    "infrastructurepriceinfo",
    "wäller touren",
    # Aus realer Statistik: Touristik-Regionen + Marketing-Marker
    "naturregion sieg",
    "natur & aktiv (saisonverlängerung)",
    "ww-park gastronomie",
    "rheinburgenweg-partner",
    "westerwald-steig partner",
}

METADATA_BLACKLIST_PREFIX = (
    "zg ",                       # Zielgruppen-Marker
    "cc by-sa namensnennung",    # Lizenz-Variante
    "cc by namensnennung",
    "westerwald - ganz nach",
)

# Heuristik: Tags die wie "Ausstattungs-Merkmale" aussehen kommen in features[],
# alles andere in categories[] (Filter-Pillen oben).
AMENITY_KEYWORDS = (
    "wifi", "wlan", "internet",
    "barrierefrei", "rollstuhl", "behindert",
    "haustier", "hund", "tiere erlaubt",
    "famil", "kinder",
    "parkplatz", "wc",
    "ladestation", "e-bike", "e-ladestation",
    "geführt", "gefuehrt",
    "kostenlos", "eintritt",
    "stempelstell",
    # Aus realer Statistik
    "gruppe", "single", "senioren",
    "wanderparkplatz", "assistenzhund",
    "exkursion", "ausflug für",
)


# ---------------------------------------------------------------------------
# Helper: HTML säubern -> Plain-Text mit erhaltenen Absaetzen
# ---------------------------------------------------------------------------

_RE_BLOCK_P  = re.compile(r"</?\s*p\s*>", re.I)
_RE_BR       = re.compile(r"<\s*br\s*/?\s*>", re.I)
_RE_LI_OPEN  = re.compile(r"<\s*li\s*>", re.I)
_RE_LI_CLOSE = re.compile(r"</\s*li\s*>", re.I)
_RE_TAGS     = re.compile(r"<[^>]+>")
_RE_ENTITIES = {"&nbsp;": " ", "&amp;": "&", "&lt;": "<", "&gt;": ">",
                "&quot;": '"', "&#39;": "'", "&#160;": " "}
_RE_WHITESPACE = re.compile(r"[ \t]+")
_RE_TRIPLE_NL  = re.compile(r"\n{3,}")

def strip_html(s):
    if not s:
        return ""
    s = _RE_BLOCK_P.sub("\n", s)
    s = _RE_BR.sub("\n", s)
    s = _RE_LI_OPEN.sub("\n• ", s)
    s = _RE_LI_CLOSE.sub("", s)
    s = _RE_TAGS.sub("", s)
    for ent, ch in _RE_ENTITIES.items():
        s = s.replace(ent, ch)
    s = _RE_WHITESPACE.sub(" ", s)
    s = _RE_TRIPLE_NL.sub("\n\n", s)
    return s.strip()


# ---------------------------------------------------------------------------
# Helper: Klassifizierungs-Labels eines POI-Datensatzes sammeln
# ---------------------------------------------------------------------------

def klassifizierungen(t, concepts):
    """Sammelt alle Klassifizierungs-Labels als Liste von Strings.

    Die Klassifizierungen sind im DataHub-Export nur als skos:Concept-Referenzen
    (UUIDs) hinterlegt. Mit dem mitgelieferten concepts-Dict (UUID -> Label,
    erzeugt von download_concepts.py) loesen wir sie auf.
    """
    out = []
    for feld in ("dc:classification", "classification", "category"):
        raw = t.get(feld) or []
        if isinstance(raw, list):
            for c in raw:
                if isinstance(c, dict):
                    # Wenn dataCycle inline-Namen liefert (selten): direkt nehmen
                    lbl = c.get("name") or c.get("dc:title") or c.get("title") or ""
                    if not lbl:
                        # Sonst ueber UUID im concepts-Dict aufloesen
                        uid = c.get("@id", "")
                        lbl = concepts.get(uid, "")
                    if lbl:
                        out.append(str(lbl))
                elif isinstance(c, str):
                    out.append(c)
        elif isinstance(raw, dict):
            lbl = raw.get("name") or raw.get("dc:title") or ""
            if lbl:
                out.append(str(lbl))
    return out


def ist_uppercase_ortsname(label):
    """Heuristik: erkennt Ortsnamen in komplett-Grossbuchstaben
    wie 'DILLENBURG', 'BAD MARIENBERG', 'ALTENKIRCH' aus der Touristik-DB."""
    if not label or len(label) < 6:
        return False
    if not label.isupper():
        return False
    # Nur Buchstaben (inkl. dt. Sonderzeichen), Leerzeichen, Bindestrich erlaubt
    erlaubt = set(" -ÄÖÜß/")
    for ch in label:
        if not (ch.isalpha() or ch in erlaubt):
            return False
    return True


def ist_metadata(label):
    """True wenn das Label ein Datenpflege-/Lizenz-/Quelle-/Saison-Marker ist."""
    l = label.lower().strip()
    if l in METADATA_BLACKLIST_EXACT:
        return True
    for prefix in METADATA_BLACKLIST_PREFIX:
        if l.startswith(prefix):
            return True
    if ist_uppercase_ortsname(label):
        return True
    return False


def ist_amenity(label):
    """True wenn das Label ein Ausstattungs-Merkmal ist."""
    l = label.lower()
    return any(kw in l for kw in AMENITY_KEYWORDS)


def sortiere_klassen(klassen):
    """Aufteilung in categories (typ-relevant) und features (Ausstattung).
    Metadaten werden komplett rausgefiltert."""
    categories = []
    features = []
    for k in klassen:
        if ist_metadata(k):
            continue
        if ist_amenity(k):
            features.append(k)
        else:
            categories.append(k)
    return categories, features


def ist_aktiv(klassen):
    """Inaktive POIs herausfiltern. Wenn 'Inaktiv' und NICHT 'Aktiv' -> raus."""
    klassen_lower = [k.lower() for k in klassen]
    if "inaktiv" in klassen_lower and "aktiv" not in klassen_lower:
        return False
    return True


def soll_inkludiert_werden(name, klassen):
    """Filter-Entscheidung pro POI."""
    if not ist_aktiv(klassen):
        return False, "inaktiv"
    name_lower = (name or "").lower()
    for blocker in NAMENS_BLACKLIST:
        if blocker in name_lower:
            return False, "namens-blacklist:" + blocker
    klassen_lower = [k.lower() for k in klassen]
    for blocker in KLASSIFIZIERUNGS_BLACKLIST:
        if blocker in klassen_lower:
            return False, "klass-blacklist:" + blocker
    return True, "ok"


# ---------------------------------------------------------------------------
# Helper: Geometrie aus WKT POINT extrahieren
# ---------------------------------------------------------------------------

_RE_WKT_POINT = re.compile(r"POINT\s*\(\s*([\d.\-]+)\s+([\d.\-]+)", re.I)

def parse_geo(t):
    """Liefert (lat, lng) oder (None, None)."""
    geo = t.get("geo") or {}
    if not isinstance(geo, dict):
        return None, None

    # Variante 1: WKT-String in geo.point oder geo.location
    for feld in ("point", "location", "line"):
        wkt = geo.get(feld)
        if isinstance(wkt, str) and wkt.upper().startswith("POINT"):
            m = _RE_WKT_POINT.search(wkt)
            if m:
                try:
                    lng = round(float(m.group(1)), 5)
                    lat = round(float(m.group(2)), 5)
                    return lat, lng
                except ValueError:
                    pass

    # Variante 2: latitude/longitude direkt
    for lat_feld, lng_feld in (("latitude", "longitude"), ("lat", "lng"), ("lat", "lon")):
        if lat_feld in geo and lng_feld in geo:
            try:
                lat = round(float(geo[lat_feld]), 5)
                lng = round(float(geo[lng_feld]), 5)
                return lat, lng
            except (ValueError, TypeError):
                pass

    return None, None


# ---------------------------------------------------------------------------
# Helper: Adresse extrahieren (dataCycle-typische Felder)
# ---------------------------------------------------------------------------

def parse_adresse(t):
    """Liefert (strasse, plz, ort) -- jeweils str oder ''."""
    # Variante 1: verschachteltes address-Objekt
    addr = t.get("address") or t.get("dc:address") or {}
    if isinstance(addr, list) and addr:
        addr = addr[0]
    if not isinstance(addr, dict):
        addr = {}

    strasse = (addr.get("streetAddress") or addr.get("dc:streetAddress")
               or t.get("streetAddress") or t.get("dc:streetAddress") or "")
    plz     = (addr.get("postalCode") or addr.get("dc:postalCode")
               or t.get("postalCode") or t.get("dc:postalCode") or "")
    ort     = (addr.get("addressLocality") or addr.get("dc:addressLocality")
               or t.get("addressLocality") or t.get("dc:addressLocality") or "")

    return str(strasse).strip(), str(plz).strip(), str(ort).strip()


# ---------------------------------------------------------------------------
# Kern: ein DataHub-POI -> ein App-Eintrag
# ---------------------------------------------------------------------------

def map_poi(t, concepts):
    """Konvertiert einen DataHub-POI-Datensatz ins App-Schema.

    Liefert None, wenn der POI gefiltert wird.
    Liefert (eintrag, grund_falls_skip) bei Erfolg/Skip.
    """
    name = (t.get("name") or "").strip()
    if not name:
        return None, "kein name"

    klassen = klassifizierungen(t, concepts)
    drin, grund = soll_inkludiert_werden(name, klassen)
    if not drin:
        return None, grund

    # Sortiere die Klassifizierungen in UI-Filterpillen vs Ausstattung
    categories, features = sortiere_klassen(klassen)

    lat, lng = parse_geo(t)
    strasse, plz, ort = parse_adresse(t)

    # Bild(er) -- DataHub liefert ALLE Bilder im image[]-Array.
    img_list = t.get("image") or []
    if isinstance(img_list, dict): img_list = [img_list]
    bilder_alle = []
    for img in img_list:
        if not isinstance(img, dict): continue
        url = img.get("dc:webUrl") or img.get("contentUrl") or ""
        if not url: continue
        # Author/Holder kann sein: string | dict mit "name" | dict nur mit @id-Ref | list davon
        def _resolve_name(v):
            if isinstance(v, str): return v
            if isinstance(v, dict):
                # Echter Name vorhanden? Sonst nur JSON-LD-Ref -> leer
                return v.get("name", "") if v.get("name") else ""
            if isinstance(v, list):
                for x in v:
                    n = _resolve_name(x)
                    if n: return n
            return ""
        au = _resolve_name(img.get("author"))
        cr = _resolve_name(img.get("copyrightHolder"))
        bilder_alle.append({
            "url":     url,
            "autor":   str(au or cr or img.get("source") or "").strip(),
            "lizenz":  str(img.get("license") or img.get("sdLicense") or img.get("copyrightNotice") or "").strip(),
            "caption": str(img.get("caption") or "").strip()
        })
    img = img_list[0] if img_list and isinstance(img_list[0], dict) else {}
    bild         = bilder_alle[0]["url"] if bilder_alle else ""
    thumb        = img.get("thumbnailUrl") or ""
    bild_lizenz  = bilder_alle[0]["lizenz"] if bilder_alle else ""
    bild_urheber = bilder_alle[0]["autor"] if bilder_alle else ""

    # Kontakt -- bei POIs steht Tel/Mail/URL im verschachtelten address-Objekt!
    addr = t.get("address") or t.get("dc:address") or {}
    if isinstance(addr, list) and addr: addr = addr[0]
    if not isinstance(addr, dict): addr = {}
    tel = (addr.get("telephone") or addr.get("dc:telephone")
           or t.get("telephone") or t.get("dc:telephone") or "")
    mail = (addr.get("email") or addr.get("dc:email")
            or t.get("email") or t.get("dc:email") or "")

    # Links: url aus address, dann Top-Level, dann sameAs
    links = []
    web = (addr.get("url") or addr.get("dc:url")
           or t.get("url") or t.get("dc:url") or "")
    if web and web not in links:
        links.append(web)
    same_as = t.get("sameAs") or []
    if isinstance(same_as, list):
        for s in same_as:
            if isinstance(s, str) and s and s not in links:
                links.append(s)

    uid = t.get("@id", "") or ""
    slug = t.get("dc:slug") or t.get("dc:slugifiedName") or ""

    eintrag = {
        "id":          "dh-" + uid,
        "slug":        slug,
        "name":        name,
        "klassen":     klassen,        # alle Original-Labels (rueckwaertskompatibel)
        "categories":  categories,     # fuer Filter-Pillen
        "features":    features,       # fuer Ausstattungs-Liste
        "kurz":        strip_html(t.get("description", "")),
        "detail":      strip_html(t.get("text", "")),
        "strasse":     strasse,
        "plz":         plz,
        "ort":         ort,
        "bezirk":      bezirk_aus_plz_ort(plz, ort),
        "tel":         str(tel).strip(),
        "mail":        str(mail).strip(),
        "links":       links,
        "lat":         lat,
        "lng":         lng,
        "bild":        bild,
        "thumb":       thumb,
        "bilder":      bilder_alle,
        "bildLizenz":  bild_lizenz,
        "bildUrheber": bild_urheber,
    }
    return eintrag, "ok"


# ---------------------------------------------------------------------------
# Output: IIFE-Datei mit Merge-Logik in window.DATA_POIS_ALLE
# ---------------------------------------------------------------------------

def schreibe_js(eintraege, output_path):
    payload_json = json.dumps(eintraege, ensure_ascii=False, separators=(",", ":"))
    stand = datetime.now().isoformat(timespec="seconds")
    js_code = (
        "// ════════════════════════════════════════════════════════════════\n"
        "// AUTO-GENERIERT von build_pois.py — nicht von Hand editieren!\n"
        "// Stand: " + stand + "\n"
        "// Quelle: DataHub RLP, gespeicherte Suche 'gmw-pois-ww'\n"
        "// Anzahl POIs: " + str(len(eintraege)) + "\n"
        "// ════════════════════════════════════════════════════════════════\n"
        "(function() {\n"
        "  if (!window.DATA_POIS_ALLE) window.DATA_POIS_ALLE = [];\n"
        "  if (window.__DATA_POIS_DATAHUB_GELADEN) {\n"
        "    console.warn('[POIs DATAHUB] Datei wurde bereits geladen, ueberspringe Merge.');\n"
        "    return;\n"
        "  }\n"
        "  window.__DATA_POIS_DATAHUB_GELADEN = true;\n"
        "\n"
        "  var neu = " + payload_json + ";\n"
        "  var bestand = window.DATA_POIS_ALLE;\n"
        "  var vorhanden = {};\n"
        "  for (var i = 0; i < bestand.length; i++) {\n"
        "    var k = (bestand[i].slug || bestand[i].id || '').toLowerCase();\n"
        "    if (k) vorhanden[k] = true;\n"
        "  }\n"
        "  var vorher = bestand.length, hinzu = 0, dedup = 0;\n"
        "  for (var j = 0; j < neu.length; j++) {\n"
        "    var n = neu[j];\n"
        "    var key = (n.slug || n.id || '').toLowerCase();\n"
        "    if (key && vorhanden[key]) { dedup++; continue; }\n"
        "    bestand.push(n);\n"
        "    if (key) vorhanden[key] = true;\n"
        "    hinzu++;\n"
        "  }\n"
        "  console.log('[POIs DATAHUB] Bestand vorher: ' + vorher\n"
        "    + ', neue Datei: ' + neu.length\n"
        "    + ', hinzugefuegt: ' + hinzu\n"
        "    + ', uebersprungen (Duplikat): ' + dedup\n"
        "    + ', Bestand nachher: ' + bestand.length);\n"
        "})();\n"
    )
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(js_code)


# ---------------------------------------------------------------------------
# I/O: lokale Dateien oder API direkt
# ---------------------------------------------------------------------------

def lade_lokal(pfade):
    """Liest beliebig viele JSON-Seiten ein und mergt alle @graph-Arrays."""
    alle = []
    for p in pfade:
        with open(p, "r", encoding="utf-8") as f:
            d = json.load(f)
        graph = d.get("@graph") if isinstance(d, dict) else None
        if isinstance(graph, list):
            alle.extend(graph)
        elif isinstance(d, list):
            alle.extend(d)
        else:
            print("WARN: " + p + " hat kein @graph-Feld", file=sys.stderr)
    return alle


def lade_api(endpoint_slug, token, page_size=100, max_pages=50):
    """Holt alle Seiten ueber HTTPS mit Token-Authentifizierung."""
    base = "https://data.rlp-tourismus.de/api/v4/endpoints/" + endpoint_slug
    include = "image,location,dc:additionalInformation,address"
    fields  = "*,image.*,location.*,dc:additionalInformation.*,address.*"
    alle = []
    for page in range(1, max_pages + 1):
        params = {
            "page[size]":   str(page_size),
            "page[number]": str(page),
            "include":      include,
            "fields":       fields,
        }
        q = urllib.parse.urlencode(params, quote_via=urllib.parse.quote)
        url = base + "?" + q
        req = urllib.request.Request(url)
        if token:
            req.add_header("Authorization", 'Token token="' + token + '"')
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                d = json.load(resp)
        except urllib.error.HTTPError as e:
            print("FEHLER Seite " + str(page) + ": HTTP " + str(e.code), file=sys.stderr)
            break
        graph = d.get("@graph", [])
        alle.extend(graph)
        total = (d.get("meta") or {}).get("total", 0)
        print("  Seite " + str(page) + ": " + str(len(graph))
              + " POIs (gesamt: " + str(len(alle)) + "/" + str(total) + ")",
              file=sys.stderr)
        if total and len(alle) >= total:
            break
        if len(graph) < page_size:
            break
    return alle


def sammle_ortsnamen(roh):
    """Sammelt alle addressLocality-Werte als lowercase-Set.
    
    Diese werden zur dynamischen Erweiterung der METADATA_BLACKLIST genutzt
    -- Tag-Labels, die exakt einem dieser Orte entsprechen, sind Orts-Tags
    und gehoeren nicht in die Kategorien-Filterpillen.
    """
    orte = set()
    for t in roh:
        addr = t.get("address") or t.get("dc:address") or {}
        if isinstance(addr, list) and addr: addr = addr[0]
        if isinstance(addr, dict):
            ort = (addr.get("addressLocality") or addr.get("dc:addressLocality") or "")
            ort = str(ort).strip()
            if ort:
                # Auch ohne Postleitzahl-Bestandteile/Suffixe
                orte.add(ort.lower())
                # Bei "Siegbach-Übernthal" auch Teile zerlegen
                for teil in ort.replace("/", "-").split("-"):
                    teil = teil.strip()
                    if teil and len(teil) >= 4:
                        orte.add(teil.lower())
        # Auch direkt am POI
        ort = (t.get("addressLocality") or t.get("dc:addressLocality") or "")
        ort = str(ort).strip()
        if ort:
            orte.add(ort.lower())
    return orte


def lade_concepts(pfad):
    """Liest die UUID->Label-Auflösung aus concepts.json."""
    if not pfad:
        return {}
    try:
        with open(pfad, "r", encoding="utf-8") as f:
            d = json.load(f)
        if isinstance(d, dict):
            print("Concepts geladen: " + str(len(d)) + " UUIDs aus " + pfad,
                  file=sys.stderr)
            return d
    except (OSError, json.JSONDecodeError) as e:
        print("WARN: concepts-Datei " + pfad + " nicht lesbar: " + str(e),
              file=sys.stderr)
    return {}


def main():
    parser = argparse.ArgumentParser(description="DataHub POIs -> App-Format")
    parser.add_argument("inputs", nargs="*", help="Eingabe-JSON-Dateien (lokal)")
    parser.add_argument("-o", "--output", default="pois-datahub.js",
                        help="Output-Datei (Standard: pois-datahub.js)")
    parser.add_argument("--concepts", default="concepts.json",
                        help="UUID->Label-Datei von download_concepts.py "
                             "(Standard: concepts.json)")
    parser.add_argument("--endpoint", default="gmw-pois-ww",
                        help="DataHub-Endpoint-Slug (Standard: gmw-pois-ww)")
    parser.add_argument("--token", help="DataHub-API-Token (fuer Direkt-Abruf)")
    parser.add_argument("--page-size", type=int, default=100)
    args = parser.parse_args()

    concepts = lade_concepts(args.concepts)
    if not concepts:
        print("WARN: keine Concepts geladen -> Klassifizierungen bleiben leer "
              "und Filter (Spielplatz, Inaktiv) greifen nicht!", file=sys.stderr)

    if args.inputs:
        # Windows: CMD/PowerShell expandieren *.json nicht -> selbst machen
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
            print("FEHLER: keine Eingabe-Dateien gefunden", file=sys.stderr)
            sys.exit(1)
        roh = lade_lokal(expanded)
    elif args.token:
        roh = lade_api(args.endpoint, args.token, args.page_size)
    else:
        print("FEHLER: entweder Dateien angeben ODER --token fuer Direkt-Abruf",
              file=sys.stderr)
        sys.exit(1)

    print("Gelesen: " + str(len(roh)) + " POIs (vor Filter)", file=sys.stderr)

    # Sammle alle Wohn-Orte und ergaenze die METADATA_BLACKLIST dynamisch.
    # Damit fliegen Labels wie 'Dillenburg', 'Haiger', 'Bad Marienberg' raus,
    # die sonst als Kategorien durchsickern wuerden.
    ortsnamen = sammle_ortsnamen(roh)
    METADATA_BLACKLIST_EXACT.update(ortsnamen)
    print("Erkannte Ortsnamen aus Adressen: " + str(len(ortsnamen))
          + " (werden als Metadaten gefiltert)", file=sys.stderr)

    eintraege = []
    skip_gruende = {}
    ohne_geo = 0
    ohne_bild = 0
    ohne_adresse = 0
    cat_haeufigkeit = {}
    feat_haeufigkeit = {}

    for t in roh:
        e, grund = map_poi(t, concepts)
        if e is None:
            skip_gruende[grund] = skip_gruende.get(grund, 0) + 1
            continue

        if e["lat"] is None or e["lng"] is None:
            ohne_geo += 1
        if not e["bild"]:
            ohne_bild += 1
        if not (e["strasse"] or e["plz"] or e["ort"]):
            ohne_adresse += 1
        for c in e["categories"]:
            cat_haeufigkeit[c] = cat_haeufigkeit.get(c, 0) + 1
        for f in e["features"]:
            feat_haeufigkeit[f] = feat_haeufigkeit.get(f, 0) + 1
        eintraege.append(e)

    eintraege.sort(key=lambda x: x["name"].lower())
    schreibe_js(eintraege, args.output)

    print("Geschrieben: " + args.output, file=sys.stderr)
    print("  Aufgenommen:        " + str(len(eintraege)), file=sys.stderr)
    print("  Uebersprungen:", file=sys.stderr)
    for grund in sorted(skip_gruende.keys()):
        print("    " + grund.ljust(28) + str(skip_gruende[grund]), file=sys.stderr)
    print("  Ohne Geo-Koordinaten: " + str(ohne_geo), file=sys.stderr)
    print("  Ohne Bild:           " + str(ohne_bild), file=sys.stderr)
    print("  Ohne Adresse:        " + str(ohne_adresse), file=sys.stderr)

    print("  Top-20 Kategorien (gehen in UI-Filterpillen):", file=sys.stderr)
    top_c = sorted(cat_haeufigkeit.items(), key=lambda x: -x[1])[:20]
    for k, n in top_c:
        print("    " + k.ljust(40) + str(n), file=sys.stderr)
    print("  Top-15 Features (gehen in Ausstattung):", file=sys.stderr)
    top_f = sorted(feat_haeufigkeit.items(), key=lambda x: -x[1])[:15]
    for k, n in top_f:
        print("    " + k.ljust(40) + str(n), file=sys.stderr)


if __name__ == "__main__":
    main()
