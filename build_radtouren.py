#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
build_radtouren.py — Mapper DataHub-RLP Radtouren -> App-Format

Liest entweder lokale JSON-Dateien (eine pro Seite vom Browser-Export) oder
holt die Daten direkt per HTTPS aus dem DataHub-Endpoint
'gmw-radtouren-ww' (braucht --token).

Schreibt eine IIFE-JS-Datei, die sich in window.DATA_RAD_ALLE
einklinkt -- analog zur veranstaltungen-datahub.js und radtouren-datahub.js.

Aufruf (lokal):
    python build_radtouren.py rad-1.json rad-2.json -o radtouren-datahub.js

Aufruf (API):
    python build_radtouren.py --token <TOKEN> -o radtouren-datahub.js
"""

import argparse
import glob
import json
from landkreise_helper import bezirk_aus_koords
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime


# ---------------------------------------------------------------------------
# Tour-Reihen-Erkennung aus dem Namen
# ---------------------------------------------------------------------------

# Pattern -> Bike-Kategorie. Reihenfolge wichtig (spezifischer zuerst). Wird
# spaeter (im App-JS) genutzt, um die Tour in einen von 5 Buckets zu sortieren:
# mountainbike / rennrad / gravelbike / rundradwege / streckenradwege.
KATEGORIE_PATTERNS = [
    (re.compile(r"mountainbike|\bmtb\b|trail",   re.I),  "Mountainbike"),
    (re.compile(r"rennrad|\broad\b",             re.I),  "Rennrad"),
    (re.compile(r"gravel",                         re.I),  "Gravelbike"),
    (re.compile(r"fernradweg|streckenradweg|etappe", re.I),  "Streckenradweg"),
]

def detect_kategorie(name, classifications=None):
    """Leitet die Rad-Kategorie aus Name UND Klassifizierungs-Labels ab.
    Falls keine zutrifft: 'Radtour' (generischer Bucket -> wird im JS nach
    istRundweg in Rund- oder Streckenradwege aufgeteilt).
    """
    haystack = (name or "").strip()
    if classifications:
        haystack = haystack + " || " + " ".join(c for c in classifications if c)
    for pat, label in KATEGORIE_PATTERNS:
        if pat.search(haystack):
            return label
    return "Radtour"


# ---------------------------------------------------------------------------
# WKT-Parser für MULTILINESTRING Z
# ---------------------------------------------------------------------------

def parse_wkt_multilinestring(wkt):
    """Parsing 'MULTILINESTRING Z ((x y z, x y z, ...), (x y z, ...))'.

    Liefert eine Liste von Segmenten. Jedes Segment ist eine Liste von
    Tripeln [lng, lat, hoehe] (5 Nachkommastellen, Höhe als Integer).
    Bei fehlender Höhe nur [lng, lat]. Robust gegenüber kaputten Werten.
    """
    if not wkt or not isinstance(wkt, str):
        return []

    segments = []
    for match in re.finditer(r"\(([^()]+)\)", wkt):
        seg = []
        for coord_str in match.group(1).split(","):
            parts = coord_str.strip().split()
            if len(parts) < 2:
                continue
            try:
                lng = round(float(parts[0]), 5)
                lat = round(float(parts[1]), 5)
            except ValueError:
                continue
            if len(parts) >= 3:
                try:
                    elev = int(round(float(parts[2])))
                    seg.append([lng, lat, elev])
                    continue
                except (ValueError, OverflowError):
                    pass
            seg.append([lng, lat])
        if seg:
            segments.append(seg)
    return segments


# ---------------------------------------------------------------------------
# Helper: HTML säubern → Plain-Text mit erhaltenen Absätzen
# ---------------------------------------------------------------------------

# <p>, <br> in Zeilenumbrüche umwandeln; <li> als "• "; Rest entfernen
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
    """Entfernt HTML-Tags, behält Absätze und Aufzählungspunkte als Klartext."""
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
# Kern: ein DataHub-Tour-Datensatz → ein App-Eintrag
# ---------------------------------------------------------------------------


def _classifications_of(t):
    """Sammelt alle Klassifizierungs-Labels eines Tour-Datensatzes als Strings."""
    raw = t.get("dc:classification") or t.get("classification") or []
    out = []
    if isinstance(raw, list):
        for c in raw:
            if isinstance(c, dict):
                lbl = c.get("name") or c.get("dc:title") or c.get("title") or c.get("@id") or ""
                if lbl: out.append(str(lbl))
            elif isinstance(c, str):
                out.append(c)
    elif isinstance(raw, dict):
        lbl = raw.get("name") or raw.get("dc:title") or ""
        if lbl: out.append(str(lbl))
    return out

def safe_int(v, default=0):
    try:
        return int(round(float(v)))
    except (TypeError, ValueError):
        return default


def safe_float(v, default=0.0, ndigits=1):
    try:
        return round(float(v), ndigits)
    except (TypeError, ValueError):
        return default


def map_tour(t):
    uid  = t.get("@id", "") or ""
    name = (t.get("name") or "").strip()
    slug = t.get("dc:slug") or t.get("dc:slugifiedName") or ""

    # 1. Geometrie
    geo  = t.get("geo") or {}
    wkt  = geo.get("line", "") if isinstance(geo, dict) else ""
    track = parse_wkt_multilinestring(wkt)

    # 2. Start-Punkt aus erstem Track-Punkt
    start_lat = None
    start_lng = None
    if track and track[0]:
        first = track[0][0]
        start_lng = first[0]
        start_lat = first[1]
    # Bezirk anhand des Startpunkts vorberechnen (AK/NR/WW oder None)
    _bezirk_tour = bezirk_aus_koords(start_lat, start_lng) if (start_lat and start_lng) else None
    if _bezirk_tour is None:
        # Tour startet ausserhalb AK/NR/WW. Da die DataHub-Quelle ausschliesslich
        # Touren aus dem Westerwald-Raum liefert, ist das praktisch immer der
        # hessische Westerwald-Teil (Lahn-Dill-Kreis, Limburg-Weilburg).
        _bezirk_tour = "HE"

    # 3. Bilder -- alle Bilder aus image[] als Slideshow-Liste extrahieren,
    # zusaetzlich erstes Bild als Listing-Thumbnail
    img_list = t.get("image") or []
    if isinstance(img_list, dict): img_list = [img_list]
    bilder_alle = []
    for _im in img_list:
        if not isinstance(_im, dict): continue
        _url = _im.get("dc:webUrl") or _im.get("contentUrl") or ""
        if not _url: continue
        _au = _im.get("author")
        if isinstance(_au, dict): _au = _au.get("name", "") if _au.get("name") else ""
        elif isinstance(_au, list):
            _au = next((x.get("name", "") for x in _au if isinstance(x, dict) and x.get("name")), "")
        bilder_alle.append({
            "url":     _url,
            "autor":   str(_au or _im.get("source") or "").strip(),
            "lizenz":  str(_im.get("license") or _im.get("sdLicense") or _im.get("copyrightNotice") or "").strip(),
            "caption": str(_im.get("caption") or "").strip()
        })
    img = img_list[0] if img_list and isinstance(img_list[0], dict) else {}
    bild         = bilder_alle[0]["url"] if bilder_alle else ""
    thumb        = img.get("thumbnailUrl") or ""
    bild_lizenz  = bilder_alle[0]["lizenz"] if bilder_alle else ""
    bild_urheber = bilder_alle[0]["autor"] if bilder_alle else ""

    # 4. Numerische Metriken (Fallback auf dc:-Variante)
    laenge_m  = t.get("length")    or t.get("dc:length")    or 0
    aufstieg  = t.get("ascent")    or t.get("dc:ascent")    or 0
    abstieg   = t.get("descent")   or t.get("dc:descent")   or 0
    dauer_min = t.get("duration")  or t.get("dc:duration")  or 0
    min_h     = t.get("minAltitude") or t.get("dc:minAltitude") or 0
    max_h     = t.get("maxAltitude") or t.get("dc:maxAltitude") or 0

    return {
        "id":              "dh-" + uid,
        "slug":            slug,
        "titel":           name,
        "kategorie":       detect_kategorie(name, _classifications_of(t)),

        # Metriken
        "laengeKm":        safe_float(laenge_m / 1000.0 if laenge_m else 0, ndigits=1),
        "laengeMeter":     safe_int(laenge_m),
        "hoehenmeterAuf":  safe_int(aufstieg),
        "hoehenmeterAb":   safe_int(abstieg),
        "dauerMin":        safe_int(dauer_min),
        "minHoehe":        safe_int(min_h),
        "maxHoehe":        safe_int(max_h),

        # Bewertungen (1-5, 0 = nicht bewertet)
        "schwierigkeit":         safe_int(t.get("difficultyRating")),
        "bewertungLandschaft":   safe_int(t.get("landscapeRating")),
        "bewertungErlebnis":     safe_int(t.get("experienceRating")),
        "bewertungWege":         safe_int(t.get("conditionRating")),

        "istRundweg":   bool(t.get("odta:circularTrail")),

        # Texte
        "beschreibung":  strip_html(t.get("description", "")),
        "text":          strip_html(t.get("text", "")),
        "anreise":       strip_html(t.get("directionsPublicTransport", "")),
        "ausruestung":   strip_html(t.get("equipment", "")),
        "hinweise":      strip_html(t.get("safetyInstructions", "")),
        "empfehlung":    strip_html(t.get("suggestion", "")),
        "hinweistext":   strip_html(t.get("instructions", "")),

        # Bild
        "bild":          bild,
        "bilder":        bilder_alle,
        "thumb":         thumb,
        "bildLizenz":    bild_lizenz,
        "bildUrheber":   bild_urheber,

        # Geo
        "startLat":      start_lat,
        "startLng":      start_lng,
        "bezirk":        _bezirk_tour,
        "track":         track,   # [[ [lng,lat,h], ... ], [ ... ]]  (GeoJSON-Reihenfolge)

        # Externer Verweis
        "url":           t.get("url") or "",
    }


# ---------------------------------------------------------------------------
# Output: IIFE-Datei mit Merge-Logik in window.DATA_RAD_ALLE
# ---------------------------------------------------------------------------

def schreibe_js(eintraege, output_path):
    payload_json = json.dumps(eintraege, ensure_ascii=False, separators=(",", ":"))
    stand = datetime.now().isoformat(timespec="seconds")
    js_code = (
        "// ════════════════════════════════════════════════════════════════\n"
        "// AUTO-GENERIERT von build_radtouren.py — nicht von Hand editieren!\n"
        "// Stand: " + stand + "\n"
        "// Quelle: DataHub RLP, gespeicherte Suche 'gmw-radtouren-ww'\n"
        "// Anzahl Radtouren: " + str(len(eintraege)) + "\n"
        "// ════════════════════════════════════════════════════════════════\n"
        "(function() {\n"
        "  if (!window.DATA_RAD_ALLE) window.DATA_RAD_ALLE = [];\n"
        "  if (window.__DATA_RAD_DATAHUB_GELADEN) {\n"
        "    console.warn('[Radtouren DATAHUB] Datei wurde bereits geladen, ueberspringe Merge.');\n"
        "    return;\n"
        "  }\n"
        "  window.__DATA_RAD_DATAHUB_GELADEN = true;\n"
        "\n"
        "  var neu = " + payload_json + ";\n"
        "  var bestand = window.DATA_RAD_ALLE;\n"
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
        "  console.log('[Radtouren DATAHUB] Bestand vorher: ' + vorher\n"
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


def lade_api(endpoint_slug, token, page_size=250, max_pages=10):
    """Holt alle Seiten ueber HTTPS mit Token-Authentifizierung."""
    base = "https://data.rlp-tourismus.de/api/v4/endpoints/" + endpoint_slug
    include = "image,location,dc:additionalInformation"
    fields  = "*,image.*,location.*,dc:additionalInformation.*"
    alle = []
    for page in range(1, max_pages + 1):
        params = {
            "page[size]":   str(page_size),
            "page[number]": str(page),
            "include":      include,
            "fields":       fields,
        }
        # Brackets und Doppelpunkte korrekt encoden
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
              + " Touren (gesamt: " + str(len(alle)) + "/" + str(total) + ")",
              file=sys.stderr)
        if total and len(alle) >= total:
            break
        if len(graph) < page_size:
            break
    return alle


def main():
    parser = argparse.ArgumentParser(description="DataHub Wandertouren → App-Format")
    parser.add_argument("inputs", nargs="*", help="Eingabe-JSON-Dateien (lokal)")
    parser.add_argument("-o", "--output", default="radtouren-datahub.js",
                        help="Output-Datei (Standard: radtouren-datahub.js)")
    parser.add_argument("--endpoint", default="gmw-radtouren-ww",
                        help="DataHub-Endpoint-Slug (Standard: gmw-radtouren-ww)")
    parser.add_argument("--token", help="DataHub-API-Token (für Direkt-Abruf)")
    parser.add_argument("--page-size", type=int, default=250)
    args = parser.parse_args()

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

    print("Gelesen: " + str(len(roh)) + " Touren", file=sys.stderr)

    eintraege = []
    ohne_track = 0
    ohne_bild  = 0
    track_punkte_summe = 0
    kategorien = {}
    for t in roh:
        e = map_tour(t)
        if not e["track"]:
            ohne_track += 1
        if not e["bild"]:
            ohne_bild += 1
        for seg in e["track"]:
            track_punkte_summe += len(seg)
        kategorien[e["kategorie"]] = kategorien.get(e["kategorie"], 0) + 1
        eintraege.append(e)

    # Sortiert: zuerst nach Tour-Reihe, innerhalb nach Titel
    eintraege.sort(key=lambda x: (x["kategorie"], x["titel"].lower()))

    schreibe_js(eintraege, args.output)

    print("Geschrieben: " + args.output, file=sys.stderr)
    print("  Eintraege:           " + str(len(eintraege)), file=sys.stderr)
    print("  Ohne Track:          " + str(ohne_track), file=sys.stderr)
    print("  Ohne Bild:           " + str(ohne_bild), file=sys.stderr)
    print("  Track-Punkte total:  " + str(track_punkte_summe), file=sys.stderr)
    print("  Kategorie-Verteilung:", file=sys.stderr)
    for r in sorted(kategorien.keys()):
        print("    " + r.ljust(28) + str(kategorien[r]), file=sys.stderr)


if __name__ == "__main__":
    main()
