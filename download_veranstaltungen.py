#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
download_veranstaltungen.py — Laedt alle Seiten des gmw-veranstaltungen-ww
Endpoints in einzelne lokale Dateien ww-1.json, ww-2.json, ...

Schonend fuer den DataHub (Pausen zwischen Requests, Auto-Retry bei HTTP 429).
Resumebar: schon vorhandene Dateien werden uebersprungen.

Verwendung:
    python download_veranstaltungen.py
        (fragt nach Benutzername + Passwort, sofern nicht via Umgebungs-
         variablen DATAHUB_TOKEN oder DATAHUB_USER + DATAHUB_PASS gesetzt)
"""

import base64
import getpass
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request


# ─── KONFIGURATION ───────────────────────────────────────────────────────────

ENDPOINT_SLUG = "gmw-veranstaltungen-ww"
PAGE_SIZE     = 50
ANZ_SEITEN    = 120                 # Veranstaltungen sind ueppig; lieber Puffer
OUTPUT_DIR    = "."
DATEINAMEN    = "ww-{n}.json"

PAUSE_NACH_ERFOLG_SEK   = 30
PAUSE_NACH_429_SEK      = 300
MAX_RETRIES_PRO_SEITE   = 4
REQUEST_TIMEOUT_SEK     = 90

INCLUDE = "image,location,dc:additionalInformation,eventSchedule"
FIELDS  = "*,image.*,location.*,dc:additionalInformation.*,eventSchedule.*"

USER_AGENT = "GuckMaWesterwald-Downloader/1.0"


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
    """Holt eine Seite. Liefert (statuscode, daten_oder_None)."""
    url = baue_url(seite)
    req = urllib.request.Request(url)
    req.add_header("Authorization", auth_header)
    req.add_header("Accept", "application/json")
    req.add_header("User-Agent", USER_AGENT)
    try:
        with urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT_SEK) as resp:
            return resp.status, json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        return e.code, None
    except Exception as e:
        print(f"[Fehler] Seite {seite}: {e}")
        return -1, None


def main():
    print("╔══════════════════════════════════════════════════════════╗")
    print("║  DataHub Veranstaltungen - Download                     ║")
    print("║  Endpoint: " + ENDPOINT_SLUG.ljust(43) + " ║")
    print("║  bis zu " + str(ANZ_SEITEN) + " Seiten x " + str(PAGE_SIZE)
          + " = max. " + str(ANZ_SEITEN * PAGE_SIZE).ljust(7) + " Events       ║")
    print("╚══════════════════════════════════════════════════════════╝")
    print()

    # Authentifizierung: Umgebungsvariablen bevorzugen (fuer GitHub Actions /
    # nicht-interaktive Laeufe). Faellt zurueck auf interaktive Eingabe.
    env_token = os.environ.get("DATAHUB_TOKEN", "").strip()
    env_user  = os.environ.get("DATAHUB_USER",  "").strip()
    env_pass  = os.environ.get("DATAHUB_PASS",  "").strip()

    if env_token:
        auth_header = "Bearer " + env_token
        print("[Auth] DATAHUB_TOKEN aus Umgebungsvariable.")
    elif env_user and env_pass:
        auth_b64 = base64.b64encode((env_user + ":" + env_pass).encode("utf-8")).decode("ascii")
        auth_header = "Basic " + auth_b64
        print("[Auth] DATAHUB_USER/DATAHUB_PASS aus Umgebungsvariablen.")
    else:
        if not sys.stdin.isatty():
            print("FEHLER: Keine Auth-Daten gefunden und kein interaktives TTY.")
            print("Setze DATAHUB_TOKEN ODER DATAHUB_USER+DATAHUB_PASS als Umgebungsvariable.")
            sys.exit(2)
        benutzer = input("DataHub-Benutzername (E-Mail): ").strip()
        passwort = getpass.getpass("DataHub-Passwort: ")
        auth_b64 = base64.b64encode((benutzer + ":" + passwort).encode("utf-8")).decode("ascii")
        auth_header = "Basic " + auth_b64

    print()
    print("Starte Download von bis zu " + str(ANZ_SEITEN) + " Seiten ...")
    print("Pause zwischen Erfolgs-Abrufen: " + str(PAUSE_NACH_ERFOLG_SEK) + " Sek.")
    print("Auto-Retry bei HTTP 429 nach: " + str(PAUSE_NACH_429_SEK) + " Sek.")
    print()

    erfolgreich = 0
    uebersprungen = 0
    fehlgeschlagen = 0
    leer_in_folge = 0
    LEER_ABBRUCH = 2   # nach 2 leeren Seiten in Folge gilt: Ende erreicht

    for seite in range(1, ANZ_SEITEN + 1):
        ziel = os.path.join(OUTPUT_DIR, DATEINAMEN.format(n=seite))

        if os.path.exists(ziel):
            groesse_kb = os.path.getsize(ziel) // 1024
            print(f"[{seite}/{ANZ_SEITEN}] uebersprungen (existiert, {groesse_kb} KB)")
            uebersprungen += 1
            continue

        versuche = 0
        while True:
            print(f"[{seite}/{ANZ_SEITEN}] lade ...", end=" ", flush=True)
            status, daten = hole_seite(seite, auth_header)
            if status == 200 and daten is not None:
                with open(ziel, "w", encoding="utf-8") as f:
                    json.dump(daten, f, ensure_ascii=False, indent=2)
                # Die Veranstaltungs-API liefert JSON-LD-Format mit '@graph'
                # (nicht JSON:API mit 'data' wie die anderen Endpoints!).
                anz = len(daten.get("@graph", []) or daten.get("data", []))
                groesse_kb = os.path.getsize(ziel) // 1024
                print(f"OK ({anz} Eintraege, {groesse_kb} KB)")
                erfolgreich += 1
                if anz == 0:
                    leer_in_folge += 1
                else:
                    leer_in_folge = 0
                break
            elif status == 429:
                versuche += 1
                if versuche > MAX_RETRIES_PRO_SEITE:
                    print(f"FEHLER 429 (Limit nach {MAX_RETRIES_PRO_SEITE} Versuchen)")
                    fehlgeschlagen += 1
                    break
                print(f"HTTP 429 (Rate Limit), warte {PAUSE_NACH_429_SEK} Sek. ...")
                time.sleep(PAUSE_NACH_429_SEK)
            elif status == 401:
                print("HTTP 401: Authentifizierung fehlgeschlagen. Abbruch.")
                sys.exit(3)
            else:
                print(f"FEHLER HTTP {status}")
                fehlgeschlagen += 1
                break

        if leer_in_folge >= LEER_ABBRUCH:
            print(f"\nMehrere leere Seiten in Folge -- Ende des Datensatzes erreicht.")
            break

        time.sleep(PAUSE_NACH_ERFOLG_SEK)

    print()
    print("═" * 60)
    print(f"Fertig.  Erfolgreich: {erfolgreich}  Uebersprungen: {uebersprungen}  Fehler: {fehlgeschlagen}")


if __name__ == "__main__":
    main()
