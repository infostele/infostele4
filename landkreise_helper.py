"""
Hilfsmodul fuer den DataHub-Build: ordnet einen Eintrag (POI, Unterkunft,
Veranstaltung, Tour) einem der drei Westerwald-Landkreise zu.

Rueckgabewerte:
  'AK'  -- Kreis Altenkirchen
  'NR'  -- Kreis Neuwied
  'WW'  -- Westerwaldkreis
  'HE'  -- Hessen (Anrainer-Gemeinden, fuer App-Filter "Hessen")
  'SO'  -- Sonstige (PLZ nicht in der gepflegten Liste)
  None  -- Keine PLZ angegeben

Primaere Zuordnung erfolgt ueber eine gepflegte (PLZ, Ort)-Liste von
Waelli (Wirtschaftsfoerderung Kreis Altenkirchen). Polygon-Fallback
basierend auf GeoJSON-Grenzen ist als 2. Stufe enthalten, fuer Faelle
ohne Adressfeld (z.B. Wandertouren-Startpunkte).
"""
import json
import re


# ---------------------------------------------------------------------------
# 1) Gepflegte (PLZ, Ort) -> Kreis Mapping-Tabelle
# ---------------------------------------------------------------------------
# Format: pro Zeile "PLZ  Ortsname" (mehrere Whitespace dazwischen erlaubt)
_KREIS_BLOCKS = {
    'AK': """51598  Friesenhagen
56472  Nisterberg
56593  Bürdenbach
56593  Güllesheim
56593  Horhausen (Westerwald)
56593  Krunkel
56593  Niedersteinebach
56593  Obersteinebach
56593  Pleckhausen
56594  Willroth
57518  Alsdorf
57518  Betzdorf
57518  Steineroth
57520  Derschen
57520  Dickendorf
57520  Emmerzhausen
57520  Friedewald
57520  Grünebach
57520  Kausen
57520  Mauden
57520  Molzhain
57520  Niederdreisbach
57520  Rosenheim
57520  Schutzbach
57520  Steinebach/Sieg
57537  Forst
57537  Hövels
57537  Mittelhof
57537  Selbach (Sieg)
57537  Wissen
57539  Bitzen
57539  Breitscheidt
57539  Bruchertseifen
57539  Etzbach
57539  Fürthen
57539  Roth
57548  Kirchen (Sieg)
57555  Brachbach
57555  Mudersbach
57562  Herdorf
57567  Daaden
57572  Harbach
57572  Niederfischbach
57577  Hamm (Sieg)
57577  Seelbach bei Hamm (Sieg)
57578  Elkenroth
57580  Elben
57580  Fensdorf
57580  Gebhardshain
57581  Katzwinkel (Sieg)
57583  Nauroth
57584  Scheuerfeld
57584  Wallmenroth
57586  Weitefeld
57587  Birken-Honigsessen
57589  Birkenbeul
57589  Niederirsen
57589  Pracht
57610  Almersbach
57610  Altenkirchen (Westerwald)
57610  Bachenberg
57610  Gieleroth
57610  Ingelbach
57610  Michelbach
57612  Birnbach
57612  Busenhausen
57612  Eichelhardt
57612  Helmenzen
57612  Helmeroth
57612  Hemmelzen
57612  Heupelzen
57612  Hilgenroth
57612  Idelberg
57612  Isert
57612  Kettenhausen
57612  Obererbach
57612  Racksen
57612  Volkerzen
57612  Ölsen
57614  Berod bei Hachenburg
57614  Fluterschen
57614  Oberwambach
57614  Stürzelbach
57629  Malberg
57632  Berzhausen
57632  Burglahr
57632  Eichen
57632  Eulenberg
57632  Flammersfeld
57632  Giershausen
57632  Kescheid
57632  Orfgen
57632  Peterslahr
57632  Reiferscheid
57632  Rott
57632  Schürdt
57632  Seelbach (Westerwald)
57632  Seifen
57632  Walterschen
57632  Ziegenhain
57635  Ersfeld
57635  Fiersbach
57635  Forstmehren
57635  Hasselbach
57635  Hirz-Maulsbach
57635  Kircheib
57635  Kraam
57635  Mehren
57635  Oberirsen
57635  Rettersen
57635  Werkhausen
57635  Weyerbusch
57635  Wölmersen
57636  Mammelzen
57636  Sörth
57638  Neitersen
57638  Obernau
57638  Schöneberg
57641  Oberlahr""",
    'NR': """53545  Linz am Rhein
53545  Ockenfels
53547  Bad Hönningen
53547  Breitscheid
53547  Dattenberg
53547  Hausen (Wied)
53547  Hümmerich
53547  Kasbach-Ohlenberg
53547  Leubsdorf
53547  Roßbach
53557  Bad Hönningen
53560  Linz am Rhein
53560  Vettelschoß
53562  Sankt Katharinen
53567  Asbach
53567  Buchholz (Westerwald)
53572  Bruchhausen
53572  Unkel
53577  Neustadt (Wied)
53578  Windhagen
53579  Erpel
53619  Rheinbreitbach
56269  Dierdorf
56269  Marienhausen
56271  Isenburg
56271  Kleinmaischeid
56276  Großmaischeid
56276  Stebach
56305  Döttesfeld
56305  Puderbach
56307  Dernbach
56307  Dürrholz
56307  Harschbach
56316  Hanroth
56316  Niederhofen
56316  Raubach
56317  Linkenbach
56317  Urbach
56564  Neuwied
56566  Neuwied
56567  Neuwied
56579  Bonefeld
56579  Hardert
56579  Rengsdorf
56581  Ehlscheid
56581  Kurtscheid
56581  Melsbach
56584  Anhausen
56584  Meinborn
56584  Rüscheid
56584  Thalhausen
56587  Oberhonnefeld-Gierend
56587  Oberraden
56587  Straßenhaus
56588  Hausen (Wied)
56588  Waldbreitbach
56589  Datzeroth
56589  Niederbreitbach
56598  Hammerstein
56598  Rheinbrohl
56599  Leutesdorf
57614  Niederwambach
57614  Ratzert
57614  Steimel
57614  Woldert
57639  Oberdreis
57639  Rodenbach bei Puderbach""",
    'WW': """56203  Höhr-Grenzhausen
56204  Hillscheid
56206  Hilgert
56206  Kammerforst
56235  Hundsdorf
56235  Ransbach-Baumbach
56237  Alsbach
56237  Breitenau
56237  Caan
56237  Deesen
56237  Nauort
56237  Oberhaid
56237  Sessenbach
56237  Wirscheid
56237  Wittgert
56242  Ellenhausen
56242  Marienrachdorf
56242  Nordhofen
56242  Quirnbach
56242  Selters (Westerwald)
56244  Arnshöfen
56244  Ettinghausen
56244  Ewighausen
56244  Freilingen
56244  Freirachdorf
56244  Goddert
56244  Hahn am See
56244  Hartenfels
56244  Helferskirchen
56244  Krümmel
56244  Kuhnhöfen
56244  Leuterod
56244  Maxsain
56244  Niedersayn
56244  Rückeroth
56244  Schenkelberg
56244  Sessenhausen
56244  Steinen
56244  Vielbach
56244  Weidenhahn
56244  Wölferlingen
56244  Ötzingen
56249  Herschbach
56271  Maroth
56271  Mündersbach
56271  Roßbach
56335  Neuhäusel
56337  Eitelborn
56337  Kadenbach
56337  Simmern
56410  Montabaur
56412  Boden
56412  Daubach
56412  Gackenbach
56412  Girod
56412  Großholbach
56412  Görgeshausen
56412  Heilberscheid
56412  Heiligenroth
56412  Holler
56412  Horbach
56412  Hübingen
56412  Nentershausen
56412  Niederelbert
56412  Niedererbach
56412  Nomborn
56412  Oberelbert
56412  Ruppach-Goldhausen
56412  Stahlhofen
56412  Untershausen
56412  Welschneudorf
56414  Berod bei Wallmerod
56414  Bilkheim
56414  Dreikirchen
56414  Herschbach
56414  Hundsangen
56414  Meudt
56414  Molsberg
56414  Niederahr
56414  Oberahr
56414  Obererbach
56414  Salz
56414  Steinefrenz
56414  Wallmerod
56414  Weroth
56414  Zehnhausen bei Wallmerod
56422  Wirges
56424  Bannberscheid
56424  Ebernhahn
56424  Mogendorf
56424  Moschheim
56424  Staudt
56427  Siershahn
56428  Dernbach (Westerwald)
56457  Halbs
56457  Hergenroth
56457  Westerburg
56459  Ailertchen
56459  Bellingen
56459  Berzhahn
56459  Brandscheid
56459  Elbingen
56459  Gemünden
56459  Girkenroth
56459  Guckheim
56459  Härtlingen
56459  Kaden
56459  Kölbingen
56459  Langenhahn
56459  Mähren
56459  Pottum
56459  Rotenhain
56459  Rothenbach
56459  Stahlhofen am Wiesensee
56459  Stockum-Püschen
56459  Weltersburg
56459  Willmenrod
56459  Winnen
56462  Höhn
56470  Bad Marienberg (Westerwald)
56472  Dreisbach
56472  Fehl-Ritzhausen
56472  Großseifen
56472  Hahn bei Marienberg
56472  Hardt
56472  Hof
56472  Lautzenbrücken
56472  Nisterau
56472  Stockhausen-Illfurth
56477  Nister-Möhrendorf
56477  Rennerod
56477  Waigandshain
56477  Zehnhausen bei Rennerod
56479  Bretthausen
56479  Elsoff (Westerwald)
56479  Hellenhahn-Schellenberg
56479  Homberg
56479  Hüblingen
56479  Irmtraut
56479  Liebenscheid
56479  Neunkirchen
56479  Neustadt/ Westerwald
56479  Niederroßbach
56479  Oberrod
56479  Oberroßbach
56479  Rehe
56479  Salzburg
56479  Seck
56479  Stein-Neukirch
56479  Waldmühlen
56479  Westernohe
56479  Willingen
57520  Langenbach bei Kirburg
57520  Neunkhausen
57583  Mörlen
57612  Giesenhausen
57612  Kroppach
57614  Borod
57614  Mudenbach
57614  Wahlrod
57627  Astert
57627  Gehlert
57627  Hachenburg
57627  Heuzert
57627  Marzhausen
57629  Atzelgift
57629  Dreifelden
57629  Heimborn
57629  Höchstenbach
57629  Kirburg
57629  Kundert
57629  Limbach
57629  Linden
57629  Lochum
57629  Luckenbach
57629  Merkelbach
57629  Mörsbach
57629  Müschenbach
57629  Norken
57629  Stein-Wingert
57629  Steinebach an der Wied
57629  Streithausen
57629  Wied
57642  Alpenrod
57644  Hattert
57644  Welkenbach
57644  Winkelbach
57645  Nister
57647  Alpenrod
57647  Enspel
57647  Nistertal
57648  Bölsberg
57648  Unnau""",
    'HE': """35683  Dillenburg (Oranienstadt)
35708  Haiger
35745  Herborn
35753  Greifenstein
35759  Driedorf
35767  Breitscheid
65589  Hadamar
65599  Dornburg
65627  Elbtal
65620  Waldbrunn (Westerwald)""",
}


def _norm(s):
    """Normalisiert einen Ortsnamen fuer Lookup-Vergleich:
       - entfernt Klammer-Zusaetze ("(Westerwald)", "(Sieg)", ...)
       - lowercase, Umlaute ausgeschrieben, Whitespace normalisiert."""
    if not s:
        return ''
    s = re.sub(r'\(.*?\)', '', s)
    s = s.lower().strip()
    s = s.replace('ä', 'ae').replace('ö', 'oe').replace('ü', 'ue').replace('ß', 'ss')
    s = re.sub(r'\s+', ' ', s)
    return s


# Lookup-Tabellen einmalig beim Modul-Import aufbauen
_PLZ_ORT_KREIS = {}    # (plz, norm_ort) -> Kreis
_PLZ_KREISE    = {}    # plz -> set(Kreise)
_PLZ_ORT_LISTE = []    # [(plz, norm_ort, kreis), ...] fuer Substring-Match

for _kreis, _block in _KREIS_BLOCKS.items():
    for _line in _block.strip().splitlines():
        _parts = _line.strip().split(None, 1)
        if len(_parts) != 2:
            continue
        _plz, _ort = _parts
        _on = _norm(_ort)
        _PLZ_ORT_KREIS[(_plz, _on)] = _kreis
        _PLZ_KREISE.setdefault(_plz, set()).add(_kreis)
        _PLZ_ORT_LISTE.append((_plz, _on, _kreis))


def bezirk_aus_plz_ort(plz, ort=''):
    """Hauptfunktion: liefert 'AK' | 'NR' | 'WW' | 'HE' | 'SO' | None.

    - Exakter (PLZ, Ort)-Match wird priorisiert
    - Substring-Match auf den Ortsnamen als Fallback bei mehrdeutigen PLZ
    - Wenn PLZ in nur einem Kreis vorkommt: dieser Kreis
    - Wenn PLZ unbekannt aber gesetzt: 'SO' (Sonstige)
    - Wenn keine PLZ: None
    """
    if not plz:
        return None
    plz_s = str(plz).strip()
    if not plz_s:
        return None
    ort_n = _norm(ort or '')

    # 1) Exakte Uebereinstimmung
    if (plz_s, ort_n) in _PLZ_ORT_KREIS:
        return _PLZ_ORT_KREIS[(plz_s, ort_n)]

    # 2) Substring-Match: ein bekannter Ortsname steckt im Adress-Ort
    #    (Bsp. "Hachenburg-Altstadt" -> bekanntes "hachenburg" matched)
    if ort_n:
        matches = set()
        for _plz, _on, _k in _PLZ_ORT_LISTE:
            if _plz != plz_s or not _on:
                continue
            if _on in ort_n or ort_n in _on:
                matches.add(_k)
        if len(matches) == 1:
            return next(iter(matches))

    # 3) PLZ allein -- wenn nur in einem Kreis vertreten: eindeutig
    kreise = _PLZ_KREISE.get(plz_s, set())
    if len(kreise) == 1:
        return next(iter(kreise))

    # 4) PLZ ist mehrdeutig ODER nicht in der Liste -> Sonstige
    return 'SO'


# ---------------------------------------------------------------------------
# 2) Polygon-Fallback (bestehender Code) -- wird nur noch fuer Touren genutzt,
#    die keine Adresse haben, sondern nur Startkoordinaten.
# ---------------------------------------------------------------------------
_LANDKREISE_JSON = ''   # wird unten gesetzt, falls landkreise-westerwald.js vorhanden
import os.path as _osp
_this_dir = _osp.dirname(_osp.abspath(__file__))
_lk_path = _osp.join(_this_dir, 'landkreise-westerwald.js')
if _osp.exists(_lk_path):
    try:
        _js = open(_lk_path, 'r', encoding='utf-8').read()
        _m = re.search(r'window\.LANDKREISE_WESTERWALD\s*=\s*(\{.*?\})\s*;?\s*$', _js, re.DOTALL)
        if _m:
            _LANDKREISE_JSON = _m.group(1)
    except Exception:
        pass

_LANDKREISE = json.loads(_LANDKREISE_JSON) if _LANDKREISE_JSON else None
_NAME_TO_KEY = {'Altenkirchen': 'AK', 'Neuwied': 'NR', 'Westerwaldkreis': 'WW'}


def _point_in_ring(pt, ring):
    x, y = pt[0], pt[1]
    inside = False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i][0], ring[i][1]
        xj, yj = ring[j][0], ring[j][1]
        if ((yi > y) != (yj > y)) and (x < (xj - xi) * (y - yi) / (yj - yi) + xi):
            inside = not inside
        j = i
    return inside


def _point_in_geometry(pt, geom):
    if not geom:
        return False
    if geom['type'] == 'Polygon':
        rings = geom['coordinates']
        if not rings or not _point_in_ring(pt, rings[0]):
            return False
        for i in range(1, len(rings)):
            if _point_in_ring(pt, rings[i]):
                return False
        return True
    if geom['type'] == 'MultiPolygon':
        for poly in geom['coordinates']:
            if _point_in_geometry(pt, {'type': 'Polygon', 'coordinates': poly}):
                return True
    return False


def bezirk_aus_koords(lat, lng):
    """Liefert 'AK' | 'NR' | 'WW' | None anhand der GeoJSON-Polygone.

    Nur Fallback fuer Touren ohne Adresse. Wenn die landkreise-westerwald.js
    nicht im selben Ordner liegt, gibt diese Funktion immer None zurueck.
    """
    if not _LANDKREISE:
        return None
    if lat is None or lng is None:
        return None
    try:
        lat = float(lat); lng = float(lng)
    except (TypeError, ValueError):
        return None
    pt = [lng, lat]
    for f in _LANDKREISE['features']:
        if _point_in_geometry(pt, f['geometry']):
            name = (f.get('properties') or {}).get('name', '')
            return _NAME_TO_KEY.get(name)
    return None


# ---------------------------------------------------------------------------
# Selbsttest
# ---------------------------------------------------------------------------
if __name__ == '__main__':
    tests = [
        # PLZ + Ort
        ('57610', 'Altenkirchen',         'AK'),
        ('57518', 'Betzdorf',              'AK'),
        ('56564', 'Neuwied',               'NR'),
        ('53547', 'Bad Hönningen',         'NR'),
        ('56410', 'Montabaur',             'WW'),
        ('56470', 'Bad Marienberg',        'WW'),
        ('35745', 'Herborn',               'HE'),
        # Mehrdeutige PLZ (57614 ist in AK, NR und WW) - nur mit Ort eindeutig
        ('57614', 'Fluterschen',           'AK'),
        ('57614', 'Niederwambach',         'NR'),
        ('57614', 'Borod',                 'WW'),
        # Mehrdeutige PLZ ohne Ort -> SO (kann nicht entscheiden)
        ('57614', '',                      'SO'),
        # Unbekannte PLZ -> SO
        ('10115', 'Berlin',                'SO'),
        ('60311', 'Frankfurt',             'SO'),
        # Edge cases
        (None,   '',                       None),
        ('',     'Hachenburg',             None),
    ]
    ok = 0
    for plz, ort, exp in tests:
        got = bezirk_aus_plz_ort(plz, ort)
        mark = '✓' if got == exp else '✗'
        if got == exp:
            ok += 1
        print(f'  {mark}  bezirk_aus_plz_ort({plz!r:10}, {ort!r:25}) -> {got!r} (erwartet: {exp!r})')
    print(f'\n{ok}/{len(tests)} Tests bestanden.')
