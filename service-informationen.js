// service-informationen.js
// Service & Informationen für die Kategorie Radfahren
// Quelle: westerwald.info (Westerwald Touristik-Service)
// Stand: April 2026

var DATA_VERLEIHSTATIONEN = [
  {
    name: "Schnellrad E-Bike Verleih Hachenburg",
    strasse: "Koblenzer Str. 38a",
    plz: "57627",
    ort: "Hachenburg",
    tel: "+49 2662 9319770",
    mail: "info@schnellrad.de",
    web: "",
    sourceUrl: "https://www.westerwald.info/d/e-bike-verleih-hachenburg-schnellrad/"
  },
  {
    name: "Camping im Eichenwald",
    strasse: "Roddern 1",
    plz: "57537",
    ort: "Mittelhof",
    tel: "+49 2742 910643",
    mail: "camping@hatzfeldt.de",
    web: "",
    sourceUrl: "https://www.westerwald.info/d/camping-im-eichenwald-rmzld1kq/"
  },
  {
    name: "Wällersport",
    strasse: "Siegener Straße 65a",
    plz: "57610",
    ort: "Altenkirchen",
    tel: "+49 2681 8249200",
    mail: "info@waellersport.de",
    web: "",
    sourceUrl: "https://www.westerwald.info/d/waellersport/"
  },
  {
    name: "E-Bike Verleih Waldbreitbach",
    strasse: "Neuwieder Straße 61",
    plz: "56588",
    ort: "Waldbreitbach",
    tel: "+49 2638 4017",
    mail: "info@wiedtal.de",
    web: "http://www.wiedtal.de",
    sourceUrl: "https://www.westerwald.info/d/e-bike-verleih-waldbreitbach-1/"
  },
  {
    name: "Leichterfahren Elektrorad-Zentrum Wissenbach",
    strasse: "Dietzhölzstraße 6",
    plz: "35713",
    ort: "Eschenburg-Wissenbach",
    tel: "+49 2774 918477",
    mail: "info@leichter-fahren.de",
    web: "http://www.leichter-fahren.de",
    sourceUrl: "https://www.westerwald.info/d/leichterfahren-elektrorad-zentrum-wissenbach/"
  },
  {
    name: "Fahrradverleih im Westerwaldtreff",
    strasse: "In der Huth 1",
    plz: "57641",
    ort: "Oberlahr",
    tel: "+49 2685 870",
    mail: "info@westerwaldtreff.de",
    web: "https://www.westerwaldtreff.de/sport-freizeit-wellness/sport/fahrradverleih",
    sourceUrl: "https://www.westerwald.info/d/fahrradverleih-im-westerwaldtreff/"
  },
  {
    name: "Fahrradladen Bike Garage Haiger",
    strasse: "Westerwaldstraße 21A",
    plz: "35708",
    ort: "Haiger",
    tel: "+49 2773 942016",
    mail: "info@bikegarage-haiger.de",
    web: "http://www.bikegarage-haiger.de",
    sourceUrl: "https://www.westerwald.info/d/fahrradladen-bike-garage-haiger/"
  }
];

var DATA_RADWERKSTAETTEN = [
  {
    name: "Schnellrad E-Bike Verleih Hachenburg",
    strasse: "Koblenzer Str. 38a",
    plz: "57627",
    ort: "Hachenburg",
    tel: "+49 2662 9319770",
    mail: "info@schnellrad.de",
    web: "",
    sourceUrl: "https://www.westerwald.info/d/e-bike-verleih-hachenburg-schnellrad/"
  },
  {
    name: "Wällersport",
    strasse: "Siegener Straße 65a",
    plz: "57610",
    ort: "Altenkirchen",
    tel: "+49 2681 8249200",
    mail: "info@waellersport.de",
    web: "",
    sourceUrl: "https://www.westerwald.info/d/waellersport/"
  },
  {
    name: "Schneider Sports",
    strasse: "Konrad-Adenauer-Straße 64",
    plz: "35745",
    ort: "Herborn",
    tel: "+49 2772 57280",
    mail: "info@schneider-sports.de",
    web: "http://www.schneider-sports.de",
    sourceUrl: "https://www.westerwald.info/d/schneider-sports-2/"
  },
  {
    name: "Fahrradladen Bike Garage Haiger",
    strasse: "Westerwaldstraße 21A",
    plz: "35708",
    ort: "Haiger",
    tel: "+49 2773 942016",
    mail: "info@bikegarage-haiger.de",
    web: "http://www.bikegarage-haiger.de",
    sourceUrl: "https://www.westerwald.info/d/fahrradladen-bike-garage-haiger/"
  },
  {
    name: "Fahrrad-Reparaturstation am Wilhelmsteg",
    strasse: "Alter Markt 4-6",
    plz: "57627",
    ort: "Hachenburg",
    tel: "+49 2662 9699760",
    mail: "info@hachenburger-westerwald.de",
    web: "https://www.hachenburger-westerwald.de/",
    sourceUrl: "https://www.westerwald.info/d/fahrrad-reparaturstation-am-wilhelmsteg-1/"
  },
  {
    name: "Leichterfahren Elektrorad-Zentrum Wissenbach",
    strasse: "Dietzhölzstraße 6",
    plz: "35713",
    ort: "Eschenburg-Wissenbach",
    tel: "+49 2774 918477",
    mail: "info@leichter-fahren.de",
    web: "http://www.leichter-fahren.de",
    sourceUrl: "https://www.westerwald.info/d/leichterfahren-elektrorad-zentrum-wissenbach/"
  },
  {
    name: "Bike Factory Dillenburg",
    strasse: "Industriestraße 1",
    plz: "35684",
    ort: "Dillenburg-Frohnhausen",
    tel: "+49 2771 8488624",
    mail: "info@bikefactory-frohnhausen.de",
    web: "https://www.bikefactory-frohnhausen.de/",
    sourceUrl: "https://www.westerwald.info/d/bike-factory-dillenburg/"
  },
  {
    name: "Tretmühle Betzdorf",
    strasse: "Wilhelmstraße 29",
    plz: "57518",
    ort: "Betzdorf",
    tel: "+49 2741 4179",
    mail: "info@tretmuehlegmbh.de",
    web: "",
    sourceUrl: "https://www.westerwald.info/d/tretmuehle-betzdorf-1/"
  },
  {
    name: "Tretmühle Wissen",
    strasse: "Rathausstraße 30",
    plz: "57537",
    ort: "Wissen",
    tel: "+49 2742 910123",
    mail: "info@tretmuehlegmbh.de",
    web: "",
    sourceUrl: "https://www.westerwald.info/d/tretmuehle-wissen/"
  },
  {
    name: "Zweiradhaus Kämpflein",
    strasse: "Mittelstr. 35+37",
    plz: "57567",
    ort: "Daaden",
    tel: "+49 2743 930204",
    mail: "kaempflein@t-online.de",
    web: "https://www.kaempflein-zweirad.de",
    sourceUrl: "https://www.westerwald.info/d/zweiradhaus-kaempflein/"
  },
  {
    name: "Bikesport Meyer",
    strasse: "Betzdorfer Str. 3",
    plz: "57567",
    ort: "Daaden",
    tel: "+49 2743 932161",
    mail: "info@bikesport-meyer.de",
    web: "",
    sourceUrl: "https://www.westerwald.info/d/bikesport/"
  },
  {
    // Hinweis: westerwald.info führt für diese Reparaturstation die Adresse
    // "Alter Markt 4-6, Hachenburg" — vermutlich Copy-Paste-Fehler in der Quelle.
    // Tatsächlicher Standort dürfte am Dreifelder Weiher / Haus am See liegen.
    name: "Fahrrad-Reparaturstation am Dreifelder Weiher (Haus am See)",
    strasse: "Alter Markt 4-6",
    plz: "57627",
    ort: "Hachenburg",
    tel: "+49 2662 9699760",
    mail: "info@hachenburger-westerwald.de",
    web: "https://www.hachenburger-westerwald.de/",
    sourceUrl: "https://www.westerwald.info/d/fahrrad-reparaturstation-am-dreifelder-weiher-haus-am-see/"
  },
  {
    name: "Radservice-Station Stahlhofen am Wiesensee",
    strasse: "Winner Ufer 9",
    plz: "56459",
    ort: "Stahlhofen am Wiesensee",
    tel: "+49 2663 291494",
    mail: "post@waellerland.com",
    web: "https://waellerland.com",
    sourceUrl: "https://www.westerwald.info/d/radservice-station-ukpfof0s/"
  },
  {
    name: "Radservice-Station Willmenrod",
    strasse: "Brückenstraße 20",
    plz: "56459",
    ort: "Willmenrod",
    tel: "+49 2663 9176093",
    mail: "",
    web: "https://www.willmenrod.de",
    sourceUrl: "https://www.westerwald.info/d/radservice-station-nqnoh11h/"
  },
  {
    name: "ADAC Radservice-Station am Wiedradweg",
    strasse: "Neuwieder Straße 61",
    plz: "56588",
    ort: "Waldbreitbach",
    tel: "+49 2638 4017",
    mail: "info@wiedtal.de",
    web: "http://www.wiedtal.de",
    sourceUrl: "https://www.westerwald.info/d/adac-radservice-station-am-wiedradweg/"
  }
];
