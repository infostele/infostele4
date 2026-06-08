/**
 * Guck ma, Westerwald – Datendatei
 * KUNST & KULTUR
 * Stand: Mai 2026
 */

var DATA_KULTUR_VERANSTALTUNGEN = [
  {id:1, name:"Kunst und Kultur – Wir Westerwälder", url:"https://wir-westerwaelder.de/kunst-kultur/", type:"link"}
];

/* Museen mit Inline-Inhalten – einheitliche Struktur:
 *   name, ort, adresse, telefon, email, website,
 *   beschreibung, oeffnungszeiten, eintritt, sourceUrl
 */
var DATA_KULTUR_MUSEEN = [
  {
    id: 1,
    name: "Bergbaumuseum des Kreises Altenkirchen",
    ort: "Herdorf-Sassenroth",
    adresse: "Auf der Bell, 57562 Herdorf",
    telefon: "02744 9319-31",
    email: "info@bergbaumuseum-sassenroth.de",
    website: "www.bergbaumuseum-sassenroth.de",
    beschreibung: "Das Bergbaumuseum Sassenroth dokumentiert die Bergbaugeschichte des Kreises Altenkirchen. Ausgestellt werden originale Werkzeuge, Fördermaschinen, Mineralien und Erzproben aus den Gruben des Siegerland-Wied-Reviers. Höhepunkt ist der nachgebaute Stollen, der einen authentischen Eindruck vom Arbeitsleben unter Tage vermittelt.",
    schwerpunkte: ["Bergbau", "Industriegeschichte", "Mineralogie"],
    oeffnungszeiten: "Saisonal geöffnet, in der Regel Sonntagnachmittag. Aktuelle Zeiten bitte vorab telefonisch erfragen.",
    eintritt: "Erwachsene ca. 4 €, ermäßigt ca. 2 €. Stand 2025; Änderungen vorbehalten.",
    sourceUrl: "https://www.westerwald-sieg.de/d/bergbaumuseum-herdorf-1/"
  },
  {
    id: 2,
    name: "Besucherbergwerk Grube Bindweide",
    ort: "Steinebach/Sieg",
    adresse: "Sportplatz / Bindweide, 57581 Steinebach/Sieg",
    telefon: "02747 9197-50",
    email: "info@grube-bindweide.de",
    website: "www.grube-bindweide.de",
    beschreibung: "Das einzige Besucherbergwerk im Westerwald: Mit einer originalen Grubenbahn fahren Besucher etwa 600 Meter weit in den ehemaligen Eisenerzstollen ein. Im Berg geben Bergführer Einblicke in die Arbeit der Bergleute, die hier von 1849 bis 1931 Eisenerz förderten.",
    schwerpunkte: ["Bergwerk", "Grubenbahnfahrt", "Familienausflug"],
    oeffnungszeiten: "April bis Oktober, Mittwoch bis Sonntag und an Feiertagen. Einfahrten zu festen Uhrzeiten – Reservierung empfohlen.",
    eintritt: "Erwachsene ca. 11 €, Kinder (4–14 J.) ca. 6 €. Stand 2025; Änderungen vorbehalten.",
    sourceUrl: "https://www.westerwald-sieg.de/d/besucherbergwerk-grube-bindweide-sn0rtg6q/"
  },
  {
    id: 3,
    name: "Deutsches Raiffeisen-Museum",
    ort: "Hamm (Sieg)",
    adresse: "Raiffeisenstraße 10, 57577 Hamm (Sieg)",
    telefon: "02682 9588-15",
    email: "info@raiffeisen-gesellschaft.de",
    website: "www.raiffeisen-gesellschaft.de",
    beschreibung: "Das Deutsche Raiffeisen-Museum zeigt das Leben und Wirken Friedrich Wilhelm Raiffeisens (1818–1888), des Begründers der Genossenschaftsidee. Ausgestellt sind Originaldokumente, persönliche Gegenstände sowie Exponate zur Entwicklung des Genossenschaftswesens weltweit. Das Museum befindet sich im historischen Wohnhaus Raiffeisens.",
    schwerpunkte: ["Genossenschaftsgeschichte", "F. W. Raiffeisen", "UNESCO-Welterbe"],
    oeffnungszeiten: "Dienstag bis Sonntag, in der Regel 14:00–17:00 Uhr. Vormittagstermine für Gruppen nach Vereinbarung.",
    eintritt: "Erwachsene ca. 4 €, ermäßigt ca. 2 €.",
    sourceUrl: "https://www.westerwald-sieg.de/d/deutsches-raiffeisen-museum/"
  },
  {
    id: 4,
    name: "Museum Raiffeisenhaus Flammersfeld",
    ort: "Flammersfeld",
    adresse: "Raiffeisenstraße 11, 57632 Flammersfeld",
    telefon: "02685 80910",
    email: "info@flammersfeld.de",
    website: "www.flammersfeld.de",
    beschreibung: "Das Raiffeisenhaus Flammersfeld ist ein zentraler authentischer Ort der Raiffeisen-Erinnerung: Hier wirkte F. W. Raiffeisen von 1848 bis 1852 als Bürgermeister und gründete den ersten Hilfsverein. Das Haus zeigt die Anfänge der Genossenschaftsidee und die Lebensumstände jener Zeit.",
    schwerpunkte: ["Raiffeisen-Erinnerungsort", "Sozialgeschichte 19. Jh."],
    oeffnungszeiten: "Sonntags geöffnet, weitere Termine nach Vereinbarung. Aktuelle Zeiten beim Bürgerservice Flammersfeld erfragen.",
    eintritt: "Eintritt frei oder kleine Schutzgebühr.",
    sourceUrl: "https://www.westerwald-sieg.de/d/raiffeisenhaus-flammersfeld-dwfxk3th/"
  },
  {
    id: 5,
    name: "Haus der Heimatfreunde",
    ort: "Hamm (Sieg)",
    adresse: "Raiffeisenstraße, 57577 Hamm (Sieg)",
    telefon: "02682 9588-15",
    email: "",
    website: "",
    beschreibung: "Das Haus der Heimatfreunde Hamm/Sieg präsentiert eine Sammlung zur regionalen Volkskunde, Handwerksgeschichte und zum Alltagsleben im 19. und frühen 20. Jahrhundert. Originalgetreu eingerichtete Räume zeigen Wohn-, Küchen- und Werkstätten-Situationen.",
    schwerpunkte: ["Volkskunde", "Handwerk", "Alltagsgeschichte"],
    oeffnungszeiten: "Sonntagnachmittag und nach Vereinbarung.",
    eintritt: "Eintritt frei oder Spende.",
    sourceUrl: "https://www.westerwald-sieg.de/d/haus-der-heimatfreunde-8/"
  },
  {
    id: 6,
    name: "Museum der Stadt Kirchen",
    ort: "Kirchen (Sieg)",
    adresse: "Lindenstraße 11, 57548 Kirchen (Sieg)",
    telefon: "02741 688-0",
    email: "info@kirchen-sieg.de",
    website: "www.kirchen-sieg.de",
    beschreibung: "Das Stadtmuseum Kirchen widmet sich der Geschichte der Stadt und der Region. Ausstellungsstücke umfassen archäologische Funde, Dokumente zur Industrialisierung des Siegerlandes (Eisenerz, Hütten) sowie zur jüdischen Geschichte der Stadt.",
    schwerpunkte: ["Stadtgeschichte", "Industriegeschichte", "Jüdisches Leben"],
    oeffnungszeiten: "Sonntag und nach Vereinbarung. Sonderausstellungen werden über die Stadt Kirchen angekündigt.",
    eintritt: "Eintritt frei oder Schutzgebühr.",
    sourceUrl: "https://www.westerwald-sieg.de/d/museum-der-stadt-kirchen-9/"
  },
  {
    id: 7,
    name: "Otto-Pfeiffer-Museum",
    ort: "Kirchen-Freusburg",
    adresse: "Burgstraße, 57548 Kirchen-Freusburg",
    telefon: "02741 688-0",
    email: "",
    website: "",
    beschreibung: "Das Otto-Pfeiffer-Museum erinnert an den Maler und Heimatkundler Otto Pfeiffer (1880–1973) aus Freusburg. Ausgestellt werden Werke des Künstlers sowie Objekte zur Heimatgeschichte des Freusburger Tals.",
    schwerpunkte: ["Kunst", "Heimatgeschichte"],
    oeffnungszeiten: "Nach Vereinbarung über die Stadt Kirchen.",
    eintritt: "Eintritt frei oder Spende.",
    sourceUrl: "https://www.westerwald-sieg.de/d/otto-pfeiffer-museum-in-kirchen-freusburg/"
  },
  {
    id: 8,
    name: "Heimatmuseum des Daadener Landes",
    ort: "Daaden",
    adresse: "Marktplatz, 57567 Daaden",
    telefon: "02743 9201-0",
    email: "info@vg-daaden.de",
    website: "www.vg-daaden.de",
    beschreibung: "Das Heimatmuseum des Daadener Landes zeigt Exponate zur Bergbau-, Hütten- und Eisenverarbeitungstradition der Region rund um Daaden. Auch volkskundliche Objekte und die Geschichte der Daadener Eisenbahn werden präsentiert.",
    schwerpunkte: ["Bergbau", "Hüttenwesen", "Eisenbahngeschichte"],
    oeffnungszeiten: "Sonntags und nach Vereinbarung.",
    eintritt: "Eintritt frei oder Spende.",
    sourceUrl: "https://www.westerwald-sieg.de/d/heimatmuseum-des-daadener-landes/"
  },
  {
    id: 9,
    name: "Historisches Quartier Altenkirchen",
    ort: "Altenkirchen",
    adresse: "Bahnhofstraße / Schlossplatz, 57610 Altenkirchen",
    telefon: "02681 851-0",
    email: "info@altenkirchen.de",
    website: "www.altenkirchen.de",
    beschreibung: "Das Historische Quartier Altenkirchen umfasst mehrere historische Gebäude in der Innenstadt, die gemeinsam die Stadt- und Regionalgeschichte erzählen – von den Anfängen im Mittelalter über die Zeit der sayn'schen Grafen bis zur Nachkriegszeit. Wechselausstellungen zu lokalhistorischen Themen.",
    schwerpunkte: ["Stadtgeschichte", "Sayn-Altenkirchen", "Wechselausstellungen"],
    oeffnungszeiten: "Wechselnde Zeiten – aktuelle Öffnungstage über die Stadt Altenkirchen.",
    eintritt: "Eintritt teilweise frei, je nach Ausstellung.",
    sourceUrl: "https://www.westerwald-sieg.de/d/historisches-quartier-1/"
  },
  {
    id: 10,
    name: "WW-Museum Motorrad & Technik",
    ort: "Steinebach/Sieg",
    adresse: "Industriestraße, 57581 Steinebach/Sieg",
    telefon: "02747 91860",
    email: "",
    website: "",
    beschreibung: "Das Westerwälder Motorrad- und Technikmuseum zeigt eine umfangreiche Sammlung historischer Motorräder, Mopeds und technischer Gerätschaften – von Vorkriegs-Klassikern bis zu Maschinen der 1980er-Jahre. Daneben sind Werkstattszenen, Werbeobjekte und technische Lehrmittel ausgestellt.",
    schwerpunkte: ["Motorräder", "Technikgeschichte", "Vintage"],
    oeffnungszeiten: "Saisonal, meist von April bis Oktober am Wochenende. Aktuelle Zeiten vorab erfragen.",
    eintritt: "Erwachsene ca. 5 €, Kinder ermäßigt.",
    sourceUrl: "https://www.westerwald-sieg.de/d/ww-museum-motorrad-technik/"
  },
  {
    id: 11,
    name: "Elvis-Museum",
    ort: "Kircheib",
    adresse: "Hauptstraße, 57635 Kircheib",
    telefon: "02683 9799-0",
    email: "",
    website: "",
    beschreibung: "Privatsammlung mit Schallplatten, Fotos, Bühnenkleidung-Repliken und Memorabilia rund um Elvis Presley. Die Sammlung ist eine der größten privaten Elvis-Kollektionen Deutschlands und zeigt Originalexponate sowie Fan-Artefakte.",
    schwerpunkte: ["Elvis Presley", "Musikgeschichte", "Pop-Kultur"],
    oeffnungszeiten: "Nach Vereinbarung – Termine über den Sammler.",
    eintritt: "Eintritt frei oder Spende.",
    sourceUrl: "https://www.westerwald-sieg.de/d/elvis-museum-1/"
  },
  {
    id: 12,
    name: "Luis Biermuseum",
    ort: "Bitzen",
    adresse: "Hauptstraße, 57581 Bitzen",
    telefon: "",
    email: "",
    website: "",
    beschreibung: "Privates Biermuseum mit über 1.000 Bierkrügen, historischen Brauereietiketten, Werbeschildern und Brauerei-Memorabilia. Schwerpunkt: regionale Brauereien des Westerwaldes und der angrenzenden Regionen.",
    schwerpunkte: ["Bierkultur", "Brauerei-Geschichte", "Sammlerstücke"],
    oeffnungszeiten: "Nach Vereinbarung.",
    eintritt: "Eintritt frei oder Spende.",
    sourceUrl: "https://www.westerwald-sieg.de/d/biermuseum-1/"
  },
  {
    id: 13,
    name: "Alte Schmiede & Zinnfigurenkabinett",
    ort: "Ölsen-Friedenthal",
    adresse: "Friedenthal, 57647 Nistertal-Ölsen",
    telefon: "",
    email: "",
    website: "",
    beschreibung: "Original erhaltene Dorfschmiede mit Esse, Amboss und Werkzeugbeständen aus dem 19. Jahrhundert. Daneben das Zinnfigurenkabinett mit historischen Schaufensterszenen aus zinngegossenen Figuren – Schlachten, Märkte und Dorfleben in Miniatur.",
    schwerpunkte: ["Schmiedehandwerk", "Zinnfiguren", "Dorfgeschichte"],
    oeffnungszeiten: "Nach Vereinbarung über den Heimatverein.",
    eintritt: "Eintritt frei oder Spende.",
    sourceUrl: "https://www.westerwald-sieg.de/d/alte-schmiede-zinnfigurenkabinett-1/"
  },
  {
    id: 14,
    name: "Landschaftsmuseum Westerwald",
    ort: "Hachenburg",
    adresse: "Burggartenweg 7, 57627 Hachenburg",
    telefon: "02662 7456",
    email: "info@landschaftsmuseum-westerwald.de",
    website: "www.landschaftsmuseum-westerwald.de",
    beschreibung: "Das Landschaftsmuseum Westerwald ist ein Freilichtmuseum mit historischen Gebäuden aus der gesamten Region – Bauernhöfe, Backhäuser, Schmieden und Werkstätten wurden originalgetreu wiederaufgebaut und eingerichtet. Das Museum vermittelt das ländliche Leben und Wirtschaften vergangener Jahrhunderte sehr anschaulich.",
    schwerpunkte: ["Freilichtmuseum", "Volkskunde", "Ländliches Bauen"],
    oeffnungszeiten: "April bis November, Dienstag bis Sonntag und an Feiertagen, ca. 10:00–18:00 Uhr.",
    eintritt: "Erwachsene ca. 7 €, ermäßigt ca. 5 €, Kinder (6–17 J.) ca. 3 €. Stand 2025.",
    sourceUrl: "https://www.westerwald-sieg.de/d/landschaftsmuseum-westerwald/"
  }
];
