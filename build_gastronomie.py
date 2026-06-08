#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
build_unterkuenfte.py — Mapper DataHub-RLP Unterkuenfte -> App-Format

Liest entweder lokale JSON-Dateien (eine pro Seite vom Browser-Export) oder
holt die Daten direkt per HTTPS aus dem DataHub-Endpoint
'gmw-unterkuenfte-ww' (braucht --token).

Schreibt eine IIFE-JS-Datei, die sich in window.DATA_UNTERKUENFTE_ALLE einklinkt.

FILTER (im Mapper):
  * Inaktive Eintraege werden uebersprungen

Output-Schema fuer renderUnterkunftDetail:
  { name, categories[], features[], description, lat, lng,
    contact: {phone, email, url}, ort, bild, bildUrheber, bildLizenz }

Aufruf (lokal):
    python build_unterkuenfte.py unterkuenfte-1.json unterkuenfte-2.json -o unterkuenfte-datahub.js

Aufruf (API):
    python build_unterkuenfte.py --token <TOKEN> -o unterkuenfte-datahub.js
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
# Konfiguration
# ---------------------------------------------------------------------------

# Diese Klassifikations-Labels sind Metadaten (Lizenz, Datenquelle, Region,
# Zielgruppen-Marker) und gehoeren NICHT in die UI-Filterpillen.
METADATA_BLACKLIST_EXACT = {
    "aktiv", "inaktiv",
    "open data", "internet", "katalog",
    "lokaler expertclient", "infomedia/informator",
    "westerwald", "westerwald - ganz nach deiner natur!",
    "cc by-sa", "cc by", "cc0", "cc0 universell",
    "online buchbarkeit", "buchbar",
    "germany",
    # Inhaltstyp-Marker
    "unterkunft", "gastronomischer betrieb", "gastronomy", "gastronomie",
    "place", "lodgingbusiness", "foodestablishment",
    # Generische Sammelbegriffe
    "essen & trinken", "kulinarisch",
    "indoor", "outdoor",
    # Saison-Marker
    "ganzjährig", "sommer", "winter", "frühling", "herbst",
    # Touristik-Regionen + Marketing-Marker
    "naturregion sieg",
    "natur & aktiv (saisonverlängerung)",
    "rheinburgenweg-partner",
    "westerwald-steig partner",
}

# Tags mit diesen Prefixen sind ebenfalls Metadaten -> rausfiltern
METADATA_BLACKLIST_PREFIX = (
    "zg ",                       # Zielgruppen-Marker
    "cc by-sa namensnennung",    # Lizenz-Variante
    "cc by namensnennung",
    "westerwald - ganz nach",
)

# Tags die typische "Ausstattung" / Amenity sind -> in features[]
# Alles andere bleibt in categories[]
# Erweitert auf Basis der realen Labels aus concepts.json
AMENITY_KEYWORDS = (
    # Internet/Tech
    "wifi", "wlan", "internet",
    "satelliten", "sat-tv", "sat tv", "kabel-tv",
    # Tiere
    "haustier", "tiere erlaubt", "hund", "pferde",
    # Familie
    "famil", "kinder", "kinderhochstuhl", "wickelauflage", "babybett", "kinderbett",
    # Zielgruppen (relevant für Auswahl der Unterkunft)
    "reisende", "einzelreis", "geschäftsreis", "geschaeftsreis", "monteur",
    "senioren", "jugendliche", "jugend",
    "single", "gruppe",
    # Lage
    "ruhig", "ortsrand", "zentral", "stadtmitte",
    "wanderweg", "am wand", "fluss", "see",
    # Sprache vor Ort -- bei Unterkuenften wichtig, bei POIs eher uninteressant
    "deutsch", "englisch", "französisch", "französ", "italienisch", "spanisch",
    "niederländisch", "polnisch", "russisch",
    # Barrierefreiheit
    "behindert", "barrierefrei", "rollstuhl", "aufzug", "lift",
    "optische bestätigung", "notruf",
    # Rauchen
    "raucher",
    # Außen/Innen
    "parkplatz", "garten", "terrasse", "balkon", "liegewiese", "wiese",
    "grillplatz", "grillmöglichkeit", "grill",
    "außengastronomie", "aussengastronomie", "biergarten", "sonnenschirm",
    # E-Mobil
    "ladestation", "e-ladestation", "ladesaeule", "akku", "wechselstation",
    # Hausgeraete + Service-Räume
    "waschmaschin", "trockner", "trockenraum", "spülmaschin", "spuelmaschin", "wäsche",
    "handtuch", "handtüch",
    # Komfort
    "klima", "heizung", "homeoffice",
    # Aktiv-Tourismus
    "wandern", "fahrrad", "rad", "bett+bike", "bett+rad", "wäller touren",
    "westerwald-steig", "rheinburgenweg", "westerwald partner",
    "mitgliedschaft", "wiedtal", "partner",
    # Verpflegung + Eigenes Restaurant/Café
    "frühstück", "frühstuck", "halbpension", "vollpension", "brunch", "mittagstisch",
    "vegetarisch", "vegan", "glutenfrei", "diät", "schonkost",
    "lieferdienst", "abholservice", "lieferservice", "catering",
    "eigenes restaurant", "eigene küche",
    # Zahlungs-Optionen
    "ec-cash", "ec cash", "maestro", "kreditkart", "paypal", "barzahl", "zahlung",
    "fairer", "rechnung", "abrechnung",
    # Wellness / Wohlbefinden
    "sauna", "hallenbad", "wellness", "spa", "solarium", "kosmetik", "massage",
    # Sport / Spiel
    "spielplatz", "kegel", "billard", "tennis", "minigolf", "fitness",
    # Tagung
    "tagungs", "konferenz", "event", "hochzeitsloc", "seminar",
    "flip-chart", "flipchart", "beamer", "leinwand",
    # Service
    "gepäck", "transfer", "wäschedienst", "concierge",
    "liegestuhl", "liegestühle",
    # Online
    "online buchb", "online shop", "buchungsplattform",
    # Camping / Mobil
    "wohnmobil", "stellplatz", "dauerstellplatz",
    # Nachhaltigkeit
    "tourcert", "nachhaltig", "mindestens 80",
    "fenster", "verglast",
    "müll", "mülltrenn", "recycling",
    "ökologi", "umwelt", "energie", "solar", "photovoltaik", "geothermie",
    "wärmepump", "wärme", "windenergie", "led",
    "raum mit", "raum für",
    # Sonstige Services
    "verleih", "reparatur", "stempelstell",
    "ladegerät", "einstellplatz",
    # Service-Marker
    "kostenlos", "schonkost",
)


# ---------------------------------------------------------------------------
# Helper: HTML säubern
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
    if not s: return ""
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
# Helper: Klassifizierungen sammeln und in categories/features sortieren
# ---------------------------------------------------------------------------

def alle_klassen(t, concepts):
    """Sammelt alle Klassifizierungs-Labels und loest UUIDs via concepts-Dict auf."""
    out = []
    for feld in ("dc:classification", "classification", "category"):
        raw = t.get(feld) or []
        if isinstance(raw, list):
            for c in raw:
                if isinstance(c, dict):
                    lbl = c.get("name") or c.get("dc:title") or c.get("title") or ""
                    if not lbl:
                        uid = c.get("@id", "")
                        lbl = concepts.get(uid, "")
                    if lbl: out.append(str(lbl))
                elif isinstance(c, str):
                    out.append(c)
        elif isinstance(raw, dict):
            lbl = raw.get("name") or raw.get("dc:title") or ""
            if lbl: out.append(str(lbl))
    # Dedup, Reihenfolge beibehalten
    seen = set(); uniq = []
    for x in out:
        k = x.lower()
        if k not in seen:
            seen.add(k); uniq.append(x)
    return uniq


def ist_uppercase_ortsname(label):
    """Heuristik fuer Ortsnamen in komplett-Grossbuchstaben."""
    if not label or len(label) < 6:
        return False
    if not label.isupper():
        return False
    erlaubt = set(" -ÄÖÜß/")
    for ch in label:
        if not (ch.isalpha() or ch in erlaubt):
            return False
    return True


def ist_metadata(label):
    """True wenn das Label ein Datenpflege-/Lizenz-/Quelle-Marker ist."""
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
        elif len(k) > 30:
            # Lange beschreibende Strings sind eher Features als UI-Filterpillen
            # (z.B. "Alle Fenster sind doppelt verglast", "Einsatz von Solaranlagen...")
            features.append(k)
        else:
            categories.append(k)
    return categories, features


def ist_aktiv(klassen):
    """Inaktive Eintraege herausfiltern."""
    lower = [k.lower() for k in klassen]
    return not ("inaktiv" in lower and "aktiv" not in lower)


# ---------------------------------------------------------------------------
# Helper: Geometrie
# ---------------------------------------------------------------------------

_RE_WKT_POINT = re.compile(r"POINT\s*\(\s*([\d.\-]+)\s+([\d.\-]+)", re.I)

def parse_geo(t):
    geo = t.get("geo") or {}
    if not isinstance(geo, dict): return None, None
    for feld in ("point", "location", "line"):
        wkt = geo.get(feld)
        if isinstance(wkt, str) and wkt.upper().startswith("POINT"):
            m = _RE_WKT_POINT.search(wkt)
            if m:
                try:
                    lng = round(float(m.group(1)), 5)
                    lat = round(float(m.group(2)), 5)
                    return lat, lng
                except ValueError: pass
    for lat_feld, lng_feld in (("latitude", "longitude"), ("lat", "lng"), ("lat", "lon")):
        if lat_feld in geo and lng_feld in geo:
            try:
                return round(float(geo[lat_feld]), 5), round(float(geo[lng_feld]), 5)
            except (ValueError, TypeError): pass
    return None, None


# ---------------------------------------------------------------------------
# Helper: Adresse
# ---------------------------------------------------------------------------

def parse_adresse(t):
    addr = t.get("address") or t.get("dc:address") or {}
    if isinstance(addr, list) and addr: addr = addr[0]
    if not isinstance(addr, dict): addr = {}
    strasse = (addr.get("streetAddress") or addr.get("dc:streetAddress")
               or t.get("streetAddress") or t.get("dc:streetAddress") or "")
    plz = (addr.get("postalCode") or addr.get("dc:postalCode")
           or t.get("postalCode") or t.get("dc:postalCode") or "")
    ort = (addr.get("addressLocality") or addr.get("dc:addressLocality")
           or t.get("addressLocality") or t.get("dc:addressLocality") or "")
    return str(strasse).strip(), str(plz).strip(), str(ort).strip()


# ---------------------------------------------------------------------------
# Kern-Mapping
# ---------------------------------------------------------------------------

def map_eintrag(t, concepts):
    name = (t.get("name") or "").strip()
    if not name:
        return None, "kein name"

    klassen = alle_klassen(t, concepts)
    if not ist_aktiv(klassen):
        return None, "inaktiv"

    categories, features = sortiere_klassen(klassen)
    lat, lng = parse_geo(t)
    strasse, plz, ort = parse_adresse(t)

    # Bild(er) -- DataHub liefert ALLE Bilder im image[]-Array. Wir
    # extrahieren erstes als Listing-Thumbnail (bild/thumb), plus die
    # komplette Liste als bilder[] fuer die Slideshow im Detail-View.
    img_list = t.get("image") or []
    if isinstance(img_list, dict): img_list = [img_list]
    bilder_alle = []
    for img in img_list:
        if not isinstance(img, dict): continue
        url = img.get("dc:webUrl") or img.get("contentUrl") or ""
        if not url: continue
        # author kann string oder dict sein
        au = img.get("author")
        if isinstance(au, dict): au = au.get("name", "")
        # rights kann ebenfalls dict sein
        cr = img.get("copyrightHolder")
        if isinstance(cr, dict): cr = cr.get("name", "")
        bilder_alle.append({
            "url":     url,
            "autor":   str(au or cr or img.get("source") or "").strip(),
            "lizenz":  str(img.get("license") or img.get("sdLicense") or img.get("copyrightNotice") or "").strip(),
            "caption": str(img.get("caption") or "").strip()
        })
    img = img_list[0] if img_list and isinstance(img_list[0], dict) else {}
    bild = bilder_alle[0]["url"] if bilder_alle else ""
    thumb = img.get("thumbnailUrl") or ""
    bild_lizenz = bilder_alle[0]["lizenz"] if bilder_alle else ""
    bild_urheber = bilder_alle[0]["autor"] if bilder_alle else ""

    # Kontakt -- bei DataHub steht Tel/Mail/URL meistens im verschachtelten address-Objekt
    addr = t.get("address") or t.get("dc:address") or {}
    if isinstance(addr, list) and addr: addr = addr[0]
    if not isinstance(addr, dict): addr = {}
    tel = (addr.get("telephone") or addr.get("dc:telephone")
           or t.get("telephone") or t.get("dc:telephone") or "")
    mail = (addr.get("email") or addr.get("dc:email")
            or t.get("email") or t.get("dc:email") or "")
    web = (addr.get("url") or addr.get("dc:url")
           or t.get("url") or t.get("dc:url") or "")

    # Beschreibung: bevorzugt 'text' (lang), Fallback 'description'
    desc_lang = strip_html(t.get("text", ""))
    desc_kurz = strip_html(t.get("description", ""))
    description = desc_lang or desc_kurz

    uid = t.get("@id", "") or ""
    slug = t.get("dc:slug") or t.get("dc:slugifiedName") or ""

    eintrag = {
        "id":          "dh-" + uid,
        "slug":        slug,
        "name":        name,
        "categories":  categories,
        "features":    features,
        "description": description,
        "strasse":     strasse,
        "plz":         plz,
        "ort":         ort,
        "bezirk":      bezirk_aus_plz_ort(plz, ort),
        "lat":         lat,
        "lng":         lng,
        "contact": {
            "phone": str(tel).strip(),
            "email": str(mail).strip(),
            "url":   str(web).strip()
        },
        "bild":        bild,
        "thumb":       thumb,
        "bilder":      bilder_alle,
        "bildLizenz":  bild_lizenz,
        "bildUrheber": bild_urheber
    }
    return eintrag, "ok"


# ---------------------------------------------------------------------------
# JS-Output
# ---------------------------------------------------------------------------

def schreibe_js(eintraege, output_path, var_name, endpoint_slug, label_singular):
    payload_json = json.dumps(eintraege, ensure_ascii=False, separators=(",", ":"))
    stand = datetime.now().isoformat(timespec="seconds")
    geladen_flag = "__DATA_" + var_name.replace("DATA_", "") + "_GELADEN"
    js_code = (
        "// ════════════════════════════════════════════════════════════════\n"
        "// AUTO-GENERIERT — nicht von Hand editieren!\n"
        "// Stand: " + stand + "\n"
        "// Quelle: DataHub RLP, gespeicherte Suche '" + endpoint_slug + "'\n"
        "// Anzahl " + label_singular + ": " + str(len(eintraege)) + "\n"
        "// ════════════════════════════════════════════════════════════════\n"
        "(function() {\n"
        "  if (!window." + var_name + ") window." + var_name + " = [];\n"
        "  if (window." + geladen_flag + ") {\n"
        "    console.warn('[" + label_singular + " DATAHUB] Datei bereits geladen, ueberspringe.');\n"
        "    return;\n"
        "  }\n"
        "  window." + geladen_flag + " = true;\n"
        "  var neu = " + payload_json + ";\n"
        "  var bestand = window." + var_name + ";\n"
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
        "  console.log('[" + label_singular + " DATAHUB] vorher=' + vorher + ', neu=' + neu.length + ', hinzugefuegt=' + hinzu + ', dedup=' + dedup + ', nachher=' + bestand.length);\n"
        "})();\n"
    )
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(js_code)


# ---------------------------------------------------------------------------
# I/O + Main
# ---------------------------------------------------------------------------

def lade_lokal(pfade):
    alle = []
    for p in pfade:
        with open(p, "r", encoding="utf-8") as f:
            d = json.load(f)
        graph = d.get("@graph") if isinstance(d, dict) else None
        if isinstance(graph, list): alle.extend(graph)
        elif isinstance(d, list):   alle.extend(d)
    return alle


def lade_api(endpoint_slug, token, page_size=100, max_pages=20):
    base = "https://data.rlp-tourismus.de/api/v4/endpoints/" + endpoint_slug
    include = "image,location,dc:additionalInformation,address"
    fields = "*,image.*,location.*,dc:additionalInformation.*,address.*"
    alle = []
    for page in range(1, max_pages + 1):
        params = {"page[size]": str(page_size), "page[number]": str(page),
                  "include": include, "fields": fields}
        q = urllib.parse.urlencode(params, quote_via=urllib.parse.quote)
        url = base + "?" + q
        req = urllib.request.Request(url)
        if token: req.add_header("Authorization", 'Token token="' + token + '"')
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
              + " (gesamt: " + str(len(alle)) + "/" + str(total) + ")", file=sys.stderr)
        if total and len(alle) >= total: break
        if len(graph) < page_size: break
    return alle


def sammle_ortsnamen(roh):
    """Sammelt addressLocality-Werte fuer dynamisches Metadaten-Filtern."""
    orte = set()
    for t in roh:
        addr = t.get("address") or t.get("dc:address") or {}
        if isinstance(addr, list) and addr: addr = addr[0]
        if isinstance(addr, dict):
            ort = str(addr.get("addressLocality") or addr.get("dc:addressLocality") or "").strip()
            if ort:
                orte.add(ort.lower())
                for teil in ort.replace("/", "-").split("-"):
                    teil = teil.strip()
                    if teil and len(teil) >= 4:
                        orte.add(teil.lower())
        ort = str(t.get("addressLocality") or t.get("dc:addressLocality") or "").strip()
        if ort:
            orte.add(ort.lower())
    return orte


def lade_concepts(pfad):
    if not pfad: return {}
    try:
        with open(pfad, "r", encoding="utf-8") as f:
            d = json.load(f)
        if isinstance(d, dict):
            print("Concepts geladen: " + str(len(d)) + " UUIDs aus " + pfad,
                  file=sys.stderr)
            return d
    except (OSError, json.JSONDecodeError) as e:
        print("WARN: concepts-Datei nicht lesbar: " + str(e), file=sys.stderr)
    return {}


def main():
    parser = argparse.ArgumentParser(description="DataHub Unterkuenfte/Gastronomie -> App-Format")
    parser.add_argument("inputs", nargs="*")
    parser.add_argument("-o", "--output", required=True)
    parser.add_argument("--concepts", default="concepts.json",
                        help="UUID->Label-Datei von download_concepts.py")
    parser.add_argument("--endpoint", default="gmw-unterkuenfte-ww",
                        help="DataHub-Endpoint-Slug (Standard: gmw-unterkuenfte-ww)")
    parser.add_argument("--var", default="DATA_GASTRONOMIE_ALLE",
                        help="window-Variable (Standard: DATA_GASTRONOMIE_ALLE)")
    parser.add_argument("--label", default="Unterkuenfte",
                        help="Label fuer Konsolen-Logs")
    parser.add_argument("--token")
    parser.add_argument("--page-size", type=int, default=100)
    args = parser.parse_args()

    concepts = lade_concepts(args.concepts)
    if not concepts:
        print("WARN: keine Concepts geladen -> Klassifizierungen bleiben leer!",
              file=sys.stderr)

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
        print("FEHLER: Dateien oder --token noetig", file=sys.stderr); sys.exit(1)

    print("Gelesen: " + str(len(roh)), file=sys.stderr)

    # Wohn-Orte sammeln und dynamisch aus den Kategorie-Pillen filtern
    ortsnamen = sammle_ortsnamen(roh)
    METADATA_BLACKLIST_EXACT.update(ortsnamen)
    print("Erkannte Ortsnamen aus Adressen: " + str(len(ortsnamen))
          + " (werden als Metadaten gefiltert)", file=sys.stderr)

    eintraege = []
    skip_gruende = {}
    ohne_geo = 0; ohne_bild = 0; ohne_adresse = 0
    cat_haeufigkeit = {}; feat_haeufigkeit = {}
    for t in roh:
        e, grund = map_eintrag(t, concepts)
        if e is None:
            skip_gruende[grund] = skip_gruende.get(grund, 0) + 1
            continue
        if e["lat"] is None: ohne_geo += 1
        if not e["bild"]:    ohne_bild += 1
        if not (e["strasse"] or e["plz"] or e["ort"]): ohne_adresse += 1
        for c in e["categories"]: cat_haeufigkeit[c] = cat_haeufigkeit.get(c, 0) + 1
        for f in e["features"]:   feat_haeufigkeit[f] = feat_haeufigkeit.get(f, 0) + 1
        eintraege.append(e)

    eintraege.sort(key=lambda x: x["name"].lower())
    schreibe_js(eintraege, args.output, args.var, args.endpoint, args.label)

    print("Geschrieben: " + args.output, file=sys.stderr)
    print("  Aufgenommen:        " + str(len(eintraege)), file=sys.stderr)
    print("  Uebersprungen:", file=sys.stderr)
    for grund in sorted(skip_gruende.keys()):
        print("    " + grund.ljust(28) + str(skip_gruende[grund]), file=sys.stderr)
    print("  Ohne Geo:           " + str(ohne_geo), file=sys.stderr)
    print("  Ohne Bild:          " + str(ohne_bild), file=sys.stderr)
    print("  Ohne Adresse:       " + str(ohne_adresse), file=sys.stderr)
    print("  Top-15 Kategorien (gehen in UI-Filterpillen):", file=sys.stderr)
    for k, n in sorted(cat_haeufigkeit.items(), key=lambda x: -x[1])[:15]:
        print("    " + k.ljust(40) + str(n), file=sys.stderr)
    print("  Top-15 Features (gehen in Ausstattung):", file=sys.stderr)
    for k, n in sorted(feat_haeufigkeit.items(), key=lambda x: -x[1])[:15]:
        print("    " + k.ljust(40) + str(n), file=sys.stderr)


if __name__ == "__main__":
    main()
