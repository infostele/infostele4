// badeseen.js
// Badeseen für die Kategorie Tourismus & Freizeit
// Quelle: westerwald.info (Westerwald Touristik-Service)
// Stand: April 2026

var DATA_BADESEEN_NEU = [
  {
    name: "Westerwälder Seenplatte",
    ort: "Steinebach an der Wied",
    kurz: "Die Westerwälder Seenplatte ist ein beliebtes Naherholungsgebiet mit mehreren Seen. Sie bietet vielfältige Möglichkeiten zur Freizeitgestaltung.",
    detail: "Die Westerwälder Seenplatte besteht aus einer Reihe von Gewässern, die heute vor allem der Erholung dienen. Spaziergänge, Wanderungen und Naturbeobachtungen sind hier möglich. Die Seen sind von Wegen und Grünflächen umgeben. Das Gebiet ist sowohl bei Gästen als auch bei Einheimischen beliebt.",
    strasse: "Seeburger Straße 1",
    plz: "57629",
    tel: "+49 2662 9699760",
    mail: "info@hachenburger-westerwald.de",
    links: ["https://www.hachenburger-westerwald.de"],
    sourceUrl: "https://www.westerwald.info/d/westerwaelder-seenplatte-ae5nzlne/"
  },
  {
    name: "Dreifelder Weiher",
    ort: "Steinebach an der Wied",
    kurz: "Die Naturschönheit mit Entspannungsfaktor.",
    detail: "Der Dreifelder Weiher gehört zu der Westerwälder Seenplatte und ist mit seiner Oberfläche von 123 ha das größte Stillgewässer. Besonders beliebt ist das Ausflugsziel bei Campern. Am nordwestlichen Ufer des 2000 Meter langen und bis zu 800 Meter breiten Weihers befindet sich ein schöner Campingplatz namens „Haus am See“. Eine idyllische Ruhe- und Entspannungsoase für Touristen und Einheimische und Ausgangspunkt für Wander- und Radtouren in der Region.\n\nErholung im Café-Restaurant des Dreifelder Weihers: Egal ob alleine, zu zweit oder mit der ganzen Familie — lass dich von der Westerwälder Seenplatte verzaubern und wandere gemütliche 6 km um den Dreifelder Weiher. Genieße schöne Waldpassagen und atemberaubende Ausblicke oder sonne dich bei schönem Wetter am Ufer des Weihers. Gönne dir eine Auszeit im großen Restaurant mit einladender Sonnenterrasse.",
    strasse: "Seeburger Straße 1",
    plz: "57629",
    tel: "+49 2662 9699760",
    mail: "info@hachenburger-westerwald.de",
    links: ["https://www.hachenburger-westerwald.de"],
    sourceUrl: "https://www.westerwald.info/d/dreifelder-weiher-7/"
  },
  {
    name: "Strandbad Freilingen",
    ort: "Freilingen",
    kurz: "",
    detail: "Unser Naturstrandbad liegt herrlich am 13 ha großen Postweiher, welcher einer der größten Weiher der „Westerwälder Seenplatte“ ist. Der Postweiher ist einer der wenigen EU-Badegewässer in der Region.\n\nKontakt: Kur- und Verkehrsverein Freilingen e.V., Campingplatz-Freilingen, Tel. (0049) 2666 287, www.campingplatz-freilingen.de",
    strasse: "Hohe Straße 30",
    plz: "56244",
    tel: "+49 2666 242526",
    mail: "info@campingplatz-freilingen.de",
    links: ["http://www.campingplatz-freilingen.de"],
    sourceUrl: "https://www.westerwald.info/d/strandbad-freilingen-4/"
  },
  {
    name: "Badestelle Krombachtalsperre Driedorf",
    ort: "Driedorf-Mademühlen",
    kurz: "Liegewiese, Kinderspielplatz, Volleyballfeld, Bolzplatz und Tischtennisplatte sowie eine Gaststätte.",
    detail: "Tages- und Ganzjahrescampingplatz — Segeln — Surfen — Schwimmen — Sonnenbaden.\n\nIm Hessischen Westerwald, inmitten von Wäldern und Wiesen, liegt ein Teil der Krombachtalsperre im Ortsteil Mademühlen. Der Krombachtalsperre ist ein Dauer- und Tagescampingplatz angegliedert, der ganzjährig geöffnet ist. Hier finden die Gäste im Sommer wie im Winter Ruhe und Erholung.\n\nAuf der Wasserfläche von 82,1 Hektar sind Segeln und Surfen aufgrund der guten Windverhältnisse immer möglich. Eine Surfschule ist vorhanden, die von Anfängern und Fortgeschrittenen gerne in Anspruch genommen wird. Die jährlich vom Segelclub Westerwald, der an der Krombachtalsperre beheimatet ist, durchgeführten Regatten erfreuen sich großer Beliebtheit.\n\nDie Liegewiese lädt Bade- und Sonnenfreunde zum Verweilen ein. Kinderspielplatz, Volleyballfeld, Bolzplatz und Tischtennisplatte sowie eine Gaststätte stehen den Gästen zur Verfügung. Die angrenzenden Rad- und Wanderwege stellen eine Erweiterung des Freizeitangebotes dar. Der Sonnenuntergang an der Krombachtalsperre ist ein besonderes Erlebnis zum Ausklang des Tages.\n\nHinweis: Die Benutzung der Badestellen geschieht auf eigene Gefahr! Es besteht keine Wasseraufsicht!\n\nAktuelle Information: Blaualgen — Sofortiges Badeverbot in der Krombachtalsperre. Nach Aartalsee ist nun auch der Stausee in Driedorf verstärkt von Blaualgen betroffen.",
    strasse: "An der Krombachtalsperre 4",
    plz: "35759",
    tel: "+49 2775 300",
    mail: "krombachtalsperre@gmail.com",
    links: ["http://www.camping-krombachtalsperre.de"],
    sourceUrl: "https://www.westerwald.info/d/badesee-krombachtalsperre-driedorf-1/"
  },
  {
    name: "Badestelle Heisterberger Weiher Driedorf",
    ort: "Driedorf",
    kurz: "Liegewiese, Sandstrand, Kinderspielplatz, Volleyballfeld, Bootsvermietung und Gaststätte mit Kiosk.",
    detail: "Tages- und Ganzjahrescampingplatz — Tretboote — Schwimmen — Sonnenbaden.\n\nIn der Nähe der Fuchskaute, der höchsten Erhebung des Westerwaldes, am Fuße des Höllberges, liegt der Heisterberger Weiher in reizvoller Westerwaldlandschaft. Dem Heisterberger Weiher ist ein Campingplatz mit modernem behindertengerechten Sanitärgebäude angegliedert, der ganzjährig geöffnet und bei Tages- sowie Dauercampinggästen beliebt ist.\n\nEin Kinderspielplatz und Volleyballfeld sind vorhanden. Die Wasserfläche von 9,6 Hektar lädt zum Baden ein und Wassersportmöglichkeiten werden durch die ansässige Bootsvermietung angeboten. Auf den weiträumigen Liegewiesen kann man die Hektik des Alltages vergessen. Das Angebot wird abgerundet durch eine Gaststätte mit Kiosk. Im Sommer bieten Rad- und Wanderwege eine Erweiterung des Freizeitangebotes.\n\nDas Mitführen und Baden von Hunden am See ist außerhalb des offiziellen Badestrandes und der Liegewiese erlaubt.\n\nAnfahrt: BAB 45 bis Herborn-West, Abfahrt Driedorf, B 255 bis Abfahrt Heisterberger Weiher.\nInfo: Platzverwaltung Tel. 02775 458\n\nHinweis: Die Benutzung der Badestellen geschieht auf eigene Gefahr! Es besteht keine Wasseraufsicht!",
    strasse: "Am Weiher 3",
    plz: "35759",
    tel: "+49 2775 458",
    mail: "cpheisterberger.weiher@gmail.com",
    links: ["http://www.camping-heisterberger-weiher.de"],
    sourceUrl: "https://www.westerwald.info/d/badesee-heisterberger-weiher-6/"
  },
  {
    name: "Secker Weiher",
    ort: "Seck",
    kurz: "Die Secker Weiher — vom fürstlichen Fischteich zum Naherholungsgebiet.",
    detail: "Genießen Sie die idyllische Lage der Secker Weiher. Der große und der kleine Weiher werden durch einen Damm voneinander getrennt. Der große Weiher wird von einem kleinen Bach gespeist und der Überlauf versorgt den kleinen Weiher mit Wasser. Die Weiher wurden 1672 von Fürst Moritz Heinrich von Nassau-Hadamar beauftragt, um die Fischversorgung in der Fastenzeit zu sichern. Heute bilden sie den Kern eines ruhigen und schönen Naherholungsgebiets, das mit Campingplatz und Gastronomie auch ein gutes Stück Infrastruktur bietet.\n\nDie Wasserqualität des Secker Weihers wird regelmäßig durch das Gesundheitsamt geprüft, so dass ungetrübter Badespaß geboten werden kann. Ein Spielplatz und die Matschspielanlage am Sandstrand sind für Kinder ein großer Spaß während die „Großen“ sich auf der Liegewiese sonnen & erholen können.\n\nEintrittspreise (Stand 2024):\nErwachsene 3 €\nKinder 4-14 Jahre 1 €\nHunde 1 € (Hunde sind nicht im See erlaubt, nur auf der Liegewiese)",
    strasse: "Weiherhof",
    plz: "56479",
    tel: "+49 2664 8555",
    mail: "info@camping-park-weiherhof.de",
    links: ["http://www.camping-park-weiherhof.de"],
    sourceUrl: "https://www.westerwald.info/d/secker-weiher-12/"
  },
  {
    name: "Badestelle Aartalsee Niederweidbach",
    ort: "Bischoffen-Niederweidbach",
    kurz: "Die Badestelle ist in den Sommermonaten geöffnet.",
    detail: "Im Bereich des Restaurants Seeterrasse lädt die Badestelle zum Eintauchen ins erfrischende Nass unseres schönen Sees ein. Entspannen Sie sich an unserer Badestelle mit Liegewiese und genießen Sie sonnige Tage inmitten der Natur, umgeben von sanften, grünen Hügeln und dem Glitzern der Sonnenstrahlen auf dem Wasser — ein schöner Ort, um dem Alltag zu entfliehen und die Seele baumeln zu lassen.\n\nBitte beachten: Die Benutzung der Badestelle geschieht auf eigene Gefahr. Es besteht keine Wasseraufsicht. Eltern bzw. Begleitpersonen haben auf ihre Kinder bzw. zu betreuenden Personen zu achten und haften für diese. Der Zugang zum Badestellengelände erfolgt nur über die gekennzeichneten Eingänge. Ein Hineinspringen, Hineinstoßen oder Hineinwerfen anderer Personen in die Badestelle ist nicht zulässig. Das Hineinspringen in die Badestelle insbesondere kopfüber ist wegen der damit verbundenen besonderen Gefahr verboten.\n\nText: Gemeinde Bischoffen",
    strasse: "Am See 12",
    plz: "35649",
    tel: "+49 6444 9313999",
    mail: "info@restaurant-seeterrasse.com",
    links: ["https://www.restaurant-seeterrasse.com/"],
    sourceUrl: "https://www.westerwald.info/d/badestrand-und-seeterrasse-aartalsee-bischoffen/"
  },
  {
    name: "Segeln und Rudern auf dem Aartalsee in Bischoffen",
    ort: "Bischoffen",
    kurz: "54 Wasser-/Stegliegeplätze und 46 Landliegeplätze.",
    detail: "Das Vereinsgelände des Segel- und Ruderclub Aartalsee finden Sie am Nordufer der Aartalsperre in der Gemeinde Bischoffen. Außer dem Angebot der zum Segeln nötigen Infrastruktur wie z.B. Bootsliegeplätze, Bootskran und Slippwege finden hier Jugendaktivitäten statt um Kindern und Jugendlichen den Segelsport näher zu bringen. Einer großen Anzahl von Mitgliedern und Gastseglern wird die Nutzung der Bootsliegeplätze ermöglicht, es können gegenwärtig 54 Wasser-/Stegliegeplätze und 46 Landliegeplätze vergeben werden.\n\nHinweis: Kein Bootsverleih. Keine Möglichkeit zum Ablegen der Segelscheinprüfung.",
    strasse: "Am Aartalsee",
    plz: "35649",
    tel: "+49 6444 1211",
    mail: "srcaartal@gmx.de",
    links: ["http://www.srca.de"],
    sourceUrl: "https://www.westerwald.info/d/segeln-und-rudern-beim-segel-und-ruderclub-aartal-2/"
  },
  {
    name: "Naturbad Seeweiher Wäller Camp",
    ort: "Mengerskirchen",
    kurz: "Der Seeweiher befindet sich zwischen Mengerskirchen und Waldernbach. Strandbad mit Liegewiese, Beachbar, Spielplatz und Outdoor-Sportangeboten. Großer Wohnmobilhafen und NaturCamp.",
    detail: "Endlich wieder geöffnet: Das Seeweiher-Freibad ist seit über 30 Jahren ein beliebter Treffpunkt in der Region. Nach zwei Jahren ohne Badebetrieb wurde es vom neuen Betreiber umfassend saniert und im Jahr 2021 wiedereröffnet. Fortan bildet das Naturseebad mit Liegewiese, Sandstrand, Steg und Schwimmplattform den geselligen Mittelpunkt des Campingplatzes „Wäller Camp“ — sowohl für Camping- als auch für ausschließliche Badegäste. Eine Tiki-Beachbar mit Lounge-Bestuhlung, Strandkörben und lauschiger Musik rundet das Freizeiterlebnis ab.\n\nEinrichtungen: Umkleiden und Außenduschen befinden sich direkt am Strand. Wer eine warme Dusche und mehr Intimität bevorzugt, kann auch den komfortablen Camping-Sanitärbereich neben der Rezeption aufsuchen. Für Campinggäste ist die Nutzung kostenlos, ebenso wie der Zutritt zum Naturseebad. Für Seebadgäste wird eine Gebühr fällig. Auch den Liegeplatz am Strand kann man gegen Gebühr aufwerten und Liegen sowie Sonnenschirme leihen.\n\nEssen und Trinken: Die Strandbar hat nicht nur Kaffeevariationen und Schwimmbadklassiker wie Softgetränke oder Bier im Angebot, sondern beispielsweise auch eine Weinauswahl, Gin Tonic und Cocktails. Für den Hunger zwischendurch gibt es aus einem Seecontainer-Imbiss nebenan Deftiges direkt auf die Hand: Pommes und Wurstklassiker, aber auch Flammkuchen. Ein Softeisautomat ist ebenfalls vorhanden.\n\nSport und Action: Im Wasser ist die Nutzung von eigenen Schlauchbooten oder aufblasbaren Boards zum Stand-Up-Paddeln gestattet. Ein Dschungel-Spielplatz, ein Beachvolleyballfeld und Spielmöglichkeiten für Knirpse auf der weitläufigen Badewiese ergänzen den Wasserspaß. Aktiv werden kann man auch beim wöchentlichen Outdoor-Sport mit externem Trainer (gegen Gebühr). Regelmäßige Sport- und Entertainment-Events mit lokalen Anbietern sorgen für Abwechslung.\n\nSicherheit: Der markierte Nichtschwimmerbereich sowie die Tatsache, dass der zum Schwimmen freigegebene Teil des Sees unter DLRG-Aufsicht steht, geben Sicherheit. Insbesondere für Familien mit Kindern ist aber auch die gute Einsehbarkeit der Anlage eine Erwähnung wert. Denn man kann in der Strandbar in Ruhe einen Latte macchiato genießen, während die Kinder in Sichtweite planschen oder spielen.\n\nPreisinformation:\nTagespreise: Erwachsene 4,50 €; Kinder (3-15 Jahre) 2,50 €.\nParkkosten: 4 Stunden 1,50 €, jede weitere Stunde 0,50 €, Maximalbetrag 5 €.",
    strasse: "Am Seeweiher 1",
    plz: "35794",
    tel: "+49 6476 4190160",
    mail: "info@waeller-camp.de",
    links: ["https://www.waeller-camp.de/badespass-freizeit/ueberblick/"],
    sourceUrl: "https://www.westerwald.info/d/naturbad-seeweiher-waeller-camp/"
  },
  {
    name: "Badestelle Stauweiher Ewersbach",
    ort: "Dietzhölztal",
    kurz: "Der naturnahe Stauweiher bietet für Familien im Sommer ungetrübten Badespaß.",
    detail: "Die Gemeinde Dietzhölztal betreibt die Badestelle „Stauweiher Ewersbach“, für die während der vom 01. Mai bis 24. September laufenden Badesaison bestimmte Badezeiten gelten.\n\nDiese und weitere Regelungen zum Badebetrieb enthält die Bade- und Benutzungsordnung für die Badestelle „Stauweiher Ewersbach“, die hiermit amtlich bekannt gemacht wird.\n\nWährend der Zeit der hessischen Sommerferien (15.07. bis 23.08.2024) ist die Badestelle „Stauweiher Ewersbach“, je nach Witterung, von 12 bis 20 Uhr geöffnet.\n\nText: Gemeinde Dietzhölztal",
    strasse: "Im Blumenfeld",
    plz: "35716",
    tel: "+49 2774 80726",
    mail: "info@dietzhoelztal.de",
    links: ["https://www.dietzhoelztal.de/freizeit-tourismus/stauweiher/"],
    sourceUrl: "https://www.westerwald.info/d/freibad-stauweiher-ewersbach-4/"
  },
  {
    name: "Waldschwimmbad Thalhausermühle Hamm (Sieg)",
    ort: "Hamm (Sieg)",
    kurz: "Natürlich Plantschen im größten Naturbad der Region.",
    detail: "Waldschwimmbad Thalhausermühle — Natürlich Plantschen.\n\nDas Frei- und Waldschwimmbad „Thalhausermühle“ ist das größte Naturfreibad des Westerwaldes mit einer Wasserfläche von 16.000 qm und Liegewiesen von 15.000 qm.\n\nDie riesige Wasserfläche und fast ebenso viele weitläufige und gepflegte Liegewiesen inmitten vom Wald laden zum Verweilen ein. Chemikalien jedweder Art haben keinen „Zutritt“ zum Gewässer. Für die Wasserqualität ist die Natur verantwortlich, denn das größte Naturbad in der Region wird mit Wasser aus dem Seelbach und dem Marienthaler Stollen gespeist. „Natur pur“ in jeglicher Hinsicht. Kein Wunder, dass sich im Naturfreibad auch Fische pudelwohl fühlen. Die Wasserqualität wird regelmäßig vom Landesamt für Umwelt geprüft. Das Schwimmbad ist aufgeteilt in einen Schwimmer- und einen Nichtschwimmerbereich. Die maximale Wassertiefe liegt bei vier Meter. Ein Kiosk ergänzt das Angebot im Waldschwimmbad.\n\nSeit 2024 NEU: mit Beachvolleyball-Anlage und Abenteuer-Wasserspielplatz.\n\nAuch Abenteuerlustige kommen hier auf ihre Kosten: Wie wäre es mit einem Sprung aus 1 oder 3 Meter Höhe vom Sprungturm? Oder möchten Sie bis zu 7 Höhenmeter an der Wasserkletterwand erklimmen? Auch die Riesenrutsche verspricht jede Menge Spaß!\n\nAktuelle Information: Seit dem 31. August 2025 geschlossen. Die diesjährige Badesaison ist zu Ende. Tickets gibt es erst in der Badesaison 2026 zu erwerben. Die Badesaison startet jedes Jahr etwa ab Mitte Juni; bis zum Ende der rheinland-pfälzischen Sommerferien endet sie wetterabhängig in der letzten Augustwoche. Hunde mitzubringen ist nicht erlaubt.\n\nReguläre Preise:\nKinder bis 6 Jahre: Eintritt frei.\nTagestickets: Erwachsene 4,00 € (nach 17 Uhr 3,00 €); Minderjährige 2,50 € (nach 17 Uhr 2,00 €); Schwerbehinderte 2,50 € (nach 17 Uhr 2,00 €); Person mit Ehrenamtskarte 2,00 €.\nMehrfachtickets: 10er-Karte Erwachsene 32,00 €; 10er-Karte Minderjährige 20,00 €; 10er-Karte Schwerbehinderte 20,00 €; Jahreskarte 50,00 €.\nVerkauf ausschließlich vor Ort! Nur Barkasse, keine Kartenzahlung!",
    strasse: "Thalhauser Mühle",
    plz: "57577",
    tel: "+49 2682 969789",
    mail: "tourismus@hamm-sieg.de",
    links: [],
    sourceUrl: "https://www.westerwald.info/d/waldschwimmbad-thalhausermuehle-hamm-sieg/"
  }
];