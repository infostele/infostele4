#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
download_concepts.py — Sammelt alle skos:Concept-UUIDs aus den lokalen
JSON-Dateien (pois-*.json, unterkuenfte-*.json, gastro-*.json) und laedt
ueber die DataHub-API fuer jede einzelne UUID den Klartext-Namen.

Output: concepts.json -- ein flaches Dict {uuid: label}.

Das Script ist RESUME-faehig: bestehende concepts.json wird gelesen,
bereits aufgeloeste UUIDs werden uebersprungen.

Aufruf:
    python download_concepts.py
"""

import base64
import glob
import json
import os
import sys
import time
import urllib.error
import urllib.request
from getpass import getpass


# ---------------------------------------------------------------------------
# Konfiguration
# ---------------------------------------------------------------------------

INPUT_GLOBS = [
    "pois-*.json",
    "unterkuenfte-*.json",
    "gastro-*.json",
]
OUTPUT_FILE = "concepts.json"
BASE_URL    = "https://data.rlp-tourismus.de/api/v4/universal/"
PAUSE_SEC   = 0.4    # zwischen Calls
RETRY_429   = 60     # bei rate limit
ZWISCHEN_SPEICHERN_ALLE = 25   # alle N Konzepte zwischenspeichern


# ---------------------------------------------------------------------------
# UUIDs sammeln
# ---------------------------------------------------------------------------

def sammle_concept_uuids(obj, out):
    """Sammelt rekursiv alle UUIDs von skos:Concept-Referenzen."""
    if isinstance(obj, dict):
        if obj.get("@type") == "skos:Concept":
            uid = obj.get("@id")
            if uid:
                out.add(uid)
        for v in obj.values():
            sammle_concept_uuids(v, out)
    elif isinstance(obj, list):
        for x in obj:
            sammle_concept_uuids(x, out)


def lade_lokale_uuids():
    uuids = set()
    dateien = []
    for muster in INPUT_GLOBS:
        dateien.extend(glob.glob(muster))
    dateien = sorted(set(dateien))
    if not dateien:
        print("FEHLER: keine pois-*.json / unterkuenfte-*.json / gastro-*.json gefunden.",
              file=sys.stderr)
        sys.exit(1)
    for p in dateien:
        with open(p, "r", encoding="utf-8") as f:
            d = json.load(f)
        sammle_concept_uuids(d, uuids)
    print("Eingelesen aus " + str(len(dateien)) + " Dateien -> "
          + str(len(uuids)) + " unique Konzept-UUIDs.")
    return uuids


# ---------------------------------------------------------------------------
# Bestehende concepts.json einlesen (Resume)
# ---------------------------------------------------------------------------

def lade_bekannte_labels():
    if not os.path.exists(OUTPUT_FILE):
        return {}
    try:
        with open(OUTPUT_FILE, "r", encoding="utf-8") as f:
            d = json.load(f)
        if isinstance(d, dict):
            print("Bestehende " + OUTPUT_FILE + " gelesen: "
                  + str(len(d)) + " bereits aufgeloeste Konzepte.")
            return d
    except (json.JSONDecodeError, OSError) as e:
        print("WARN: " + OUTPUT_FILE + " konnte nicht gelesen werden: "
              + str(e) + " -- starte frisch.")
    return {}


def speichere_labels(labels):
    tmp = OUTPUT_FILE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(labels, f, ensure_ascii=False, indent=2, sort_keys=True)
    os.replace(tmp, OUTPUT_FILE)


# ---------------------------------------------------------------------------
# Label aus einer Konzept-Response extrahieren
# ---------------------------------------------------------------------------

def extrahiere_label(d, ziel_uuid):
    """dataCycle kann das Konzept auf verschiedene Weise zurueckgeben.
    Wir suchen robust nach einem Klartext-Namen."""
    # 1. Top-Level @graph durchsuchen
    eintraege = []
    if isinstance(d, dict):
        graph = d.get("@graph")
        if isinstance(graph, list):
            eintraege = graph
        else:
            eintraege = [d]
    if not eintraege:
        return ""
    # Wir suchen den Eintrag, dessen @id mit der UUID matched
    treffer = None
    for e in eintraege:
        eid = e.get("@id", "") if isinstance(e, dict) else ""
        if eid.endswith(ziel_uuid):
            treffer = e
            break
    if treffer is None and eintraege:
        treffer = eintraege[0]
    # Mögliche Namens-Felder
    for feld in ("prefLabel", "skos:prefLabel", "name", "dc:title", "title",
                 "rdfs:label", "label"):
        wert = treffer.get(feld) if isinstance(treffer, dict) else None
        if isinstance(wert, str) and wert.strip():
            return wert.strip()
        if isinstance(wert, dict):
            # Mehrsprachig: {"de": "...", "@value": "..."}
            for sprache in ("de", "@value"):
                if isinstance(wert.get(sprache), str) and wert[sprache].strip():
                    return wert[sprache].strip()
        if isinstance(wert, list) and wert:
            # Liste mit lokalisierten Strings
            for item in wert:
                if isinstance(item, str) and item.strip():
                    return item.strip()
                if isinstance(item, dict):
                    if item.get("@language") in ("de", None):
                        v = item.get("@value", "")
                        if v.strip():
                            return v.strip()
    return ""


# ---------------------------------------------------------------------------
# Haupt-Loop
# ---------------------------------------------------------------------------

def main():
    print("=" * 56)
    print("DataHub Concept-Resolver")
    print("=" * 56)

    uuids = lade_lokale_uuids()
    labels = lade_bekannte_labels()

    todo = sorted(uuids - set(labels.keys()))
    if not todo:
        print("Nichts zu tun -- alle " + str(len(uuids))
              + " Konzepte schon aufgeloest.")
        return

    print("\n" + str(len(todo)) + " neue UUIDs zu laden.\n")

    # Authentifizierung: Umgebungsvariablen bevorzugen (fuer GitHub Actions /
    # nicht-interaktive Laeufe). Faellt zurueck auf interaktive Eingabe.
    env_token = os.environ.get("DATAHUB_TOKEN", "").strip()
    env_user  = os.environ.get("DATAHUB_USER",  "").strip()
    env_pass  = os.environ.get("DATAHUB_PASS",  "").strip()

    if env_token:
        auth_header_value = "Bearer " + env_token
        print("[Auth] DATAHUB_TOKEN aus Umgebungsvariable.")
    elif env_user and env_pass:
        auth_b64 = base64.b64encode((env_user + ":" + env_pass).encode("utf-8")).decode("ascii")
        auth_header_value = "Basic " + auth_b64
        print("[Auth] DATAHUB_USER/DATAHUB_PASS aus Umgebungsvariablen.")
    else:
        if not sys.stdin.isatty():
            print("FEHLER: Keine Auth-Daten gefunden und kein interaktives TTY.")
            print("Setze DATAHUB_TOKEN ODER DATAHUB_USER+DATAHUB_PASS als Umgebungsvariable.")
            sys.exit(2)
        user = input("DataHub-Benutzername (E-Mail): ").strip()
        pw   = getpass("DataHub-Passwort:        ")
        auth_b64 = base64.b64encode((user + ":" + pw).encode("utf-8")).decode("ascii")
        auth_header_value = "Basic " + auth_b64

    print("\nStarte Konzept-Auflösung ...")
    erfolg = 0
    fehler = 0
    leer   = 0

    for i, uid in enumerate(todo, 1):
        url = BASE_URL + uid
        req = urllib.request.Request(url)
        req.add_header("Authorization", auth_header_value)
        req.add_header("Accept", "application/json")

        versuche = 0
        while True:
            try:
                with urllib.request.urlopen(req, timeout=30) as resp:
                    d = json.load(resp)
                label = extrahiere_label(d, uid)
                if label:
                    labels[uid] = label
                    erfolg += 1
                else:
                    labels[uid] = ""
                    leer += 1
                break
            except urllib.error.HTTPError as e:
                if e.code == 429 and versuche < 3:
                    print("    HTTP 429 -- warte " + str(RETRY_429) + "s ...")
                    time.sleep(RETRY_429)
                    versuche += 1
                    continue
                print("    [" + str(i) + "/" + str(len(todo))
                      + "] HTTP " + str(e.code) + ": " + uid[:8] + "...")
                labels[uid] = ""
                fehler += 1
                break
            except (urllib.error.URLError, json.JSONDecodeError, OSError) as e:
                print("    [" + str(i) + "/" + str(len(todo))
                      + "] FEHLER " + str(e)[:60])
                labels[uid] = ""
                fehler += 1
                break

        if i % 20 == 0 or i == len(todo):
            print("  [" + str(i) + "/" + str(len(todo))
                  + "] Erfolg=" + str(erfolg) + " Leer=" + str(leer)
                  + " Fehler=" + str(fehler)
                  + "  Beispiel: " + (labels.get(uid, "")[:40] or "(leer)"))

        if i % ZWISCHEN_SPEICHERN_ALLE == 0:
            speichere_labels(labels)

        time.sleep(PAUSE_SEC)

    speichere_labels(labels)

    print("\n" + "=" * 56)
    print("Fertig.")
    print("  Erfolgreich aufgeloest:  " + str(erfolg))
    print("  Leer (kein Label):       " + str(leer))
    print("  Fehler:                  " + str(fehler))
    print("  Gespeichert in:          " + OUTPUT_FILE)
    print("=" * 56)


if __name__ == "__main__":
    main()
