#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
download_unterkuenfte.py — Laedt alle Seiten des gmw-unterkuenfte-ww Endpoints
in einzelne lokale Dateien unterkuenfte-1.json, unterkuenfte-2.json, ...

Schonend für den DataHub (Pausen zwischen Requests, Auto-Retry bei HTTP 429).
Resumebar: schon vorhandene Dateien werden uebersprungen.

Verwendung:
    python download_unterkuenfte.py
        (fragt nach Benutzername + Passwort)
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

ENDUnterkunftNT_SLUG = "gmw-unterkuenfte-ww"
PAGE_SIZE     = 50                  # ~736 Unterkuenfte / 50 = ~15 Seiten
ANZ_SEITEN    = 18                  # 15 erwartet, 3 Sicherheits-Puffer
OUTPUT_DIR    = "."                 # aktuelles Verzeichnis
DATEINAMEN    = "unterkuenfte-{n}.json"  # unterkuenfte-1.json … unterkuenfte-4.json

PAUSE_NACH_ERFOLG_SEK   = 30        # warten zwischen erfolgreichen Abrufen
PAUSE_NACH_429_SEK      = 300       # 5 Minuten warten nach Rate-Limit
MAX_RETRIES_PRO_SEITE   = 4         # max. 4 Wiederholungen pro Seite bei 429
REQUEST_TIMEOUT_SEK     = 90

INCLUDE = "image,location,dc:additionalInformation"
FIELDS  = "*,image.*,location.*,dc:additionalInformation.*"

USER_AGENT = "GuckMaWesterwald-Downloader/1.0"


# ─── HELPER ──────────────────────────────────────────────────────────────────

def baue_url(seite):
    base = "https://data.rlp-tourismus.de/api/v4/endpoints/" + ENDUnterkunftNT_SLUG
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
            return resp.status, json.load(resp)
    except urllib.error.HTTPError as e:
        return e.code, None
    except urllib.error.URLError as e:
        print("    Netzwerkfehler: " + str(e), file=sys.stderr)
        return 0, None


def schreibe_datei(pfad, daten):
    with open(pfad, "w", encoding="utf-8") as f:
        json.dump(daten, f, ensure_ascii=False, indent=2)


def warte_mit_anzeige(sekunden, grund=""):
    """Zeigt eine sich aktualisierende Sekunden-Anzeige in der Konsole."""
    if grund:
        print("  " + grund)
    for verbleibend in range(sekunden, 0, -1):
        msg = "  Warte noch " + str(verbleibend) + " Sek. ..."
        sys.stdout.write("\r" + msg + "  ")
        sys.stdout.flush()
        time.sleep(1)
    sys.stdout.write("\r" + " " * 60 + "\r")
    sys.stdout.flush()


# ─── HAUPTPROGRAMM ───────────────────────────────────────────────────────────

def main():
    print("╔════════════════════════════════════════════════════════╗")
    print("║  DataHub Unterkuenfte - Download                       ║")
    print("║  Endpoint: " + ENDUnterkunftNT_SLUG.ljust(43) + "║")
    print("║  " + str(ANZ_SEITEN) + " Seiten x " + str(PAGE_SIZE)
          + " Touren = max. " + str(ANZ_SEITEN * PAGE_SIZE) + " Touren".ljust(20) + "║")
    print("╚════════════════════════════════════════════════════════╝")
    print()

    # Authentifizierung: Umgebungsvariablen bevorzugen (fuer GitHub Actions /
    # nicht-interaktive Laeufe). Faellt zurueck auf interaktive Eingabe.
    env_token = os.environ.get("DATAHUB_TOKEN", "").strip()
    env_user  = os.environ.get("DATAHUB_USER",  "").strip()
    env_pass  = os.environ.get("DATAHUB_PASS",  "").strip()

    if env_token:
        # Token-Variante (Bearer)
        auth_header = "Bearer " + env_token
        print("[Auth] DATAHUB_TOKEN aus Umgebungsvariable.")
    elif env_user and env_pass:
        # Username/Passwort aus Env (Basic Auth)
        auth_b64 = base64.b64encode((env_user + ":" + env_pass).encode("utf-8")).decode("ascii")
        auth_header = "Basic " + auth_b64
        print("[Auth] DATAHUB_USER/DATAHUB_PASS aus Umgebungsvariablen.")
    else:
        # Interaktive Eingabe als Fallback
        if not sys.stdin.isatty():
            print("FEHLER: Keine Auth-Daten gefunden und kein interaktives TTY.")
            print("Setze DATAHUB_TOKEN ODER DATAHUB_USER+DATAHUB_PASS als Umgebungsvariable.")
            sys.exit(2)
        benutzer = input("DataHub-Benutzername (E-Mail): ").strip()
        passwort = getpass.getpass("DataHub-Passwort: ")
        auth_b64 = base64.b64encode((benutzer + ":" + passwort).encode("utf-8")).decode("ascii")
        auth_header = "Basic " + auth_b64
    print()
    print("Starte Download von " + str(ANZ_SEITEN) + " Seiten ...")
    print("Pause zwischen Erfolgs-Abrufen: " + str(PAUSE_NACH_ERFOLG_SEK) + " Sek.")
    print("Auto-Retry bei HTTP 429 nach: " + str(PAUSE_NACH_429_SEK) + " Sek. ("
          + str(PAUSE_NACH_429_SEK // 60) + " Min.)")
    print()

    erfolgreich = 0
    uebersprungen = 0
    fehlgeschlagen = 0
    abgeschlossen_total = -1

    for seite in range(1, ANZ_SEITEN + 1):
        ziel = os.path.join(OUTPUT_DIR, DATEINAMEN.format(n=seite))

        # Skip wenn schon vorhanden
        if os.path.exists(ziel):
            groesse_kb = os.path.getsize(ziel) // 1024
            print("[" + str(seite) + "/" + str(ANZ_SEITEN) + "] "
                  + ziel + " existiert bereits (" + str(groesse_kb)
                  + " KB) - uebersprungen.")
            uebersprungen += 1
            continue

        print("[" + str(seite) + "/" + str(ANZ_SEITEN) + "] Lade " + ziel + " ...")

        retry = 0
        while True:
            status, daten = hole_seite(seite, auth_header)

            if status == 200 and daten is not None:
                # Erfolg!
                schreibe_datei(ziel, daten)
                graph_len = len(daten.get("@graph", []))
                total = (daten.get("meta") or {}).get("total", 0)
                if abgeschlossen_total < 0:
                    abgeschlossen_total = total
                groesse_kb = os.path.getsize(ziel) // 1024
                print("    OK: " + str(graph_len) + " Touren, "
                      + str(groesse_kb) + " KB")
                erfolgreich += 1

                # Pruefen ob wir am Ende sind (weniger als PAGE_SIZE = letzte Seite)
                if graph_len < PAGE_SIZE:
                    print("    -> letzte Seite erreicht (weniger als "
                          + str(PAGE_SIZE) + " Eintraege).")
                    # Loop verlassen
                    print()
                    abbrechen = True
                else:
                    abbrechen = False
                # Pause nach Erfolg (ausser nach letzter Seite)
                if seite < ANZ_SEITEN and not abbrechen:
                    warte_mit_anzeige(PAUSE_NACH_ERFOLG_SEK,
                                      "Hoeflichkeits-Pause vor naechster Seite ...")
                if abbrechen:
                    break
                else:
                    break

            elif status == 429:
                retry += 1
                if retry > MAX_RETRIES_PRO_SEITE:
                    print("    FEHLER: Rate-Limit auch nach "
                          + str(MAX_RETRIES_PRO_SEITE)
                          + " Wiederholungen nicht weg. Abbruch.",
                          file=sys.stderr)
                    fehlgeschlagen += 1
                    break
                print("    HTTP 429 (Rate Limit) - warte " +
                      str(PAUSE_NACH_429_SEK // 60) + " Min., Versuch " +
                      str(retry) + "/" + str(MAX_RETRIES_PRO_SEITE) + " ...")
                warte_mit_anzeige(PAUSE_NACH_429_SEK)
                continue

            elif status == 401 or status == 403:
                print("    FEHLER: HTTP " + str(status)
                      + " - Anmeldedaten falsch oder kein Zugriff. Abbruch.",
                      file=sys.stderr)
                fehlgeschlagen += 1
                return 1

            else:
                print("    FEHLER: HTTP " + str(status) + " - ueberspringe Seite.",
                      file=sys.stderr)
                fehlgeschlagen += 1
                break
        else:
            continue

        # Wenn letzte Seite (weniger Daten als PAGE_SIZE), beende komplett
        if 'graph_len' in dir() and graph_len < PAGE_SIZE:
            break

    print()
    print("════════════════════════════════════════════════")
    print("Fertig.")
    print("  Erfolgreich:       " + str(erfolgreich))
    print("  Uebersprungen:     " + str(uebersprungen))
    print("  Fehlgeschlagen:    " + str(fehlgeschlagen))
    if abgeschlossen_total > 0:
        print("  Gesamt-Touren laut DataHub: " + str(abgeschlossen_total))
    print("════════════════════════════════════════════════")
    print()
    print("Naechster Schritt:")
    print("  python build_unterkuenfte.py unterkuenfte-*.json -o unterkuenfte-datahub.js")
    print()
    print("Unter Windows-CMD ohne Shell-Glob:")
    print("  python build_unterkuenfte.py unterkuenfte-1.json unterkuenfte-2.json "
          "unterkuenfte-3.json unterkuenfte-4.json -o unterkuenfte-datahub.js")
    return 0


if __name__ == "__main__":
    sys.exit(main())
