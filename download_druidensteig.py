#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
download_druidensteig.py — Zweiter, gezielter DataHub-Abruf fuer den Druidensteig.

Hintergrund: Der Haupt-Endpoint 'gmw-wandertouren-ww' ist auf die Region
Westerwald gefiltert und liefert daher nur eine einzige Druidensteig-Etappe.
Dieser Abruf nutzt eine ZWEITE gespeicherte Suche (NICHT region-gefiltert,
dafuer auf den Druidensteig eingegrenzt) und holt so den kompletten Streckenzug.

Es werden uebernommen:
  * die 7 Etappen          ("Druidensteig - Etappe 1" ... "Druidensteig - Etappe 7")
  * die Gesamtroute (94 km) ("Druidensteig - Mit rund 94 km die laengste ...")

Ausgeschlossen werden Rundwege/Rundtouren, die zwar "Druidensteig" tragen,
aber nicht zum durchgehenden Streckenzug gehoeren.

Die Ausgabedatei heisst 'wandern-druiden-1.json' und faellt absichtlich unter
das Glob-Muster 'wandern-*.json'. Der bestehende Build
    python build_wandertouren.py wandern-*.json -o wandertouren-datahub.js
liest sie automatisch mit ein, dedupliziert ueber slug/id und erkennt die
Tour-Reihe 'Druidensteig' am Titel. KEINE Aenderung am Build noetig.

Auth identisch zum Haupt-Downloader: DATAHUB_TOKEN (Bearer) bzw.
DATAHUB_USER + DATAHUB_PASS (Basic) aus den Umgebungsvariablen/Secrets.

Verwendung:
    python download_druidensteig.py
"""

import base64
import getpass
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request


# ─── KONFIGURATION ───────────────────────────────────────────────────────────

# >>> HIER DEN SLUG DER NEUEN GESPEICHERTEN SUCHE EINTRAGEN <<<
# Alternativ ueber Umgebungsvariable DRUIDEN_ENDPOINT_SLUG setzen.
ENDPOINT_SLUG = os.environ.get(
    "DRUIDEN_ENDPOINT_SLUG",
    "cf427ab5-a702-4318-abe1-aaa07b0556be"   # gespeicherte Suche "gmw-wandertouren-druidensteig"
).strip()

PAGE_SIZE     = 50                          # alle Treffer passen auf 1 Seite
ANZ_SEITEN    = 2                           # Sicherheitspuffer; bricht sauber ab
OUTPUT_DIR    = "."
DATEINAMEN    = "wandern-druiden-{n}.json"  # faellt unter wandern-*.json

PAUSE_NACH_ERFOLG_SEK = 15
PAUSE_NACH_429_SEK    = 300
MAX_RETRIES_PRO_SEITE = 4
REQUEST_TIMEOUT_SEK   = 90

# Exakt wie beim Haupt-Downloader, damit Koordinaten/Tracks identisch geparst werden
INCLUDE = "image,location,dc:additionalInformation"
FIELDS  = "*,image.*,location.*,dc:additionalInformation.*"

USER_AGENT = "GuckMaWesterwald-Downloader/1.0"

# ─── TITEL-FILTER ────────────────────────────────────────────────────────────
# Behalten: Titel beginnt mit "Druidensteig" + Trennstrich (Bindestrich oder
# Gedankenstrich). Das trifft sowohl die Etappen ("Druidensteig - Etappe N ...")
# als auch die Gesamtroute ("Druidensteig - Mit rund 94 km ...").
KEEP_REGEX = re.compile(r"^\s*Druidensteig\s*[-\u2013\u2014]\s*", re.I)
# Trotzdem ausschliessen: Rundwege / Rundtouren (falls eine solche zufaellig
# "Druidensteig - ..." heisst). "Mit rund 94 km" wird NICHT getroffen,
# da hier auf das ganze Wort Rundweg/Rundtour geprueft wird.
EXCLUDE_REGEX = re.compile(r"\b(rundweg|rundtour|rundwanderweg|rundwander)\b", re.I)


# ─── HELPER ──────────────────────────────────────────────────────────────────

def baue_url(seite):
    base = "https://data.rlp-tourismus.de/api/v4/endpoints/" + ENDPOINT_SLUG
    params = {
        "page[size]":   str(PAGE_SIZE),
        "page[number]": str(seite),
        "include":      INCLUDE,
        "fields":       FIELDS,
    }
    q = urllib.parse.urlencode(params, quote_via=urllib.parse.quote)
    return base + "?" + q


def hole_seite(seite, auth_header):
    url = baue_url(seite)
    req = urllib.request.Request(url)
    req.add_header("Authorization", auth_header)
    req.add_header("Accept", "application/json")
    req.add_header("User-Agent", USER_AGENT)
    try:
        with urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT_SEK) as resp:
            return resp.status, json.load(resp)
    except urllib.error.HTTPError as e:
        return e.code, None
    except urllib.error.URLError as e:
        print("    Netzwerkfehler: " + str(e), file=sys.stderr)
        return 0, None


def schreibe_datei(pfad, daten):
    with open(pfad, "w", encoding="utf-8") as f:
        json.dump(daten, f, ensure_ascii=False, indent=2)


def behalten_pruefen(name):
    """True, wenn der Titel zum Druidensteig-Streckenzug gehoert (Etappe oder Gesamtroute)."""
    n = (name or "").strip()
    if not KEEP_REGEX.search(n):
        return False
    if EXCLUDE_REGEX.search(n):
        return False
    return True


def filtere_streckenzug(daten):
    """Reduziert @graph auf die 7 Etappen + die Gesamtroute.
    Liefert (anzahl_vorher, anzahl_behalten, namen_behalten)."""
    graph = daten.get("@graph", []) or []
    behalten = []
    namen = []
    for eintrag in graph:
        if not isinstance(eintrag, dict):
            continue
        name = (eintrag.get("name") or "").strip()
        if behalten_pruefen(name):
            behalten.append(eintrag)
            namen.append(name)
    daten["@graph"] = behalten
    return len(graph), len(behalten), namen


def warte(sekunden, grund=""):
    if grund:
        print("  " + grund)
    time.sleep(sekunden)


def ermittle_auth():
    env_token = os.environ.get("DATAHUB_TOKEN", "").strip()
    env_user  = os.environ.get("DATAHUB_USER",  "").strip()
    env_pass  = os.environ.get("DATAHUB_PASS",  "").strip()
    if env_token:
        print("[Auth] DATAHUB_TOKEN aus Umgebungsvariable.")
        return "Bearer " + env_token
    if env_user and env_pass:
        print("[Auth] DATAHUB_USER/DATAHUB_PASS aus Umgebungsvariablen.")
        b64 = base64.b64encode((env_user + ":" + env_pass).encode("utf-8")).decode("ascii")
        return "Basic " + b64
    if not sys.stdin.isatty():
        print("FEHLER: Keine Auth-Daten gefunden und kein interaktives TTY.")
        print("Setze DATAHUB_TOKEN ODER DATAHUB_USER+DATAHUB_PASS als Umgebungsvariable.")
        sys.exit(2)
    benutzer = input("DataHub-Benutzername (E-Mail): ").strip()
    passwort = getpass.getpass("DataHub-Passwort: ")
    b64 = base64.b64encode((benutzer + ":" + passwort).encode("utf-8")).decode("ascii")
    return "Basic " + b64


# ─── HAUPTPROGRAMM ───────────────────────────────────────────────────────────

def main():
    print("╔════════════════════════════════════════════════════════╗")
    print("║  DataHub Druidensteig - Download (Etappen + Gesamtroute) ║")
    print("║  Endpoint: " + ENDPOINT_SLUG.ljust(43) + "║")
    print("╚════════════════════════════════════════════════════════╝")
    print()

    if not ENDPOINT_SLUG:
        print("FEHLER: Kein ENDPOINT_SLUG gesetzt.")
        print("        Slug oben eintragen oder Umgebungsvariable DRUIDEN_ENDPOINT_SLUG setzen.")
        sys.exit(2)

    auth_header = ermittle_auth()
    print()

    erfolgreich = 0
    fehlgeschlagen = 0
    total = -1

    for seite in range(1, ANZ_SEITEN + 1):
        ziel = os.path.join(OUTPUT_DIR, DATEINAMEN.format(n=seite))

        if os.path.exists(ziel):
            print("[" + str(seite) + "/" + str(ANZ_SEITEN) + "] " + ziel
                  + " existiert bereits - uebersprungen.")
            continue

        print("[" + str(seite) + "/" + str(ANZ_SEITEN) + "] Lade " + ziel + " ...")
        retry = 0
        while True:
            status, daten = hole_seite(seite, auth_header)

            if status == 200 and daten is not None:
                vorher, behalten, namen = filtere_streckenzug(daten)
                schreibe_datei(ziel, daten)
                if total < 0:
                    total = (daten.get("meta") or {}).get("total", 0)
                print("    OK: " + str(vorher) + " Treffer geladen, davon "
                      + str(behalten) + " zum Streckenzug behalten:")
                for nm in namen:
                    print("        - " + nm)
                erfolgreich += 1
                if vorher < PAGE_SIZE:
                    print("    -> letzte Seite erreicht.")
                    return _ende(erfolgreich, fehlgeschlagen, total)
                warte(PAUSE_NACH_ERFOLG_SEK, "Hoeflichkeits-Pause ...")
                break

            elif status == 429:
                retry += 1
                if retry > MAX_RETRIES_PRO_SEITE:
                    print("    FEHLER: Rate-Limit bleibt. Abbruch.", file=sys.stderr)
                    fehlgeschlagen += 1
                    return _ende(erfolgreich, fehlgeschlagen, total)
                print("    HTTP 429 - warte " + str(PAUSE_NACH_429_SEK // 60)
                      + " Min. (Versuch " + str(retry) + ") ...")
                warte(PAUSE_NACH_429_SEK)
                continue

            elif status in (401, 403):
                print("    FEHLER: HTTP " + str(status)
                      + " - Anmeldedaten falsch oder kein Zugriff auf den Endpoint.",
                      file=sys.stderr)
                return 1

            elif status == 404:
                print("    FEHLER: HTTP 404 - Endpoint '" + ENDPOINT_SLUG
                      + "' existiert nicht. Slug pruefen.", file=sys.stderr)
                return 1

            else:
                print("    FEHLER: HTTP " + str(status) + " - ueberspringe Seite.",
                      file=sys.stderr)
                fehlgeschlagen += 1
                break

    return _ende(erfolgreich, fehlgeschlagen, total)


def _ende(erfolgreich, fehlgeschlagen, total):
    print()
    print("════════════════════════════════════════════════")
    print("Fertig (Druidensteig-Zusatzabruf).")
    print("  Erfolgreiche Seiten: " + str(erfolgreich))
    print("  Fehlgeschlagen:      " + str(fehlgeschlagen))
    if total > 0:
        print("  Treffer laut DataHub (vor Filter): " + str(total))
    print("════════════════════════════════════════════════")
    print()
    print("Wird vom bestehenden Build automatisch mitgenommen:")
    print("  python build_wandertouren.py wandern-*.json -o wandertouren-datahub.js")
    return 0 if fehlgeschlagen == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
