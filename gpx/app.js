/* ════════════════════════════════════════════════════════════════
   Westerwald App – Routing + Render-Engine v3
   ════════════════════════════════════════════════════════════════ */

'use strict';

// ════════════════════════════════════════════════════════════════
// CLOUDFLARE WORKER PROXY (für Seiten mit X-Frame-Options)
// Hier deine Worker-URL eintragen (ohne /?url=...), Beispiel:
//   var WW_PROXY = 'https://westerwald-proxy.dein-name.workers.dev';
// Solange leer ('') zeigt die App eine "Seite öffnen"-Karte als
// Fallback für blockierte Seiten.
// ════════════════════════════════════════════════════════════════
var WW_PROXY = '';
function ggfProxy(url) {
  if (!WW_PROXY) return null;
  return WW_PROXY.replace(/\/$/, '') + '/?url=' + encodeURIComponent(url);
}

window.addEventListener('DOMContentLoaded', function() {
  initSplash();
  initCookieGate();

  // Header → wir-westerwaelder.de
  var hdr = document.getElementById('app-header-link');
  if (hdr) hdr.addEventListener('click', function() {
    window.open('https://www.wir-westerwaelder.de', '_blank', 'noopener');
  });

  // Header-Höhe messen und als CSS-Variable setzen, damit alle sticky-Bereiche
  // sauber DARUNTER andocken (Banner ist sticky, sticky-region/sticky-detail
  // sollen direkt darunter kleben).
  measureHeaderHeight();
  window.addEventListener('resize', measureHeaderHeight);
  // Auch bei Bild-Ladung (Banner-Bild) neu messen
  var hdrImg = document.querySelector('.app-header img');
  if (hdrImg) hdrImg.addEventListener('load', measureHeaderHeight);

  // Pinch-Zoom für Dropdown-Inhalte aktivieren
  initPinchZoom();

  // Footer-Modals
  document.querySelectorAll('[data-modal]').forEach(function(el) {
    el.addEventListener('click', function(e) {
      e.preventDefault();
      oeffneModal(el.getAttribute('data-modal'));
    });
  });
  document.getElementById('modal-schliessen').addEventListener('click', schliesseModal);
  document.getElementById('modal-overlay').addEventListener('click', function(e) {
    if (e.target.id === 'modal-overlay') schliesseModal();
  });
});

function measureHeaderHeight() {
  var h = document.querySelector('.app-header');
  if (!h) return;
  var px = Math.round(h.getBoundingClientRect().height);
  document.documentElement.style.setProperty('--header-h', px + 'px');
}

// ════════════════════════════════════════════════════════════════
// PINCH-ZOOM für Dropdown-Inhalte
// Zwei-Finger-Geste auf .dropdown-inhalt skaliert font-size dieses
// Containers (NICHT das ganze Layout). Zeilenumbrüche bleiben sauber,
// weil nur font-size wächst.
// Bedienung:
//   • Zwei Finger auseinanderziehen → Schrift größer
//   • Zwei Finger zusammenführen   → Schrift kleiner
//   • Bereich: 100% (default) bis 220% / 80%
//   • Doppeltipp setzt zurück
// Pro Dropdown wird der individuelle Skalierungsfaktor merken
// (data-zoom-Attribut). Das Resetten beim Schließen ist nicht nötig –
// es bleibt erhalten, bis der Container neu gerendert wird.
// ════════════════════════════════════════════════════════════════
var PINCH_MIN = 0.8;
var PINCH_MAX = 2.2;
var PINCH_BASE_FONT = 15; // muss zu CSS .dropdown-inhalt passen

function initPinchZoom() {
  // Touch-Listener am gesamten App-Container, dann delegieren
  var app = document.getElementById('app') || document.body;
  if (app.__pinchInit) return;
  app.__pinchInit = true;

  var state = null;
  // Zeitstempel des letzten Pinch-Endes – verhindert, dass das gleichzeitige
  // Hochheben beider Finger als „Doppeltipp“ fehlinterpretiert wird.
  var letztesPinchEnde = 0;

  app.addEventListener('touchstart', function(e) {
    if (e.touches.length !== 2) return;
    var ziel = findPinchTarget(e.target);
    if (!ziel) return;
    e.preventDefault();
    var d = pinchDist(e.touches[0], e.touches[1]);
    var startSkala = parseFloat(ziel.getAttribute('data-zoom') || '1');
    state = { ziel: ziel, startDist: d, startSkala: startSkala, hatGezoomt: false };
  }, { passive: false });

  app.addEventListener('touchmove', function(e) {
    if (!state || e.touches.length !== 2) return;
    e.preventDefault();
    var d = pinchDist(e.touches[0], e.touches[1]);
    var faktor = d / state.startDist;
    var neueSkala = Math.max(PINCH_MIN, Math.min(PINCH_MAX, state.startSkala * faktor));
    // Nur als „echten“ Zoom werten, wenn die Distanz sich messbar geändert hat
    if (Math.abs(faktor - 1) > 0.05) state.hatGezoomt = true;
    setPinchZoom(state.ziel, neueSkala);
  }, { passive: false });

  app.addEventListener('touchend', function(e) {
    if (!state) return;
    // Sobald Finger-Anzahl unter 2 fällt, Pinch-Geste beenden – aber den
    // Zoom-Wert behalten (war ja absichtlich vom User gesetzt).
    if (e.touches.length < 2) {
      if (state.hatGezoomt) {
        // Sperre Doppeltap-Reset für 600 ms nach Pinch-Ende: das gleichzeitige
        // Hochheben beider Finger erzeugt sonst zwei touchend-Events binnen
        // weniger Millisekunden und triggert den Reset fälschlich.
        letztesPinchEnde = Date.now();
      }
      state = null;
    }
  }, { passive: true });

  // Doppel-Tipp zum Zurücksetzen
  var letzterTap = 0;
  app.addEventListener('touchend', function(e) {
    // Während/direkt nach einem Pinch nicht als Tap zählen
    if (state) return;
    if (Date.now() - letztesPinchEnde < 600) return;
    // Nur Single-Finger-Taps werten
    if (e.changedTouches && e.changedTouches.length > 1) return;

    var jetzt = Date.now();
    if (jetzt - letzterTap < 300) {
      var ziel = findPinchTarget(e.target);
      if (ziel && ziel.getAttribute('data-zoom') && ziel.getAttribute('data-zoom') !== '1') {
        setPinchZoom(ziel, 1);
      }
      letzterTap = 0; // Reset, damit kein Triple-Tap
    } else {
      letzterTap = jetzt;
    }
  }, { passive: true });
}

function findPinchTarget(el) {
  while (el && el !== document.body) {
    if (el.classList && el.classList.contains('dropdown-inhalt')) return el;
    el = el.parentNode;
  }
  return null;
}

function pinchDist(t1, t2) {
  var dx = t2.clientX - t1.clientX;
  var dy = t2.clientY - t1.clientY;
  return Math.sqrt(dx*dx + dy*dy);
}

function setPinchZoom(el, skala) {
  el.setAttribute('data-zoom', skala.toFixed(2));
  el.style.fontSize = (PINCH_BASE_FONT * skala).toFixed(1) + 'px';
}

window.addEventListener('hashchange', router);

// ════════════════════════════════════════════════════════════════
// SPLASH
// ════════════════════════════════════════════════════════════════
function initSplash() {
  // Choreographie: links Sprechblase „Hui Wäller?", dann zwinkern,
  // dann rechts Sprechblase „Allemol!", dann ausblenden.
  var bubble1 = document.getElementById('sprechblase-1');
  var bubble2 = document.getElementById('sprechblase-2');
  var lidL    = document.getElementById('lid-links');
  var lidR    = document.getElementById('lid-rechts');
  var overlay = document.getElementById('eichhoernchen-overlay');

  function zwinker() {
    if (!lidL || !lidR) return;
    lidL.classList.remove('zwinkern');
    lidR.classList.remove('zwinkern');
    // Force-Reflow, damit die Animation neu startet
    void lidL.offsetWidth;
    lidL.classList.add('zwinkern');
    lidR.classList.add('zwinkern');
  }

  // 1. Bubble links erscheint nach 400ms
  setTimeout(function() { if (bubble1) bubble1.classList.add('sichtbar'); }, 400);
  // 2. Zwinkern bei 1100ms
  setTimeout(zwinker, 1100);
  // 3. Bubble rechts erscheint nach 1800ms (links bleibt aber sichtbar)
  setTimeout(function() { if (bubble2) bubble2.classList.add('sichtbar'); }, 1800);
  // 4. Zwinkern bei 2400ms
  setTimeout(zwinker, 2400);
  // 5. Splash ausblenden bei 3300ms (übergibt an Cookie-Gate)
  setTimeout(function() {
    if (overlay) overlay.classList.add('weg');
  }, 3300);
  // 6. DOM-Element komplett entfernen nach Fade-out
  setTimeout(function() {
    if (overlay) overlay.style.display = 'none';
  }, 3800);
}

// ════════════════════════════════════════════════════════════════
// COOKIE-GATE / DATENSCHUTZ-AKZEPTANZ
// Strikt: bei JEDEM Öffnen der App muss neu akzeptiert werden.
// Es wird NICHTS gespeichert – kein localStorage, kein Cookie.
// Solange nicht aktiv akzeptiert wurde, läuft KEIN router() und
// wird KEINE App gerendert.
// ════════════════════════════════════════════════════════════════
function initCookieGate() {
  var ov  = document.getElementById('cookie-overlay');
  var btn = document.getElementById('cookie-akzeptieren');
  var app = document.getElementById('app');

  // App initial verstecken bis Akzeptanz
  if (app) app.style.visibility = 'hidden';

  function freischalten() {
    if (app) app.style.visibility = '';
    router();
  }

  // Overlay erscheint nach Splash-Ende
  setTimeout(function() {
    if (ov) ov.style.display = 'flex';
  }, 3400);

  if (btn) {
    btn.addEventListener('click', function() {
      if (ov) ov.style.display = 'none';
      freischalten();
    });
  }
}

// ════════════════════════════════════════════════════════════════
// MODALS
// ════════════════════════════════════════════════════════════════
function oeffneModal(name) {
  var inhalt = '';
  var titel = '';
  if (name === 'impressum')        { inhalt = window._IMPRESSUM_HTML || ''; titel = 'Impressum'; }
  else if (name === 'datenschutz') { inhalt = window._DATENSCHUTZ_HTML || ''; titel = 'Datenschutzerklärung'; }
  else if (name === 'barrierefreiheit') {
    var aktiv = document.body.classList.contains('barrierefrei');
    inhalt =
      '<div class="bf-toggle-box">'
        + '<h3>Barrierefreier Modus</h3>'
        + '<p>Wenn du den barrierefreien Modus einschaltest, werden alle Schriften deutlich vergrößert, Kontraste erhöht, Animationen reduziert und Tasten/Links besser sichtbar. Touch-Ziele werden mindestens 48&times;48 Pixel groß.</p>'
        + '<button class="bf-toggle-btn ' + (aktiv ? 'bf-an' : '') + '" onclick="toggleBarrierefrei()">'
          + '<span class="bf-toggle-status">' + (aktiv ? '✓ AN' : 'AUS') + '</span>'
          + '<span class="bf-toggle-label">Barrierefreier Modus</span>'
        + '</button>'
        + '<p class="bf-toggle-hinweis"><em>Hinweis: Der Modus wird beim nächsten App-Start zurückgesetzt – Dein Datenschutz hat Vorrang.</em></p>'
      + '</div>'
      + '<h3>Erklärung zur Barrierefreiheit</h3>'
      + '<p>Die Wir Westerwälder gAöR ist bestrebt, ihre App im Einklang mit den nationalen Rechtsvorschriften zur Umsetzung der Richtlinie (EU) 2016/2102 des Europäischen Parlaments und des Rates barrierefrei zugänglich zu machen.</p>'
      + '<p>Diese Erklärung zur Barrierefreiheit gilt für die Web-App <strong>„Guck ma, Westerwald"</strong>.</p>'

      + '<h3>Stand der Vereinbarkeit mit den Anforderungen</h3>'
      + '<p>Diese App ist mit der Barrierefreie-Informationstechnik-Verordnung (BITV 2.0) und den Web Content Accessibility Guidelines (WCAG) 2.1 Level AA <strong>weitgehend vereinbar</strong>. Folgende Maßnahmen sind umgesetzt:</p>'
      + '<ul>'
        + '<li>Semantisches HTML mit klarer Überschriften-Hierarchie</li>'
        + '<li>Tastatur-Bedienbarkeit aller interaktiven Elemente</li>'
        + '<li>Mindestkontrast 4,5:1 für alle Texte</li>'
        + '<li>Skalierbare Schriftgrößen (Pinch-to-Zoom in Inhaltsbereichen)</li>'
        + '<li>Optionaler barrierefreier Modus mit erhöhter Lesbarkeit (siehe oben)</li>'
        + '<li>Aussagekräftige Linktexte und ARIA-Labels</li>'
        + '<li>Alternativtexte für Logos und dekorative Bilder</li>'
        + '<li>Fokus-Indikatoren für die Tastatur-Navigation</li>'
      + '</ul>'

      + '<h3>Nicht barrierefreie Inhalte</h3>'
      + '<p>Die folgenden Inhalte sind aus den genannten Gründen nicht oder nur eingeschränkt barrierefrei:</p>'
      + '<ul>'
        + '<li><strong>Eingebettete externe PDF-Dokumente</strong> (z. B. Einkaufsführer, Naturgenuss-Broschüre): Diese werden durch externe Drittanbieter bereitgestellt und können nicht durch die App barrierefrei aufbereitet werden.</li>'
        + '<li><strong>Eingebettete Webseiten Dritter</strong> (z. B. westerwald.info, Westerwaldbus, VRM): Diese Inhalte unterliegen der Verantwortung der jeweiligen Anbieter.</li>'
        + '<li><strong>Logos der Direktvermarkter</strong>: Diese werden direkt vom Anbieter wir-westerwaelder.de geladen und enthalten keine ausführlichen Alt-Texte.</li>'
      + '</ul>'

      + '<h3>Erstellung dieser Erklärung</h3>'
      + '<p>Diese Erklärung wurde am 06. Mai 2026 erstellt. Sie beruht auf einer Selbstbewertung.</p>'

      + '<h3>Feedback und Kontaktangaben</h3>'
      + '<p>Sind Ihnen Mängel beim barrierefreien Zugang zu Inhalten dieser App aufgefallen? Bitte teilen Sie uns dies mit. Wir bemühen uns, festgestellte Barrieren zeitnah zu beheben.</p>'
      + '<p><strong>Kontakt:</strong><br>'
        + 'Wir Westerwälder gAöR<br>'
        + 'Königsberger Str. 40, 56269 Dierdorf<br>'
        + 'E-Mail: <a href="mailto:info@wir-westerwaelder.de">info@wir-westerwaelder.de</a><br>'
        + 'Telefon: <a href="tel:+49268995929-40">02689 95929-40</a></p>'

      + '<h3>Schlichtungsverfahren</h3>'
      + '<p>Beim Beauftragten der Bundesregierung für die Belange von Menschen mit Behinderungen kann ein Schlichtungsverfahren nach § 16 BGG beantragt werden:</p>'
      + '<p>Schlichtungsstelle nach dem Behindertengleichstellungsgesetz<br>'
        + 'bei dem Beauftragten der Bundesregierung für die Belange von Menschen mit Behinderungen<br>'
        + 'Mauerstraße 53<br>'
        + '10117 Berlin<br>'
        + 'Telefon: 030 18 527-2805<br>'
        + 'E-Mail: <a href="mailto:info@schlichtungsstelle-bgg.de">info@schlichtungsstelle-bgg.de</a><br>'
        + 'Internet: <a href="https://www.schlichtungsstelle-bgg.de" target="_blank" rel="noopener">www.schlichtungsstelle-bgg.de</a></p>';
    titel = 'Barrierefreiheit';
  }
  if (!inhalt) return;
  document.getElementById('modal-titel').textContent = titel;
  document.getElementById('modal-inhalt').innerHTML = inhalt;
  document.getElementById('modal-overlay').classList.add('aktiv');
  document.body.classList.add('modal-offen');
  document.getElementById('modal-inhalt').scrollTop = 0;
}
function schliesseModal() {
  document.getElementById('modal-overlay').classList.remove('aktiv');
  document.body.classList.remove('modal-offen');
}

// ════════════════════════════════════════════════════════════════
// BARRIEREFREIER MODUS – Toggle (kein localStorage, gilt nur für Session)
// ════════════════════════════════════════════════════════════════
function toggleBarrierefrei() {
  var aktiv = document.body.classList.toggle('barrierefrei');
  // Modal neu rendern, damit der Knopf-Status aktualisiert wird
  oeffneModal('barrierefreiheit');
}
window.toggleBarrierefrei = toggleBarrierefrei;

// ════════════════════════════════════════════════════════════════
// ROUTER
// ════════════════════════════════════════════════════════════════
function router() {
  var hash = window.location.hash.slice(1) || 'home';
  var teile = hash.split('/');
  var ziel = document.getElementById('content');
  ziel.innerHTML = '';
  document.body.classList.toggle('home-page', teile[0] === 'home' || teile[0] === '');
  window.scrollTo(0, 0);

  if (teile[0] === 'home' || teile[0] === '') renderHome(ziel);
  else if (teile[0] === 'kategorie' && teile[1]) renderKategorie(ziel, teile[1]);
  else if (teile[0] === 'liste' && teile[1])    renderListe(ziel, teile[1]);
  else if (teile[0] === 'detail' && teile[1] && teile[2]) renderDetail(ziel, teile[1], teile[2]);
  else if (teile[0] === 'karte'  && teile[1] && teile[2]) renderKarte(ziel, teile[1], teile[2]);
  else renderHome(ziel);
}
function navigateTo(pfad) { window.location.hash = pfad; }

// ════════════════════════════════════════════════════════════════
// LAYOUT-BAUSTEINE
// ════════════════════════════════════════════════════════════════
function intro(gruss, untertitel, animiert) {
  // Default: animieren wann immer ein Untertitel da ist (Welleneffekt)
  if (animiert === undefined) animiert = !!untertitel;
  if (animiert && untertitel) {
    var spans2 = '';
    var inEm = false; var idxLetter = 0;
    for (var j = 0; j < untertitel.length; j++) {
      if (untertitel.substr(j, 4) === '<em>') { inEm = true; j += 3; continue; }
      if (untertitel.substr(j, 5) === '</em>') { inEm = false; j += 4; continue; }
      var c = untertitel.charAt(j);
      var styleEm = inEm ? 'font-style:italic;font-weight:700;color:var(--hellgruen-s);' : '';
      spans2 += '<span style="animation-delay:' + (idxLetter * 0.04) + 's;' + styleEm + '">'
        + (c === ' ' ? '&nbsp;' : escapeHtml(c)) + '</span>';
      idxLetter++;
    }
    return '<section class="section-intro">'
      + '<h1 class="gruss">' + gruss + '</h1>'
      + '<p class="untertitel"><span class="welle-text">' + spans2 + '</span></p>'
      + '</section>';
  }
  return '<section class="section-intro">'
    + '<h1 class="gruss">' + gruss + '</h1>'
    + (untertitel ? '<p class="untertitel">' + untertitel + '</p>' : '')
    + '</section>';
}

function navBar(zurueckHash, pfadHTML) {
  return '<div class="nav-bar">'
    + '<button class="nav-zurueck" onclick="navigateTo(\'' + zurueckHash + '\')">&larr; Zurück</button>'
    + '<div class="nav-pfad">' + pfadHTML + '</div>'
    + '</div>';
}

// ════════════════════════════════════════════════════════════════
// HAUPTSEITE
// ════════════════════════════════════════════════════════════════
function renderHome(ziel) {
  ziel.innerHTML =
    intro('Hui Wäller? Allemol!', 'Entdecke die <em>Vielfalt</em> des Westerwaldes.', true)
    + window._WASSERZEICHEN
    + '<nav class="kategorien">'
      + kachel('tourismus', 'Tourismus<br>&amp; Freizeit', ICONS.wandern)
      + kachel('regional',  'Regionale<br>Produkte',     ICONS.korb)
      + kachel('kultur',    'Kunst<br>&amp; Kultur',     ICONS.krug)
      + kachel('mobilitaet','Mobilität<br>&amp; Verkehr',ICONS.bus)
    + '</nav>'
    + '<div class="spacer"></div>';
}
function kachel(slug, label, iconSvg) {
  return '<button class="kat" onclick="navigateTo(\'kategorie/' + slug + '\')">'
    + '<div class="kat-label">' + label + '</div>'
    + '<div class="kat-icon">' + iconSvg + '</div>'
    + '</button>';
}

// ════════════════════════════════════════════════════════════════
// KATEGORIEN
// ════════════════════════════════════════════════════════════════
var KATEGORIEN = {
  'tourismus': {
    titel:'Tourismus & Freizeit', untertitel:'Wandern, Radfahren, Ausflugsziele und mehr.',
    subs:[
      {slug:'wandern',         label:'Wandern',         meta:'5 Wanderregionen', icon:ICONS.wandern},
      {slug:'radfahren',       label:'Radfahren',       meta:'5 Routenarten',     icon:ICONS.fahrrad},
      {slug:'ausflugsziele',   label:'Ausflugsziele',   meta:'POIs in der Region',icon:ICONS.markierung},
      {slug:'badeseen',        label:'Badeseen',        meta:'Naturbadestellen',  icon:ICONS.welle},
      {slug:'unterkuenfte',    label:'Unterkünfte',     meta:'Hotels & Pensionen',icon:ICONS.haus},
      {slug:'veranstaltungen', label:'Veranstaltungen', meta:'Alle Termine in der Region', icon:ICONS.kalender}
    ]
  },
  'regional': {
    titel:'Regionale Produkte', untertitel:'Direkt vom Erzeuger – aus dem Westerwald.',
    subs:[
      {slug:'einkaufsfuehrer', label:'Regionaler Einkaufsführer', meta:'Direktvermarkter & Hofläden', icon:ICONS.korb},
      {slug:'westerwald-box',  label:'Westerwald Box',            meta:'Geschenkbox aus der Region',  icon:ICONS.werkbank},
      {slug:'westerwaelder-ernte', label:'Westerwälder Ernte',    meta:'Saisonkalender & Erzeuger',   icon:ICONS.markt},
      {slug:'naturgenuss',     label:'Naturgenuss Partner',       meta:'Erzeuger & Produkte',         icon:ICONS.korb}
    ]
  },
  'kultur': {
    titel:'Kunst & Kultur', untertitel:'Museen, Veranstaltungen und Festivals.',
    subs:[
      {slug:'museen',          label:'Museen',          meta:'14 Sammlungen & Ausstellungen', icon:ICONS.krug}
    ]
  },
  'mobilitaet': {
    titel:'Mobilität & Verkehr', untertitel:'So bist du in der Region unterwegs.',
    subs:[
      {slug:'bahn-bus',     label:'Bahn & Bus',    meta:'ÖPNV-Verbindungen',       icon:ICONS.bus},
      {slug:'mitfahrbank',  label:'Westerwälder Mitfahrerbänke', meta:'Standorte in der Region', icon:ICONS.markierung, externalUrl:'https://mitfahrerbank-ww.de/'},
      {slug:'fahrgemeinschaften', label:'Fahrgemeinschaften', meta:'ADAC Pendlernetz',    icon:ICONS.info}
    ]
  }
};

function renderKategorie(ziel, slug) {
  var kat = KATEGORIEN[slug];
  if (!kat) { renderHome(ziel); return; }
  var subsHTML = kat.subs.map(function(s) {
    // Externer Link → in neuem Tab öffnen (statt interner Navigation)
    if (s.externalUrl) {
      return '<a class="subkat" href="' + s.externalUrl + '" target="_blank" rel="noopener">'
        + '<div class="subkat-icon">' + s.icon + '</div>'
        + '<div class="subkat-text">'
          + '<div class="subkat-label">' + s.label + '</div>'
          + '<div class="subkat-meta">' + s.meta + '</div>'
        + '</div>'
        + '<div class="subkat-pfeil">↗</div>'
      + '</a>';
    }
    return '<button class="subkat" onclick="navigateTo(\'liste/' + slug + '-' + s.slug + '\')">'
      + '<div class="subkat-icon">' + s.icon + '</div>'
      + '<div class="subkat-text">'
        + '<div class="subkat-label">' + s.label + '</div>'
        + '<div class="subkat-meta">' + s.meta + '</div>'
      + '</div>'
      + '<div class="subkat-pfeil">&rsaquo;</div>'
    + '</button>';
  }).join('');
  ziel.innerHTML =
    '<div class="sticky-region">'
    + navBar('home', '<strong>' + kat.titel + '</strong>')
    + intro(kat.titel, kat.untertitel)
    + '</div>'
    + '<nav class="subkategorien">' + subsHTML + '</nav>'
    + '<div class="spacer"></div>';
}

// ════════════════════════════════════════════════════════════════
// LISTEN
// ════════════════════════════════════════════════════════════════
var LISTEN = {
  'tourismus-wandern': {
    titel:'Wandern', breadcrumb:'Tourismus &amp; Freizeit › <strong>Wandern</strong>',
    zurueck:'kategorie/tourismus', untertitel:'Die schönsten Touren des Westerwaldes.',
    typ:'unterkategorie',
    items:[
      {label:'WesterwaldSteig', meta:'16 Etappen, ca. 235 km', sub:'westerwaldsteig', icon:ICONS.wandernSimple},
      {label:'Druidensteig',    meta:'8 Etappen, ca. 84 km',    sub:'druidensteig',    icon:ICONS.wandernSimple},
      {label:'Wiedweg',         meta:'8 Etappen, ca. 117 km',   sub:'wiedweg',         icon:ICONS.wandernSimple},
      {label:'Wäller Touren',   meta:'Tageswanderungen',         sub:'waeller-touren',  icon:ICONS.wandernSimple},
      {label:'Kleine Wäller',   meta:'Kurze Rundtouren',         sub:'kleine-waeller',  icon:ICONS.wandernSimple}
    ]
  },
  'tourismus-radfahren': {
    titel:'Radfahren', breadcrumb:'Tourismus &amp; Freizeit › <strong>Radfahren</strong>',
    zurueck:'kategorie/tourismus', untertitel:'Routen für jeden Anspruch.',
    typ:'unterkategorie',
    items:[
      {label:'Rundradwege',     meta:'Tagestouren',          sub:'rundradwege',     icon:ICONS.rundrad},
      {label:'Streckenradwege', meta:'Mehrtagestouren',       sub:'streckenradwege', icon:ICONS.streckenrad},
      {label:'Gravelbike',      meta:'Schotterstrecken',     sub:'gravelbike',      icon:ICONS.gravelbike},
      {label:'Mountainbike',    meta:'Trails & Singletracks', sub:'mountainbike',   icon:ICONS.mountainbike},
      {label:'Rennrad',         meta:'Asphaltierte Strecken', sub:'rennrad',        icon:ICONS.rennrad},
      {label:'E-Bike Infrastruktur', meta:'Verleih, Werkstätten, Akku-Wechselstationen', sub:'ebike-infrastruktur', icon:ICONS.fahrrad}
    ]
  },
  'tourismus-radfahren-ebike-infrastruktur': {
    datenName:'DATA_EBIKE_INFRASTRUKTUR',
    titel:'E-Bike Infrastruktur',
    breadcrumb:'Radfahren › <strong>E-Bike Infrastruktur</strong>',
    zurueck:'liste/tourismus-radfahren',
    untertitel:'Verleih, Werkstätten, Akku-Wechselstationen und Shops.',
    detailKey:'ebike',
    renderTyp:'gefiltert',
    filterLabel:'Typ',
    filterTypen:[
      {key:'alle',     label:'Alle'},
      {key:'akku',     label:'Akku-Wechselstation'},
      {key:'verleih',  label:'Verleih'},
      {key:'reparatur',label:'Reparatur'},
      {key:'shop',     label:'Shop'},
      {key:'sonstige', label:'Sonstige'}
    ],
    typErkenner: function(item) {
      var t = (item.type || '').toLowerCase();
      if (t.indexOf('akku') >= 0 || t.indexOf('ladestation') >= 0 || t.indexOf('wechselstation') >= 0 || t.indexOf('pedelec-stationen') >= 0) return 'akku';
      if (t.indexOf('verleih') >= 0) return 'verleih';
      if (t.indexOf('reparatur') >= 0 || t.indexOf('werkstatt') >= 0) return 'reparatur';
      if (t.indexOf('shop') >= 0 || t.indexOf('geschäft') >= 0 || t.indexOf('geschaeft') >= 0) return 'shop';
      return 'sonstige';
    }
  },
  'tourismus-ausflugsziele': {
    titel:'Ausflugsziele',
    breadcrumb:'Tourismus &amp; Freizeit › <strong>Ausflugsziele</strong>',
    zurueck:'kategorie/tourismus',
    untertitel:'Sehenswertes in der Region (Live-Daten von westerwald.info).',
    renderTyp:'iframe',
    iframeUrl:'https://www.westerwald.info/tosc5/infrastruktur?limINFOSYSTEMSUBTOPICS=a1716a20-0da0-4cd6-b473-febf29b39eea,f7fe9672-2fdc-4105-bbc7-40bb170afef3#/pois',
    iframeTyp:'webseite'
  },
  'tourismus-badeseen':      {datenName:'DATA_BADESEEN_NEU',  titel:'Badeseen',     breadcrumb:'Tourismus &amp; Freizeit › <strong>Badeseen</strong>',     zurueck:'kategorie/tourismus', untertitel:'Erfrischung und Naturerlebnis.', detailKey:'badesee'},
  'tourismus-unterkuenfte': {
    titel:'Unterkünfte',
    breadcrumb:'Tourismus &amp; Freizeit › <strong>Unterkünfte</strong>',
    zurueck:'kategorie/tourismus',
    untertitel:'Hotels, Pensionen, Ferienwohnungen, Camping (Live-Daten von westerwald.info).',
    renderTyp:'iframe',
    iframeUrl:'https://www.westerwald.info/tosc5/unterkuenfte/#/unterkuenfte',
    iframeTyp:'webseite'
  },
  'tourismus-veranstaltungen': {datenName:'DATA_VERANSTALTUNGEN_ALLE', titel:'Veranstaltungen', breadcrumb:'Tourismus &amp; Freizeit › <strong>Veranstaltungen</strong>', zurueck:'kategorie/tourismus', untertitel:'Alle Termine in der Region.', detailKey:'event', renderTyp:'termine'},

  // KUNST & KULTUR
  'kultur-museen': {datenName:'DATA_KULTUR_MUSEEN', titel:'Museen', breadcrumb:'Kunst &amp; Kultur › <strong>Museen</strong>', zurueck:'kategorie/kultur', untertitel:'Sammlungen und Ausstellungen.', detailKey:'museum', renderTyp:'museenInline'},

  // REGIONALE PRODUKTE
  'regional-einkaufsfuehrer': {titel:'Regionaler Einkaufsführer Westerwald', breadcrumb:'Regionale Produkte › <strong>Einkaufsführer</strong>', zurueck:'kategorie/regional', untertitel:'Direktvermarkter & Hofläden im Westerwald.', renderTyp:'iframe', iframeUrl:'https://cdn.jsdelivr.net/gh/infostele/infostele2@main/einkaufsfuehrer.pdf', coverBild:'https://cdn.jsdelivr.net/gh/infostele/infostele2@main/startbild_einkaufsfuehrer.jpg'},
  'regional-westerwald-box':  {titel:'Westerwald Box',  breadcrumb:'Regionale Produkte › <strong>Westerwald Box</strong>',  zurueck:'kategorie/regional', untertitel:'Der Westerwald als Geschenkbox.', renderTyp:'inhaltSeite', inhaltKey:'westerwaldBox'},
  'regional-westerwaelder-ernte': {titel:'Westerwälder Ernte', breadcrumb:'Regionale Produkte › <strong>Westerwälder Ernte</strong>', zurueck:'kategorie/regional', untertitel:'Saisonkalender und regionale Erzeuger.', renderTyp:'inhaltSeite', inhaltKey:'westerwaelderErnte'},
  'regional-naturgenuss':     {linkData:'naturgenuss',     titel:'Naturgenuss Partner', breadcrumb:'Regionale Produkte › <strong>Naturgenuss</strong>', zurueck:'kategorie/regional', untertitel:'Erzeuger & Produkte aus dem Westerwald.', renderTyp:'naturgenussLinks'},
  'regional-naturgenuss-erzeuger': {titel:'Naturgenuss Partner – Erzeuger & Produkte', breadcrumb:'Regionale Produkte › Naturgenuss › <strong>Erzeuger & Produkte</strong>', zurueck:'liste/regional-naturgenuss', untertitel:'PDF-Übersicht 05/2025.', renderTyp:'iframe', iframeUrl:'https://cdn.jsdelivr.net/gh/infostele/infostele2@main/naturgenusspartner.pdf', coverBild:'https://cdn.jsdelivr.net/gh/infostele/infostele2@main/startbild_naturgenusspartner.jpg'},
  'regional-naturgenuss-broschuere': {titel:'Naturgenuss Broschüre', breadcrumb:'Regionale Produkte › Naturgenuss › <strong>Broschüre</strong>', zurueck:'liste/regional-naturgenuss', untertitel:'Magazin 2022.', renderTyp:'iframe', iframeUrl:'https://cdn.jsdelivr.net/gh/infostele/infostele2@main/naturgenussmagazin.pdf', coverBild:'https://cdn.jsdelivr.net/gh/infostele/infostele2@main/startbild_naturgenussmagazin.jpg'},
  'regional-naturgenuss-saisonprodukte': {titel:'Naturgenuss Saisonprodukte', breadcrumb:'Regionale Produkte › Naturgenuss › <strong>Saisonprodukte</strong>', zurueck:'liste/regional-naturgenuss', untertitel:'Saisonale Produkte und Rezepte.', renderTyp:'iframe', iframeUrl:'https://cdn.jsdelivr.net/gh/infostele/infostele2@main/naturgenussrezepte.pdf', coverBild:'https://cdn.jsdelivr.net/gh/infostele/infostele2@main/startbild_naturgenussrezepte.jpg'},

  // MOBILITÄT & VERKEHR
  'mobilitaet-bahn-bus':      {titel:'Bahn & Bus', breadcrumb:'Mobilität &amp; Verkehr › <strong>Bahn & Bus</strong>', zurueck:'kategorie/mobilitaet', untertitel:'VRM-Fahrplanauskunft für Altenkirchen, Neuwied und Westerwaldkreis.', renderTyp:'iframe', iframeUrl:'https://www.vrminfo.de/fahrplanauskunft/', iframeTyp:'webseite'},
  'mobilitaet-mitfahrbank':   {titel:'Westerwälder Mitfahrerbänke', breadcrumb:'Mobilität &amp; Verkehr › <strong>Westerwälder Mitfahrerbänke</strong>', zurueck:'kategorie/mobilitaet', untertitel:'Standorte in der Region.', renderTyp:'iframe', iframeUrl:'https://mitfahrerbank-ww.de/', iframeTyp:'webseite', iframeProxy:true},
  'mobilitaet-fahrgemeinschaften': {linkData:'fahrgemeinschaften', titel:'Fahrgemeinschaften', breadcrumb:'Mobilität &amp; Verkehr › <strong>Fahrgemeinschaften</strong>', zurueck:'kategorie/mobilitaet', untertitel:'ADAC Pendlernetz – App für Mitfahrgelegenheiten.', renderTyp:'subLinks'},

  // Eingebettete Fahrplan-Anbieter (über iframe statt externer Link)
  'mobilitaet-bahn-bus-westerwaldbus': {
    titel:'Landkreis Altenkirchen',
    breadcrumb:'Mobilität &amp; Verkehr › Bahn & Bus › <strong>Landkreis Altenkirchen</strong>',
    zurueck:'liste/mobilitaet-bahn-bus',
    untertitel:'VRM-Fahrplanauskunft für den Landkreis Altenkirchen.',
    renderTyp:'iframe',
    iframeUrl:'https://www.vrminfo.de/fahrplanauskunft/',
    iframeTyp:'webseite'
  },
  'mobilitaet-bahn-bus-oepnv-ww': {
    titel:'Westerwaldkreis',
    breadcrumb:'Mobilität &amp; Verkehr › Bahn & Bus › <strong>Westerwaldkreis</strong>',
    zurueck:'liste/mobilitaet-bahn-bus',
    untertitel:'Fahrpläne und Verbindungen im Westerwaldkreis.',
    renderTyp:'iframe',
    iframeUrl:'https://www.vrminfo.de/fahrplanauskunft/',
    iframeTyp:'webseite'
  },
  'mobilitaet-bahn-bus-vrm': {
    titel:'Landkreis Neuwied',
    breadcrumb:'Mobilität &amp; Verkehr › Bahn & Bus › <strong>Landkreis Neuwied</strong>',
    zurueck:'liste/mobilitaet-bahn-bus',
    untertitel:'Verkehrsverbund Rhein-Mosel: Fahrpläne und Verbindungen.',
    renderTyp:'iframe',
    iframeUrl:'https://www.vrminfo.de/fahrplanauskunft/',
    iframeTyp:'webseite'
  }
};

// Sammlung der Sub-Link-Datensätze für die Linklisten-Render-Funktion
var SUB_LINKS = {
  // Regionale Produkte (aus DATA_REGIONALE_PRODUKTE.subs)
  'einkaufsfuehrer':       { lookup: 'regional', name: 'Regionaler Einkaufsführer' },
  'westerwald-box':        { lookup: 'regional', name: 'Westerwald Box' },
  'westerwaelder-ernte':   { lookup: 'regional', name: 'Westerwälder Ernte' },
  'naturgenuss':           { lookup: 'regional', name: 'Naturgenuss Partner' },
  // Mobilität & Verkehr (aus DATA_MOBILITAET_VERKEHR.subs)
  'bahn-bus':              { lookup: 'mobilitaet', names: ['Landkreis Altenkirchen', 'Westerwaldkreis', 'Landkreis Neuwied'] },
  'fahrgemeinschaften':    { lookup: 'mobilitaet', name: 'ADAC Pendlernetz App' }
};

// Mapping: Sub-Name → interne App-Route (für iframe-Anzeige statt externen Link)
var SUB_INTERNAL_ROUTES = {
  'Landkreis Altenkirchen':  'liste/mobilitaet-bahn-bus-westerwaldbus',
  'Westerwaldkreis':         'liste/mobilitaet-bahn-bus-oepnv-ww',
  'Landkreis Neuwied':       'liste/mobilitaet-bahn-bus-vrm'
};

var WANDER_DATEN = {
  'westerwaldsteig': {name:'DATA_WANDERN_WESTERWALDSTEIG', titel:'WesterwaldSteig', breadcrumb:'Wandern › <strong>WesterwaldSteig</strong>', untertitel:'235 km in 16 Etappen durch den Westerwald.'},
  'druidensteig':    {name:'DATA_WANDERN_DRUIDENSTEIG',    titel:'Druidensteig',    breadcrumb:'Wandern › <strong>Druidensteig</strong>',    untertitel:'Auf den Spuren der Kelten.'},
  'wiedweg':         {name:'DATA_WANDERN_WIEDWEG',         titel:'Wiedweg',         breadcrumb:'Wandern › <strong>Wiedweg</strong>',         untertitel:'Entlang der Wied.'},
  'waeller-touren':  {name:'DATA_WANDERN_WAELLER_TOUREN',  titel:'Wäller Touren',   breadcrumb:'Wandern › <strong>Wäller Touren</strong>',   untertitel:'Tageswanderungen mit Charme.'},
  'kleine-waeller':  {name:'DATA_WANDERN_KLEINE_WAELLER',  titel:'Kleine Wäller',   breadcrumb:'Wandern › <strong>Kleine Wäller</strong>',   untertitel:'Kurze Rundtouren für zwischendurch.'}
};
var RAD_DATEN = {
  'rundradwege':     {name:'DATA_RADFAHREN_RUNDRADWEGE',     titel:'Rundradwege',     breadcrumb:'Radfahren › <strong>Rundradwege</strong>',     untertitel:'Tagestouren als Rundkurs.'},
  'streckenradwege': {name:'DATA_RADFAHREN_STRECKENRADWEGE', titel:'Streckenradwege', breadcrumb:'Radfahren › <strong>Streckenradwege</strong>', untertitel:'Strecken durch die Region.'},
  'gravelbike':      {name:'DATA_RADFAHREN_GRAVELBIKE',      titel:'Gravelbike',      breadcrumb:'Radfahren › <strong>Gravelbike</strong>',      untertitel:'Routen abseits der Straße.'},
  'mountainbike':    {name:'DATA_RADFAHREN_MOUNTAINBIKE',    titel:'Mountainbike',    breadcrumb:'Radfahren › <strong>Mountainbike</strong>',    untertitel:'Singletrails und Trails.'},
  'rennrad':         {name:'DATA_RADFAHREN_RENNRAD',         titel:'Rennrad',         breadcrumb:'Radfahren › <strong>Rennrad</strong>',         untertitel:'Anspruchsvolle Asphaltrouten.'}
};

// ════════════════════════════════════════════════════════════════
// DATEN-NORMALISIERUNG
// ════════════════════════════════════════════════════════════════
function normalisiere(item) {
  var s = item.stats || {};
  return {
    titel:        item.title || item.t || item.name || 'Tour',
    subtitle:     item.subtitle || '',
    typ:          item.type || '',
    km:           item.km || s.distanz || '',
    schwierigkeit: item.difficulty || item.sw || s.schwierigkeit || '',
    dauer:        s.duration || s.dauer || item.duration || '',
    aufstieg:     s.ascent || s.aufstieg || '',
    abstieg:      s.descent || s.abstieg || '',
    hoechster:    s.highPoint || s.hoechsterPunkt || '',
    tiefster:     s.lowPoint || s.tiefsterPunkt || '',
    tags:         item.tags || item.d || '',
    gpxUrl:       item.gpxUrl || item.gpx || gpxAusTourenplaner(item.tourenplanerUrl || item.tourenplaner),
    tourenplanerUrl: item.tourenplanerUrl || item.tourenplaner || '',
    sourceUrl:    item.sourceUrl || item.url || '',
    description:  item.description,
    routeDescription: item.routeDescription,
    publicTransport: item.publicTransport,
    parking:      item.parking,
    directions:   item.directions,
    start:        item.start,
    destination:  item.destination,
    tips:         item.tips,
    safetyNotes:  item.safetyNotes,
    equipment:    item.equipment,
    sections:     item.sections
  };
}

function gpxAusTourenplaner(url) {
  if (!url) return null;
  var m = url.match(/tour\/(\d+)/);
  if (!m) return null;
  return 'https://www.tourenplaner-rheinland-pfalz.de/de/download.tour.gpx?i=' + m[1] + '&project=oar-rlp';
}

function swKlasse(s) {
  s = (s||'').toLowerCase();
  if (s.indexOf('leicht') >= 0) return 'leicht';
  if (s.indexOf('schwer') >= 0) return 'schwer';
  if (s) return 'mittel';
  return '';
}
function dauerInMinuten(d) {
  if (!d) return null;
  var m = String(d).match(/(\d+(?:[.,]\d+)?)/);
  if (!m) return null;
  return parseFloat(m[1].replace(',','.')) * 60;
}
function kmZuZahl(k) {
  if (!k) return null;
  var m = String(k).match(/(\d+(?:[.,]\d+)?)/);
  return m ? parseFloat(m[1].replace(',','.')) : null;
}

// ════════════════════════════════════════════════════════════════
// FILTER-STATE (pro Listenseite zurückgesetzt)
// ════════════════════════════════════════════════════════════════
var FILTER_STATE = { sw: 'alle', dauer: 'alle', km: 'alle' };

function filterAnwenden(eintraege) {
  return eintraege.filter(function(n) {
    if (FILTER_STATE.sw !== 'alle') {
      if (swKlasse(n.schwierigkeit) !== FILTER_STATE.sw) return false;
    }
    if (FILTER_STATE.dauer !== 'alle') {
      var dm = dauerInMinuten(n.dauer);
      if (dm == null) return false;
      if (FILTER_STATE.dauer === 'kurz'   && dm > 180) return false;
      if (FILTER_STATE.dauer === 'mittel' && (dm <= 180 || dm > 360)) return false;
      if (FILTER_STATE.dauer === 'lang'   && dm <= 360) return false;
    }
    if (FILTER_STATE.km !== 'alle') {
      var kk = kmZuZahl(n.km);
      if (kk == null) return false;
      if (FILTER_STATE.km === 'kurz'   && kk > 10) return false;
      if (FILTER_STATE.km === 'mittel' && (kk <= 10 || kk > 25)) return false;
      if (FILTER_STATE.km === 'lang'   && kk <= 25) return false;
    }
    return true;
  });
}

function pillRow(name, label, optionen) {
  var pills = optionen.map(function(o) {
    var akt = FILTER_STATE[name] === o.val ? ' aktiv' : '';
    return '<button class="filter-pill' + akt + '" onclick="setzeFilter(\'' + name + '\',\'' + o.val + '\')">' + o.label + '</button>';
  }).join('');
  return '<div class="filter-row">'
    + '<span class="filter-label-mini">' + label + '</span>'
    + pills
    + '</div>';
}

function filterUI() {
  var anyAktiv = FILTER_STATE.sw !== 'alle' || FILTER_STATE.dauer !== 'alle' || FILTER_STATE.km !== 'alle';
  return '<div class="filter-leiste">'
    + '<div class="filter-titel">Filter'
      + (anyAktiv ? '<button class="reset-btn" onclick="resetFilter()">↺ Zurücksetzen</button>' : '')
    + '</div>'
    + pillRow('sw', 'Schwierigkeit', [
        {val:'alle',   label:'Alle'},
        {val:'leicht', label:'Leicht'},
        {val:'mittel', label:'Mittel'},
        {val:'schwer', label:'Schwer'}
      ])
    + pillRow('dauer', 'Dauer', [
        {val:'alle',   label:'Alle'},
        {val:'kurz',   label:'< 3 h'},
        {val:'mittel', label:'3 – 6 h'},
        {val:'lang',   label:'> 6 h'}
      ])
    + pillRow('km', 'Länge', [
        {val:'alle',   label:'Alle'},
        {val:'kurz',   label:'< 10 km'},
        {val:'mittel', label:'10 – 25 km'},
        {val:'lang',   label:'> 25 km'}
      ])
    + '</div>';
}

// Globale Helpers, die der HTML aufruft
window._aktuelleListe = null; // {slug, info, detailTyp}

function setzeFilter(name, wert) {
  FILTER_STATE[name] = wert;
  rerenderListe();
}
function resetFilter() {
  FILTER_STATE = { sw: 'alle', dauer: 'alle', km: 'alle' };
  rerenderListe();
}
function rerenderListe() {
  if (!window._aktuelleListe) return;
  var l = window._aktuelleListe;
  // Nur die Filter-Leiste + Liste neu rendern, Sticky-Region behalten
  var fLeiste = document.getElementById('filter-leiste-wrapper');
  var liste   = document.getElementById('etappen-liste');
  if (fLeiste) fLeiste.innerHTML = filterUI();
  if (liste)   liste.innerHTML = baueListenInhalt(l.slug, l.info, l.detailTyp);
  aktualisiereTreffer(l);
}

function aktualisiereTreffer(l) {
  var rohdaten = window[l.info.name] || [];
  var n = rohdaten.map(normalisiere);
  // Nur Touren mit Filterdaten in den Zähler – sonst stimmt 16 ≠ 17
  var voll = n.filter(istVollstaendig);
  var g = filterAnwenden(voll);
  var unvoll = n.length - voll.length;
  var el = document.getElementById('filter-treffer');
  if (el) {
    var txt = '<strong>' + g.length + '</strong> von <strong>' + voll.length + '</strong> Touren angezeigt';
    if (unvoll > 0) {
      txt += ' · <span class="treffer-extra">+' + unvoll + ' in Vorbereitung</span>';
    }
    el.innerHTML = txt;
  }
}

// ════════════════════════════════════════════════════════════════
// LISTEN-AUSWAHL
// ════════════════════════════════════════════════════════════════
function renderListe(ziel, slug) {
  if (LISTEN[slug] && LISTEN[slug].typ === 'unterkategorie') {
    var l = LISTEN[slug];
    var items = l.items.map(function(it) {
      return '<button class="subkat" onclick="navigateTo(\'liste/' + slug.split('-')[0] + '-' + slug.split('-')[1] + '-' + it.sub + '\')">'
        + '<div class="subkat-icon">' + (it.icon || ICONS.berge) + '</div>'
        + '<div class="subkat-text">'
          + '<div class="subkat-label">' + it.label + '</div>'
          + '<div class="subkat-meta">' + it.meta + '</div>'
        + '</div>'
        + '<div class="subkat-pfeil">&rsaquo;</div>'
      + '</button>';
    }).join('');
    ziel.innerHTML =
      '<div class="sticky-region">'
      + navBar(l.zurueck, l.breadcrumb)
      + intro(l.titel, l.untertitel)
      + '</div>'
      + '<nav class="subkategorien">' + items + '</nav>'
      + '<div class="spacer"></div>';
    return;
  }

  var teile = slug.split('-');
  if (teile[0] === 'tourismus' && teile[1] === 'wandern' && teile[2]) {
    var sub = teile.slice(2).join('-');
    if (WANDER_DATEN[sub]) { renderEtappenListe(ziel, slug, WANDER_DATEN[sub], 'tourismus-wandern', 'wandern'); return; }
  }
  if (teile[0] === 'tourismus' && teile[1] === 'radfahren' && teile[2]) {
    var sub = teile.slice(2).join('-');
    if (RAD_DATEN[sub]) { renderEtappenListe(ziel, slug, RAD_DATEN[sub], 'tourismus-radfahren', 'rad'); return; }
  }
  if (LISTEN[slug]) { renderDatenListe(ziel, slug, LISTEN[slug]); return; }

  ziel.innerHTML =
    navBar('home', '<strong>' + slug + '</strong>')
    + intro('In Vorbereitung', 'Diese Inhalte werden gerade aufbereitet.')
    + '<div class="hinweis">Diese Seite ist noch in Arbeit.</div>'
    + '<div class="spacer"></div>';
}

// ════════════════════════════════════════════════════════════════
// ETAPPEN-LISTE (mit Sticky-Region + Filter)
// ════════════════════════════════════════════════════════════════
// Prüft, ob eine Tour genug Daten hat, um in Filtern aufzutauchen.
// Ohne Schwierigkeit oder Distanz fällt sie sonst in jedem Filter raus
// und der Gesamtcount stimmt nicht mit der Summe der Pillen-Buckets überein.
function istVollstaendig(n) {
  return !!(n.schwierigkeit && n.km);
}

function baueListenInhalt(slug, info, detailTyp) {
  var rohdaten = window[info.name] || [];
  var normiert = rohdaten.map(normalisiere);

  // Trennen in „filterbare" und „in Vorbereitung"
  var voll   = [];
  var unvoll = [];
  normiert.forEach(function(n, i) {
    n.__idx = i; // ursprünglichen Listenindex merken (für Detail-Routing)
    if (istVollstaendig(n)) voll.push(n);
    else unvoll.push(n);
  });

  var gefiltert = filterAnwenden(voll);

  if (!gefiltert.length && !unvoll.length) {
    return '<div class="hinweis">Keine Touren passen zu deiner Auswahl. Bitte Filter anpassen oder zurücksetzen.</div>';
  }

  var html = '';
  if (gefiltert.length) {
    html += gefiltert.map(function(n) {
      return baueListenEintrag(n, slug, detailTyp, false);
    }).join('');
  } else {
    html += '<div class="hinweis">Keine Touren passen zu deiner Auswahl. Bitte Filter anpassen oder zurücksetzen.</div>';
  }

  // Touren in Vorbereitung am Ende, immer sichtbar (nicht von Filtern abhängig)
  if (unvoll.length) {
    html += '<div class="tour-vorbereitung">'
         +  unvoll.length + ' weitere Tour' + (unvoll.length === 1 ? '' : 'en') + ' in Vorbereitung'
         +  '</div>';
    html += unvoll.map(function(n) {
      return baueListenEintrag(n, slug, detailTyp, true);
    }).join('');
  }
  return html;
}

function baueListenEintrag(n, slug, detailTyp, inVorbereitung) {
  var sw = swKlasse(n.schwierigkeit);
  var meta = '';
  if (n.km)      meta += '<span><strong>' + escapeHtml(n.km) + (String(n.km).indexOf('km')<0 ? ' km' : '') + '</strong></span>';
  if (n.dauer)   meta += '<span>⏱ ' + escapeHtml(n.dauer) + '</span>';
  if (n.aufstieg) meta += '<span>↑ ' + escapeHtml(n.aufstieg) + '</span>';
  if (n.schwierigkeit) meta += '<span class="diff-' + sw + '">● ' + escapeHtml(n.schwierigkeit) + '</span>';
  var cls = 'eintrag' + (inVorbereitung ? ' in-vorbereitung' : '');
  return '<button class="' + cls + '" onclick="navigateTo(\'detail/' + detailTyp + '/' + slug + '_' + n.__idx + '\')">'
    + '<div class="eintrag-text">'
      + '<div class="eintrag-titel">' + escapeHtml(n.titel) + '</div>'
      + (n.subtitle ? '<div class="eintrag-sub">' + escapeHtml(n.subtitle) + '</div>' : '')
      + (meta ? '<div class="eintrag-meta">' + meta + '</div>' : '')
    + '</div>'
    + '<div class="eintrag-pfeil">&rsaquo;</div>'
  + '</button>';
}

function renderEtappenListe(ziel, slug, info, zurueckSlug, detailTyp) {
  // Filter-State zurücksetzen bei jedem Aufruf
  FILTER_STATE = { sw: 'alle', dauer: 'alle', km: 'alle' };
  window._aktuelleListe = { slug: slug, info: info, detailTyp: detailTyp };

  var daten = window[info.name];
  if (!daten || !daten.length) {
    ziel.innerHTML =
      navBar('liste/' + zurueckSlug, info.breadcrumb)
      + intro(info.titel, info.untertitel)
      + '<div class="hinweis">Daten noch nicht verfügbar.</div>'
      + '<div class="spacer"></div>';
    return;
  }

  // Anfangs-Treffer-Display: nur vollständige Touren zählen
  var initialNorm = daten.map(normalisiere);
  var initialVoll = initialNorm.filter(istVollstaendig);
  var initialUnvoll = initialNorm.length - initialVoll.length;
  var trefferTxt = '<strong>' + initialVoll.length + '</strong> Touren angezeigt';
  if (initialUnvoll > 0) {
    trefferTxt += ' · <span class="treffer-extra">+' + initialUnvoll + ' in Vorbereitung</span>';
  }

  // Sticky-Region: navBar + intro + filter-leiste
  // Beim Scrollen bleibt diese gesamte Box oben kleben
  ziel.innerHTML =
    '<div class="sticky-region">'
      + navBar('liste/' + zurueckSlug, info.breadcrumb)
      + intro(info.titel, info.untertitel)
      + '<div id="filter-leiste-wrapper">' + filterUI() + '</div>'
    + '</div>'
    + '<div id="filter-treffer" class="filter-treffer">' + trefferTxt + '</div>'
    + '<div class="liste" id="etappen-liste">' + baueListenInhalt(slug, info, detailTyp) + '</div>'
    + '<div class="spacer"></div>';
}

// ════════════════════════════════════════════════════════════════
// SUB-LINKS RENDERER (Regionale Produkte, Mobilität & Verkehr)
// Zeigt die Links aus DATA_REGIONALE_PRODUKTE / DATA_MOBILITAET_VERKEHR
// ════════════════════════════════════════════════════════════════
function renderSubLinks(ziel, slug, l) {
  var sl = SUB_LINKS[l.linkData];
  var quelle = (sl && sl.lookup === 'regional') ? window.DATA_REGIONALE_PRODUKTE
              : (sl && sl.lookup === 'mobilitaet') ? window.DATA_MOBILITAET_VERKEHR
              : null;

  var html = '<div class="sticky-region">'
    + navBar(l.zurueck, l.breadcrumb)
    + intro(l.titel, l.untertitel)
    + '</div>';

  if (!quelle || !quelle.subs || !quelle.subs.length) {
    html += '<div class="hinweis">Daten noch nicht verfügbar.</div><div class="spacer"></div>';
    ziel.innerHTML = html;
    return;
  }

  // Passende Subs aus dem DATA-Block heraussuchen (entweder einer mit name oder mehrere mit names)
  var passend = [];
  if (sl.names && sl.names.length) {
    quelle.subs.forEach(function(s) {
      if (sl.names.indexOf(s.name) >= 0) passend.push(s);
    });
  } else if (sl.name) {
    quelle.subs.forEach(function(s) {
      if (s.name === sl.name) passend.push(s);
    });
  }

  if (!passend.length) {
    html += '<div class="hinweis">Inhalte werden noch ergänzt.</div><div class="spacer"></div>';
    ziel.innerHTML = html;
    return;
  }

  html += '<div class="liste linklist">';
  passend.forEach(function(sub) {
    var internalRoute = SUB_INTERNAL_ROUTES[sub.name];
    if (sub.url && internalRoute) {
      // Sub hat eine interne iframe-Route → als Button (nicht externer Link)
      html += '<button class="eintrag" onclick="navigateTo(\'' + internalRoute + '\')">'
        + '<div class="eintrag-text">'
        + '<div class="eintrag-titel">' + escapeHtml(sub.name) + '</div>'
        + '<div class="eintrag-meta">' + escapeHtml(sub.url.replace(/^https?:\/\//,'').replace(/\/$/,'')) + '</div>'
        + '</div>'
        + '<div class="eintrag-pfeil">&rsaquo;</div>'
        + '</button>';
    } else if (sub.url) {
      // Einfacher Direktlink (extern)
      html += '<a class="eintrag" href="' + sub.url + '" target="_blank" rel="noopener">'
        + '<div class="eintrag-text">'
        + '<div class="eintrag-titel">' + escapeHtml(sub.name) + '</div>'
        + '<div class="eintrag-meta">' + escapeHtml(sub.url.replace(/^https?:\/\//,'').replace(/\/$/,'')) + '</div>'
        + '</div>'
        + '<div class="eintrag-pfeil">↗</div>'
        + '</a>';
    } else if (sub.links && sub.links.length) {
      // Sub-Liste mit Unter-Links → als Card mit eingebetteten Links
      html += '<div class="link-card">';
      if (passend.length > 1) {
        html += '<div class="link-card-titel">' + escapeHtml(sub.name) + '</div>';
      }
      sub.links.forEach(function(lnk) {
        html += '<a class="link-eintrag" href="' + lnk.u + '" target="_blank" rel="noopener">'
          + '<span class="link-eintrag-titel">' + escapeHtml(lnk.n) + '</span>'
          + '<span class="link-eintrag-pfeil">↗</span>'
          + '</a>';
      });
      html += '</div>';
    }
  });
  html += '</div><div class="spacer"></div>';
  ziel.innerHTML = html;
}

// ════════════════════════════════════════════════════════════════
// EXTERNAL-LINKS RENDERER (Museen, Kunst & Kultur Übersicht)
// Jeder Eintrag hat name + url, öffnet direkt in neuem Tab
// ════════════════════════════════════════════════════════════════
function renderExternalLinks(ziel, slug, l) {
  var daten = window[l.datenName] || [];
  var html = '<div class="sticky-region">'
    + navBar(l.zurueck, l.breadcrumb)
    + intro(l.titel, l.untertitel)
    + '</div>';
  if (!daten.length) {
    html += '<div class="hinweis">Daten noch nicht verfügbar.</div><div class="spacer"></div>';
    ziel.innerHTML = html;
    return;
  }
  html += '<div class="liste linklist">';
  daten.forEach(function(item) {
    var url = item.url || '';
    if (!url) return;
    html += '<a class="eintrag" href="' + url + '" target="_blank" rel="noopener">'
      + '<div class="eintrag-text">'
      + '<div class="eintrag-titel">' + escapeHtml(item.name) + '</div>'
      + '<div class="eintrag-meta">' + escapeHtml(url.replace(/^https?:\/\//,'').replace(/\/$/,'')) + '</div>'
      + '</div>'
      + '<div class="eintrag-pfeil">↗</div>'
      + '</a>';
  });
  html += '</div><div class="spacer"></div>';
  ziel.innerHTML = html;
}

// ════════════════════════════════════════════════════════════════
// WW-LIT RENDERER (Westerwälder Literaturtage 2026)
// 28 Veranstaltungen mit Datum/Zeit/Autor/Ort/Beschreibung
// ════════════════════════════════════════════════════════════════
function renderWwLit(ziel, slug, l) {
  var daten = window[l.datenName] || [];
  var html = '<div class="sticky-region">'
    + navBar(l.zurueck, l.breadcrumb)
    + intro(l.titel, l.untertitel)
    + '</div>';
  if (!daten.length) {
    html += '<div class="hinweis">Programm wird noch eingelesen.</div><div class="spacer"></div>';
    ziel.innerHTML = html;
    return;
  }
  // Liste der Veranstaltungen
  html += '<div class="liste">';
  daten.forEach(function(v, idx) {
    var datum = v.datum || '';
    var zeit = v.zeit || '';
    html += '<button class="eintrag wwlit-eintrag" onclick="navigateTo(\'detail/wwlit/' + slug + '_' + idx + '\')">'
      + '<div class="wwlit-datum">'
        + '<div class="wwlit-tag">' + escapeHtml(datum) + '</div>'
        + (zeit ? '<div class="wwlit-zeit">' + escapeHtml(zeit) + '</div>' : '')
      + '</div>'
      + '<div class="eintrag-text">'
        + '<div class="eintrag-titel">' + escapeHtml(v.autor || '—') + '</div>'
        + (v.werk ? '<div class="wwlit-werk"><em>' + escapeHtml(v.werk) + '</em></div>' : '')
        + (v.ort ? '<div class="eintrag-meta">📍 ' + escapeHtml(v.ort) + '</div>' : '')
      + '</div>'
      + '<div class="eintrag-pfeil">&rsaquo;</div>'
    + '</button>';
  });
  html += '</div><div class="spacer"></div>';
  ziel.innerHTML = html;
}


// ════════════════════════════════════════════════════════════════
// TERMINE RENDERER (konsolidierte Veranstaltungen)
// Quelle: DATA_VERANSTALTUNGEN_ALLE
// Enthält Naturerlebnisse, Veranstaltungen (westerwald.info) und
// Westerwälder Literaturtage in einheitlichem Schema.
// Filter: Datum, Bezirk, Preis, Familienfreundlich
// ════════════════════════════════════════════════════════════════

// Termin-Filter-State (eigener State)
var TERMIN_FILTER = { datum: 'alle', bezirk: 'alle', kids: 'alle' };
window._aktuelleTermine = null;

function termineFilterUI() {
  function pill(group, val, label) {
    var aktiv = TERMIN_FILTER[group] === val;
    return '<button class="filter-pill' + (aktiv ? ' aktiv' : '') + '" '
      + 'onclick="setzeTerminFilter(\'' + group + '\',\'' + val + '\')">' + label + '</button>';
  }
  var html = '<div class="filter-leiste termine-filter">';
  html += '<div class="filter-gruppe"><span class="filter-label">📅 Datum:</span>'
    + pill('datum','alle','Alle')
    + pill('datum','heute','Heute')
    + pill('datum','woche','Diese Woche')
    + pill('datum','monat','Dieser Monat')
    + pill('datum','jahr','Aktuelles Jahr')
    + '</div>';
  // Region: in einer Zeile, kompakte Labels
  html += '<div class="filter-gruppe filter-bezirk"><span class="filter-label">📍 Region:</span>'
    + pill('bezirk','alle','Alle')
    + pill('bezirk','AK','Altenkirchen')
    + pill('bezirk','NR','Neuwied')
    + pill('bezirk','WW','Westerwald')
    + pill('bezirk','Hessen','Hessen')
    + '</div>';
  html += '<div class="filter-gruppe"><span class="filter-label">👶 Kinder:</span>'
    + pill('kids','alle','Alle')
    + pill('kids','ja','Familienfreundlich')
    + '</div>';
  html += '</div>';
  return html;
}

function setzeTerminFilter(group, val) {
  TERMIN_FILTER[group] = val;
  var l = window._aktuelleTermine;
  if (!l) return;
  var wrap = document.getElementById('filter-leiste-wrapper');
  if (wrap) wrap.innerHTML = termineFilterUI();
  var liste = document.getElementById('termine-liste');
  if (liste) liste.innerHTML = baueTermineListe(l.slug, l.info);
  aktualisiereTermineTreffer(l);
}

function termineFilterAnwenden(items) {
  var heute = new Date();
  heute.setHours(0,0,0,0);
  var pad = function(n) { return String(n).padStart(2,'0'); };
  var heuteStr = heute.getFullYear() + '-' + pad(heute.getMonth()+1) + '-' + pad(heute.getDate());

  var sonntag = new Date(heute);
  // 0 = So, 1 = Mo, …, 6 = Sa → Tage bis Sonntag
  var bisSonntag = (7 - heute.getDay()) % 7;
  if (bisSonntag === 0 && heute.getDay() === 0) bisSonntag = 0;
  sonntag.setDate(heute.getDate() + (heute.getDay() === 0 ? 0 : (7 - heute.getDay())));
  var sonntagStr = sonntag.getFullYear() + '-' + pad(sonntag.getMonth()+1) + '-' + pad(sonntag.getDate());
  var monatsende = new Date(heute.getFullYear(), heute.getMonth()+1, 0);
  var monatsendeStr = monatsende.getFullYear() + '-' + pad(monatsende.getMonth()+1) + '-' + pad(monatsende.getDate());
  var jahresende = heute.getFullYear() + '-12-31';

  return items.filter(function(item) {
    var d = item.datumIso || '';
    if (!d) return false;
    // Event muss noch laufen oder in der Zukunft sein (Enddatum berücksichtigen)
    var dEnde = item.datumBisIso || d;
    if (dEnde < heuteStr) return false;

    // Period-Filter: ÜBERLAPPUNG zwischen Event-Zeitraum und Period-Zeitraum prüfen.
    // So erscheinen sowohl Einzeltermine als auch durchgehende Veranstaltungen
    // (Ausstellungen, mehrtägige Märkte) in jedem Period-Filter, in dem sie aktiv sind.
    // Wiederkehrende Termine (z. B. wöchentliche Kräuterführung) sind in der
    // Datenquelle bereits als jeweils einzelner Eintrag pro Datum erfasst und
    // erscheinen daher automatisch korrekt: 1x pro Woche, 4x pro Monat usw.
    if (TERMIN_FILTER.datum !== 'alle') {
      var periodEnde;
      if (TERMIN_FILTER.datum === 'heute')      periodEnde = heuteStr;
      else if (TERMIN_FILTER.datum === 'woche') periodEnde = sonntagStr;
      else if (TERMIN_FILTER.datum === 'monat') periodEnde = monatsendeStr;
      else if (TERMIN_FILTER.datum === 'jahr')  periodEnde = jahresende;
      // Überlappung: Event-Start <= Period-Ende UND Event-Ende >= heuteStr
      // (letzteres oben bereits geprüft)
      if (d > periodEnde) return false;
    }

    if (TERMIN_FILTER.bezirk !== 'alle' && item.bezirk !== TERMIN_FILTER.bezirk) return false;
    if (TERMIN_FILTER.kids === 'ja' && !item.fuerKids) return false;
    return true;
  });
}

// Smart-Datumsanzeige für Listen: bei laufenden Mehrtages-Events das Enddatum
// statt des (vergangenen) Startdatums zeigen, damit der User sieht, wie lange
// die Veranstaltung noch läuft. Für Einzeltermine oder zukünftige Events bleibt
// das normale Startdatum.
function formatTerminDatumSmart(item) {
  var dStart = item.datumIso || '';
  var dEnde = item.datumBisIso || dStart;
  if (!dStart) return '';
  var heute = new Date();
  heute.setHours(0,0,0,0);
  var pad = function(n) { return String(n).padStart(2,'0'); };
  var heuteStr = heute.getFullYear() + '-' + pad(heute.getMonth()+1) + '-' + pad(heute.getDate());
  // Mehrtägig & bereits laufend → "bis [Enddatum]"
  if (dStart < heuteStr && dEnde > dStart && dEnde >= heuteStr) {
    return 'bis ' + formatTerminDatum(dEnde);
  }
  // Mehrtägig & zukünftig → "[Start] – [Ende]"
  if (dEnde > dStart) {
    return formatTerminDatum(dStart) + ' – ' + formatTerminDatum(dEnde);
  }
  // Einzeltermin
  return formatTerminDatum(dStart);
}

function formatTerminDatum(d) {
  if (!d) return '';
  var teile = d.split('-');
  if (teile.length !== 3) return d;
  var datum = new Date(parseInt(teile[0],10), parseInt(teile[1],10)-1, parseInt(teile[2],10));
  var tage = ['So','Mo','Di','Mi','Do','Fr','Sa'];
  return tage[datum.getDay()] + ' ' + teile[2] + '.' + teile[1] + '.';
}

function baueTermineListe(slug, l) {
  var rohdaten = window[l.datenName] || [];
  var gefiltert = termineFilterAnwenden(rohdaten);
  gefiltert.sort(function(a,b) {
    if (a.datumIso < b.datumIso) return -1;
    if (a.datumIso > b.datumIso) return 1;
    return (a.zeit||'').localeCompare(b.zeit||'');
  });

  if (!gefiltert.length) {
    return '<div class="hinweis">Keine Termine passen zu deiner Auswahl. Bitte Filter anpassen oder zurücksetzen.</div>';
  }

  return gefiltert.map(function(item) {
    var idx = rohdaten.indexOf(item);
    var meta = [];
    if (item.zeit) meta.push('🕐 ' + escapeHtml(item.zeit));
    if (item.ort) meta.push('📍 ' + escapeHtml(item.ort));
    if (item.kostenfrei) meta.push('<span class="termin-frei">kostenfrei</span>');
    if (item.fuerKids) meta.push('<span class="termin-kids">👶 Familie</span>');
    var quelleBadge = '';
    if (item.quelle === 'lit')   quelleBadge = '<span class="termin-quelle quelle-lit">📚 ww-Lit</span>';
    else if (item.quelle === 'natur') quelleBadge = '<span class="termin-quelle quelle-natur">🌿 Natur</span>';
    if (quelleBadge) meta.unshift(quelleBadge);

    return '<button class="eintrag termin-eintrag" onclick="navigateTo(\'detail/' + l.detailKey + '/' + slug + '_' + idx + '\')">'
      + '<div class="termin-datum-badge">'
        + '<div class="termin-datum-text">' + escapeHtml(formatTerminDatumSmart(item)) + '</div>'
        + (item.bezirk ? '<div class="termin-bezirk">' + escapeHtml(item.bezirk) + '</div>' : '')
      + '</div>'
      + '<div class="eintrag-text">'
        + '<div class="eintrag-titel">' + escapeHtml(item.titel) + '</div>'
        + (meta.length ? '<div class="eintrag-meta">' + meta.join(' · ') + '</div>' : '')
      + '</div>'
      + '<div class="eintrag-pfeil">&rsaquo;</div>'
    + '</button>';
  }).join('');
}

function aktualisiereTermineTreffer(l) {
  var rohdaten = window[l.info.datenName] || [];
  var heute = new Date(); heute.setHours(0,0,0,0);
  var pad = function(n) { return String(n).padStart(2,'0'); };
  var heuteStr = heute.getFullYear() + '-' + pad(heute.getMonth()+1) + '-' + pad(heute.getDate());
  var zukunft = rohdaten.filter(function(i) { var bis = i.datumBisIso || i.datumIso || ''; return bis >= heuteStr; });
  var g = termineFilterAnwenden(rohdaten);
  var el = document.getElementById('filter-treffer');
  if (el) el.innerHTML = '<strong>' + g.length + '</strong> von <strong>' + zukunft.length + '</strong> kommenden Terminen';
}

function renderTermine(ziel, slug, l) {
  TERMIN_FILTER = { datum: 'alle', bezirk: 'alle', kids: 'alle' };
  window._aktuelleTermine = { slug: slug, info: l };

  // Einmaliges Deduplizieren bei erstem Aufruf — schützt vor Mehrfach-Laden
  // einzelner Datendateien oder doppelt eingetragenen Events in der Quelle.
  // Schlüssel: sourceUrl (falls vorhanden), sonst titel|datumIso|zeit.
  if (window[l.datenName] && !window['__dedup_' + l.datenName]) {
    var roh = window[l.datenName];
    var seen = {};
    var dedup = [];
    var doppelt = 0;
    for (var di = 0; di < roh.length; di++) {
      var ev = roh[di];
      var key;
      if (ev.sourceUrl) {
        key = 'u:' + String(ev.sourceUrl).trim().toLowerCase();
      } else {
        key = 't:' + (ev.titel||'').trim().toLowerCase() + '|' + (ev.datumIso||'') + '|' + (ev.zeit||'');
      }
      if (seen[key]) { doppelt++; continue; }
      seen[key] = true;
      dedup.push(ev);
    }
    if (doppelt > 0) {
      console.log('[Veranstaltungen Dedup] ' + doppelt + ' Duplikate aus ' + l.datenName + ' entfernt (von ' + roh.length + ' → ' + dedup.length + ').');
      window[l.datenName] = dedup;
    }
    window['__dedup_' + l.datenName] = true;
  }

  var rohdaten = window[l.datenName] || [];

  if (!rohdaten.length) {
    ziel.innerHTML =
      '<div class="sticky-region">'
      + navBar(l.zurueck, l.breadcrumb)
      + intro(l.titel, l.untertitel)
      + '</div>'
      + '<div class="hinweis">Daten noch nicht verfügbar.</div>'
      + '<div class="spacer"></div>';
    return;
  }

  var heute = new Date(); heute.setHours(0,0,0,0);
  var pad = function(n) { return String(n).padStart(2,'0'); };
  var heuteStr = heute.getFullYear() + '-' + pad(heute.getMonth()+1) + '-' + pad(heute.getDate());
  var zukunft = rohdaten.filter(function(i) { var bis = i.datumBisIso || i.datumIso || ''; return bis >= heuteStr; });

  ziel.innerHTML =
    '<div class="sticky-region">'
      + navBar(l.zurueck, l.breadcrumb)
      + intro(l.titel, l.untertitel)
      + '<div id="filter-leiste-wrapper">' + termineFilterUI() + '</div>'
    + '</div>'
    + '<div id="filter-treffer" class="filter-treffer"><strong>' + zukunft.length + '</strong> kommende Termine</div>'
    + '<div class="liste" id="termine-liste">' + baueTermineListe(slug, l) + '</div>'
    + '<div class="spacer"></div>';
}



function renderDatenListe(ziel, slug, l) {
  // NEUE Render-Typen
  if (l.renderTyp === 'subLinks')      { renderSubLinks(ziel, slug, l); return; }
  if (l.renderTyp === 'externalLinks') { renderExternalLinks(ziel, slug, l); return; }
  if (l.renderTyp === 'wwLit')         { renderWwLit(ziel, slug, l); return; }
  if (l.renderTyp === 'termine')       { renderTermine(ziel, slug, l); return; }
  if (l.renderTyp === 'gefiltert')     { renderGefiltertListe(ziel, slug, l); return; }
  if (l.renderTyp === 'inhaltSeite')   { renderInhaltSeite(ziel, slug, l); return; }
  if (l.renderTyp === 'iframe')        { renderIframeSeite(ziel, slug, l); return; }
  if (l.renderTyp === 'museenInline')  { renderMuseenInline(ziel, slug, l); return; }
  if (l.renderTyp === 'naturgenussLinks') { renderNaturgenussLinks(ziel, slug, l); return; }
  if (l.renderTyp === 'bahnBusLinks')     { renderBahnBusLinks(ziel, slug, l); return; }
  if (l.renderTyp === 'mitfahrbankKarte') { renderMitfahrbankKarte(ziel, slug, l); return; }

  // STANDARD: Ausflugsziele, Badeseen, Unterkünfte etc.
  var daten = window[l.datenName] || [];
  if (l.max) daten = daten.slice(0, l.max);
  if (!daten.length) {
    ziel.innerHTML =
      '<div class="sticky-region">'
      + navBar(l.zurueck, l.breadcrumb)
      + intro(l.titel, l.untertitel)
      + '</div>'
      + '<div class="hinweis">Daten noch nicht verfügbar.</div>'
      + '<div class="spacer"></div>';
    return;
  }
  var items = daten.map(function(item, idx) {
    var titel = item.name || item.title || 'Eintrag';
    var ort = item.town || item.ort || (item.contact && item.contact.town) || '';
    var thema = item.topic || item.mainTopic || (item.categories && item.categories[0]) || '';
    var meta = [ort, thema].filter(Boolean).join(' · ');
    return '<button class="eintrag" onclick="navigateTo(\'detail/' + l.detailKey + '/' + slug + '_' + idx + '\')">'
      + '<div class="eintrag-text">'
        + '<div class="eintrag-titel">' + escapeHtml(titel) + '</div>'
        + (meta ? '<div class="eintrag-meta">' + escapeHtml(meta) + '</div>' : '')
      + '</div>'
      + '<div class="eintrag-pfeil">&rsaquo;</div>'
    + '</button>';
  }).join('');
  ziel.innerHTML =
    '<div class="sticky-region">'
    + navBar(l.zurueck, l.breadcrumb)
    + intro(l.titel, l.untertitel)
    + '</div>'
    + (l.max && window[l.datenName] && window[l.datenName].length > l.max ?
       '<div class="hinweis">Es werden ' + l.max + ' von ' + window[l.datenName].length + ' Einträgen angezeigt.</div>' : '')
    + '<div class="liste">' + items + '</div>'
    + '<div class="spacer"></div>';
}

// ════════════════════════════════════════════════════════════════
// DETAIL-SEITE
// ════════════════════════════════════════════════════════════════
function renderDetail(ziel, typ, schluessel) {
  // Spezialfall Westerwald-Box-Betriebe: schluessel ist nur die Zahl
  if (typ === 'wwbox') {
    var bIdx = parseInt(schluessel, 10);
    var bData = window.DATA_WESTERWALDBOX_BETRIEBE || [];
    if (!bData[bIdx]) {
      ziel.innerHTML = navBar('home','') + intro('Nicht gefunden','') + '<div class="hinweis">Betrieb nicht verfügbar.</div>';
      return;
    }
    renderBetriebDetail(ziel, bData[bIdx], bIdx);
    return;
  }

  var teile = schluessel.split('_');
  var listeSlug = teile.slice(0, -1).join('_');
  var idx = parseInt(teile[teile.length - 1], 10);
  var info = null, daten = null, zurueck = 'home';

  if (typ === 'wandern') {
    var sub = listeSlug.split('-').slice(2).join('-');
    info = WANDER_DATEN[sub]; daten = info && window[info.name];
    zurueck = 'liste/' + listeSlug;
  } else if (typ === 'rad') {
    var sub = listeSlug.split('-').slice(2).join('-');
    info = RAD_DATEN[sub]; daten = info && window[info.name];
    zurueck = 'liste/' + listeSlug;
  } else {
    var ll = LISTEN[listeSlug];
    if (ll) {
      info = {breadcrumb: ll.breadcrumb, titel: ll.titel};
      daten = window[ll.datenName]; zurueck = 'liste/' + listeSlug;
    }
  }
  if (!daten || !daten[idx]) {
    ziel.innerHTML = navBar('home','') + intro('Nicht gefunden','') + '<div class="hinweis">Eintrag nicht verfügbar.</div>';
    return;
  }
  var item = daten[idx];
  // Karte-URL für Detail-Renderer bereitstellen (wird nur genutzt, wenn Item
  // tatsächlich Koordinaten/GPX hat - die Render-Funktion prüft das selbst).
  info.karteUrl = '#karte/' + typ + '/' + schluessel;

  if (typ === 'wandern' || typ === 'rad')      renderRouteDetail(ziel, item, info, zurueck);
  else if (typ === 'ausfl')                    renderAusflDetail(ziel, item, info, zurueck);
  else if (typ === 'badesee')                  renderBadeseeDetail(ziel, item, info, zurueck);
  else if (typ === 'unterkunft')               renderUnterkunftDetail(ziel, item, info, zurueck);
  else if (typ === 'museum')                   renderMuseumDetail(ziel, item, info, zurueck);
  else if (typ === 'literatur')                renderAusflDetail(ziel, item, info, zurueck);
  else if (typ === 'event')                    renderTerminDetail(ziel, item, info, zurueck);
  else if (typ === 'natur' || typ === 'wwlit') renderTerminDetail(ziel, item, info, zurueck);
  else if (typ === 'ebike')                    renderEbikeDetail(ziel, item, info, zurueck);
  else ziel.innerHTML = navBar('home','') + intro('Detail','') + '<pre>' + JSON.stringify(item, null, 2) + '</pre>';
}


// ════════════════════════════════════════════════════════════════
// TERMIN-DETAIL (konsolidiert: Naturerlebnis, Veranstaltung, Lit)
// ════════════════════════════════════════════════════════════════
function renderTerminDetail(ziel, item, info, zurueck) {
  var pills = '<div class="diff-gpx-row">';
  if (item.datumIso) {
    pills += '<span class="diff-pill diff-mittel-bg">' + escapeHtml(formatTerminDatum(item.datumIso));
    if (item.datumBisIso && item.datumBisIso !== item.datumIso) {
      pills += ' – ' + escapeHtml(formatTerminDatum(item.datumBisIso));
    }
    if (item.zeit) pills += ' · ' + escapeHtml(item.zeit);
    pills += '</span>';
  }
  if (item.bezirk) {
    var bezirkLabel = item.bezirk === 'AK' ? 'Altenkirchen' : item.bezirk === 'WW' ? 'Westerwald' : item.bezirk === 'NR' ? 'Neuwied' : item.bezirk;
    pills += '<span class="diff-pill diff-leicht-bg">📍 ' + escapeHtml(bezirkLabel) + '</span>';
  }
  if (item.kostenfrei) pills += '<span class="diff-pill termin-frei-pill">kostenfrei</span>';
  if (item.fuerKids) pills += '<span class="diff-pill termin-kids-pill">👶 Familie</span>';
  if (item.quelle === 'lit') pills += '<span class="diff-pill quelle-lit">📚 ww-Lit</span>';
  if (item.sourceUrl) pills += '<a class="btn-action btn-gpx" href="' + item.sourceUrl + '" target="_blank" rel="noopener">🌐 Website</a>';
  if (item.quelle === 'natur' && item.website) {
    var url = item.website.indexOf('http') === 0 ? item.website : 'https://' + item.website;
    pills += '<a class="btn-action btn-gpx" href="' + url + '" target="_blank" rel="noopener">🌐 Website</a>';
  }
  if (hatVerortbareInfo(item) && info.karteUrl) {
    pills += '<a class="btn-action outline" href="' + info.karteUrl + '">🗺️ Karte</a>';
  }
  pills += '</div>';

  var html = '<div class="sticky-detail">'
    + navBar(zurueck, info.breadcrumb)
    + intro(info.titel, '')
    + '<div class="sticky-detail-titel">' + escapeHtml(item.titel) + '</div>'
    + pills
    + '</div>';

  html += '<div class="detail-section">';
  if (item.untertitel) html += '<div class="detail-subtitle"><em>' + escapeHtml(item.untertitel) + '</em></div>';

  // Stats-Grid
  var stats = [];
  if (item.dauer) stats.push('<div class="stat"><div class="stat-label">Dauer</div><div class="stat-wert">' + escapeHtml(item.dauer) + '</div></div>');
  if (item.kosten && !item.kostenfrei) {
    var k = item.kosten;
    if (/^\d+([,.]\d+)?$/.test(k)) k = k + ' €';
    else if (/^\d+([,.]\d+)?\s*\/\s*\d+([,.]\d+)?$/.test(k)) k = k + ' €';
    stats.push('<div class="stat"><div class="stat-label">Kosten</div><div class="stat-wert">' + escapeHtml(k) + '</div></div>');
  }
  if (item.anmeldung) stats.push('<div class="stat"><div class="stat-label">Anmeldung</div><div class="stat-wert">' + escapeHtml(item.anmeldung) + '</div></div>');
  if (item.kategorie && item.quelle === 'event') stats.push('<div class="stat"><div class="stat-label">Kategorie</div><div class="stat-wert">' + escapeHtml(item.kategorie) + '</div></div>');
  if (item.region) stats.push('<div class="stat"><div class="stat-label">Region</div><div class="stat-wert">' + escapeHtml(item.region) + '</div></div>');
  if (stats.length) html += '<div class="stats-grid">' + stats.join('') + '</div>';

  // Dropdowns – kanonische Reihenfolge
  var first = true;
  if (item.beschreibung) { html += dropdown('Beschreibung', richText(item.beschreibung), first); first = false; }

  // Mitwirkende (nur Lit)
  if (item.mitwirkende) { html += dropdown('Mitwirkende', richText(item.mitwirkende), first); first = false; }

  // Ort & Adresse
  var ortInhalt = '';
  if (item.adresse) ortInhalt += '<p>' + escapeHtml(item.adresse) + '</p>';
  if (item.plzOrt) ortInhalt += '<p><strong>' + escapeHtml(item.plzOrt) + '</strong></p>';
  if (item.ort && !item.plzOrt) ortInhalt += '<p><strong>' + escapeHtml(item.ort) + '</strong></p>';
  if (item.lat && item.lng) {
    ortInhalt += '<p><a href="https://www.openstreetmap.org/?mlat=' + item.lat + '&mlon=' + item.lng + '#map=15/' + item.lat + '/' + item.lng + '" target="_blank" rel="noopener">📍 Auf Karte zeigen</a></p>';
  }
  if (ortInhalt) { html += dropdown('Ort & Adresse', ortInhalt, first); first = false; }

  // Mitbringen / Beachten (Naturerlebnis)
  if (item.mitbringen) { html += dropdown('Mitbringen', richText(item.mitbringen), first); first = false; }
  if (item.beachten)   { html += dropdown('Hinweise',   richText(item.beachten),   first); first = false; }

  // Veranstalter & Kontakt
  var kontakt = '';
  if (item.veranstalter) kontakt += '<p><strong>Veranstalter:</strong> ' + escapeHtml(item.veranstalter) + '</p>';
  if (item.leitung)      kontakt += '<p><strong>Leitung:</strong> ' + escapeHtml(item.leitung) + '</p>';
  if (item.telefon)      kontakt += '<p><strong>Telefon:</strong> <a href="tel:' + item.telefon.replace(/\s+/g,'') + '">' + escapeHtml(item.telefon) + '</a></p>';
  if (item.email)        kontakt += '<p><strong>E-Mail:</strong> <a href="mailto:' + item.email + '">' + escapeHtml(item.email) + '</a></p>';
  if (item.website && item.quelle !== 'lit') {
    var w = item.website.indexOf('http') === 0 ? item.website : 'https://' + item.website;
    kontakt += '<p><strong>Website:</strong> <a href="' + w + '" target="_blank" rel="noopener">' + escapeHtml(item.website) + '</a></p>';
  }
  if (item.anmeldungKontakt) kontakt += '<p><strong>Anmeldung:</strong> ' + escapeHtml(item.anmeldungKontakt) + '</p>';
  if (item.sourceUrl)    kontakt += '<p><a href="' + item.sourceUrl + '" target="_blank" rel="noopener">Link zur Originalwebsite</a></p>';
  if (kontakt) { html += dropdown('Veranstalter & Kontakt', kontakt, first); first = false; }

  if (first) html += '<div class="hinweis">Weitere Details werden ergänzt.</div>';

  html += '</div><div class="spacer"></div>';
  ziel.innerHTML = html;
}

function escapeHtml(s) {
  if (s == null) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// Bereinigt Plain-Text-Eigenheiten aus den importierten Datenquellen:
//  - Zeilenanfangs-">" (Quote-Marker aus dem Quellsystem) entfernen
//  - HTML-Entities wie &nbsp; in Unicode wandeln, BEVOR escapeHtml läuft
//  - \r\n und einzelne \r vereinheitlichen
//  - Mehrfach-Leerzeichen reduzieren
function cleanupPlainText(s) {
  if (s == null) return '';
  var t = String(s);
  // Zeilenenden vereinheitlichen
  t = t.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  // HTML-Entities zu echten Zeichen (vor escapeHtml!)
  t = t.replace(/&nbsp;/gi, '\u00A0')
       .replace(/&amp;/gi, '&')
       .replace(/&lt;/gi, '<')
       .replace(/&gt;/gi, '>')
       .replace(/&quot;/gi, '"')
       .replace(/&#39;/gi, "'")
       .replace(/&ndash;/gi, '–')
       .replace(/&mdash;/gi, '—')
       .replace(/&hellip;/gi, '…');
  // Quote-Marker am Zeilenanfang ENTFERNEN (auch wenn mehrfach hintereinander).
  // Beispiele aus den Daten: ">Im Rahmen…", ">>Eine Tour…", "> > >Hinweise: > > >"
  t = t.replace(/^[\s]*(?:>+\s*)+/gm, '');           // Zeilenanfang: alle > entfernen
  // Inline: nach Whitespace einer/mehrere ">" gefolgt von beliebigem Zeichen → entfernen
  // (Vorsicht: nicht in URLs oder echten HTML-Tags – aber die landen hier nicht her, weil
  //  cleanupPlainText nur für Plain-Text-Felder aufgerufen wird via linkifyAndBreak.)
  t = t.replace(/(\s)(?:>+\s*)+/g, '$1');
  t = t.replace(/(?:\s)(?:>\s*)+$/gm, '');           // Trailing > am Zeilenende
  // &nbsp;-Reste, die eingebettet zwischen Wörtern stehen, sollten ein normales
  // Leerzeichen ersetzen (verhindert "Wort\u00A0\u00A0Wort"):
  t = t.replace(/\u00A0{2,}/g, ' ');
  // Mischung aus NBSP + normalen Leerzeichen → einzelnes normales Leerzeichen
  t = t.replace(/[\u00A0 \t]{2,}/g, ' ');
  // Mehr als 2 aufeinanderfolgende Newlines reduzieren
  t = t.replace(/\n{3,}/g, '\n\n');
  return t.trim();
}

function linkifyAndBreak(s) {
  if (!s) return '';
  var clean = cleanupPlainText(s);
  if (!clean) return '';
  var html = escapeHtml(clean);
  html = html.replace(/(https?:\/\/[^\s)]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
  html = html.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>');
  return '<p>' + html + '</p>';
}
/* richText: erkennt automatisch ob es schon HTML-Markup enthält.
   Wenn ja → unverändert (mit Linkifizierung) ausgeben.
   Wenn nein → wie linkifyAndBreak behandeln (Plain-Text). */
function richText(s) {
  if (!s) return '';
  var t = String(s).trim();
  if (!t) return '';
  // HTML-Erkennung: enthält Tags wie <strong>, <p>, <br>, <ul> etc.
  var hasHtml = /<(?:strong|em|b|i|u|p|br|ul|ol|li|a\s|h[1-6]|div|span|table|tr|td|th)\b[^>]*>|<br\s*\/?>/i.test(t);
  if (hasHtml) {
    // Schon HTML – aber &nbsp; und Co. lassen wir stehen (sind valides HTML)
    var html = t.replace(/(^|[^"'>=])(https?:\/\/[^\s<)"']+)/g,
      '$1<a href="$2" target="_blank" rel="noopener">$2</a>');
    if (!/^\s*<(?:p|div|ul|ol|h[1-6]|table)\b/i.test(html)) {
      html = '<p>' + html + '</p>';
    }
    return html;
  }
  return linkifyAndBreak(s);
}
function txt(s) { return richText(s); }

function dropdown(titel, inhalt, offen) {
  if (!inhalt) return '';
  return '<div class="dropdown' + (offen ? ' offen' : '') + '">'
    + '<div class="dropdown-header" onclick="this.parentNode.classList.toggle(\'offen\')">'
      + '<div class="dropdown-titel">' + titel + '</div>'
      + '<div class="dropdown-pfeil">▾</div>'
    + '</div>'
    + '<div class="dropdown-inhalt">' + inhalt + '</div>'
  + '</div>';
}

// ════════════════════════════════════════════════════════════════
// ROUTE-DETAIL (einheitlich – kanonische Reihenfolge der Dropdowns)
// Funktioniert für ALLE Schemata:
//   • Westerwaldsteig / Wäller Touren / Kleine Wäller   (objektbasiert)
//   • Druidensteig                                       (sections-Schema)
//   • Wiedweg                                            (HTML-Strings, eigene Felder)
//   • Rennrad / Streckenradwege / Rundradwege / Gravel / MTB (Plain-Text-Strings)
//
// Reihenfolge der Dropdowns IMMER:
//   1. Beschreibung (Über die Tour)
//   2. Anfahrt
//   3. Öffentliche Verkehrsmittel
//   4. Parken
//   5. Wegbeschreibung
//   6. Sicherheitshinweise
//   7. Ausrüstung
//   8. Tipps
//   9. Literatur
//   10. Start
//   11. Ziel
// ════════════════════════════════════════════════════════════════

// Kanonische Reihenfolge – KEY:LABEL
var CANON_ORDER = [
  ['beschreibung',  'Beschreibung'],
  ['anfahrt',       'Anfahrt'],
  ['oepnv',         'Öffentliche Verkehrsmittel'],
  ['parken',        'Parken'],
  ['wegbeschreibung', 'Wegbeschreibung'],
  ['sicherheit',    'Sicherheitshinweise'],
  ['ausruestung',   'Ausrüstung'],
  ['tipps',         'Tipps'],
  ['literatur',     'Literatur'],
  ['start',         'Start'],
  ['ziel',          'Ziel']
];

/* Mapping der Druidensteig-Section-Icons auf canonical Keys */
var SECTION_ICON_MAP = {
  'beschreibung': 'beschreibung',
  'anfahrt':      'anfahrt',
  'oepnv':        'oepnv',
  'parken':       'parken',
  'weg':          'wegbeschreibung',
  'wegbeschreibung': 'wegbeschreibung',
  'sicherheit':   'sicherheit',
  'sicherheitshinweise': 'sicherheit',
  'ausruestung':  'ausruestung',
  'tipps':        'tipps',
  'literatur':    'literatur',
  'start':        'start',
  'ziel':         'ziel'
};

function buildCanonicalSections(item) {
  var sections = {}; // key -> html

  // ── Pfad A: SECTIONS-SCHEMA (Druidensteig)
  if (item.sections && Array.isArray(item.sections)) {
    item.sections.forEach(function(sec) {
      var icon = (sec.icon || '').toLowerCase();
      // Profil überspringen (steckt schon in Stats-Grid)
      if (icon === 'profil') return;
      var key = SECTION_ICON_MAP[icon];
      if (!key) {
        // Fallback: anhand des Titels mappen
        var t = (sec.title || '').toLowerCase();
        if (t.indexOf('beschreib') >= 0) key = 'beschreibung';
        else if (t.indexOf('anfahrt') >= 0) key = 'anfahrt';
        else if (t.indexOf('öpnv') >= 0 || t.indexOf('öffentlich') >= 0) key = 'oepnv';
        else if (t.indexOf('park') >= 0) key = 'parken';
        else if (t.indexOf('weg') >= 0) key = 'wegbeschreibung';
        else if (t.indexOf('sicher') >= 0) key = 'sicherheit';
        else if (t.indexOf('ausrüst') >= 0 || t.indexOf('ausruest') >= 0) key = 'ausruestung';
        else if (t.indexOf('tipp') >= 0) key = 'tipps';
        else if (t.indexOf('literatur') >= 0) key = 'literatur';
        else if (t.indexOf('start') >= 0) key = 'start';
        else if (t.indexOf('ziel') >= 0) key = 'ziel';
      }
      if (key) sections[key] = sec.html || '';
    });
    return sections;
  }

  // ── Pfad B: STRUCTURED + RICH-TEXT (alle anderen Schemata)
  // BESCHREIBUNG
  if (item.description) {
    var desc = '';
    if (typeof item.description === 'object') {
      if (item.description.headline) desc += '<p><strong>' + escapeHtml(item.description.headline) + '</strong></p>';
      if (item.description.text)     desc += richText(item.description.text);
    } else desc = richText(item.description);
    if (desc) sections.beschreibung = desc;
  }

  // ANFAHRT
  var anfahrt = '';
  if (item.directions) {
    if (typeof item.directions === 'object') {
      if (item.directions.byCar) {
        anfahrt += '<p><strong>Mit dem Auto:</strong></p>' + richText(item.directions.byCar);
      }
    } else {
      anfahrt = richText(item.directions);
    }
  }
  if (anfahrt) sections.anfahrt = anfahrt;

  // ÖFFENTLICHE VERKEHRSMITTEL
  var oepnv = '';
  // Variante 1: directions.byPublicTransport (Wiedweg)
  if (item.directions && typeof item.directions === 'object' && item.directions.byPublicTransport) {
    oepnv += richText(item.directions.byPublicTransport);
  }
  // Variante 2: publicTransport-Objekt oder -String
  if (item.publicTransport) {
    if (typeof item.publicTransport === 'object') {
      var pt = item.publicTransport;
      if (pt.arrival)    oepnv += '<p><strong>Anfahrt mit Bahn/Bus:</strong></p>' + richText(pt.arrival);
      if (pt.returnTrip) oepnv += '<p><strong>Rückfahrt:</strong></p>' + richText(pt.returnTrip);
      if (pt.returnTripUrl) oepnv += '<p><a href="' + pt.returnTripUrl + '" target="_blank" rel="noopener">Fahrplan-PDF</a></p>';
      if (pt.stops && pt.stops.length) {
        oepnv += '<p><strong>Haltestellen:</strong></p><ul>';
        pt.stops.forEach(function(s) {
          oepnv += '<li><strong>' + escapeHtml(s.name||'') + '</strong>' + (s.note ? '<br>' + escapeHtml(s.note) : '') + '</li>';
        });
        oepnv += '</ul>';
      }
      if (pt.links && pt.links.length) {
        oepnv += '<p><strong>Fahrplaninfos:</strong></p><ul>';
        pt.links.forEach(function(l) {
          oepnv += '<li><a href="' + l.url + '" target="_blank" rel="noopener">' + escapeHtml(l.label || l.url) + '</a></li>';
        });
        oepnv += '</ul>';
      }
      if (pt.taxis && pt.taxis.length) {
        oepnv += '<p><strong>Taxiunternehmen:</strong></p><ul>';
        pt.taxis.forEach(function(t) { oepnv += '<li>' + escapeHtml(t) + '</li>'; });
        oepnv += '</ul>';
      }
      if (pt.sustainableTip) {
        oepnv += '<p><strong>🌱 Nachhaltig anreisen:</strong></p>' + richText(pt.sustainableTip);
        if (pt.sustainableTipUrls && pt.sustainableTipUrls.length) {
          oepnv += '<p>';
          pt.sustainableTipUrls.forEach(function(u, i) {
            if (i > 0) oepnv += ' · ';
            oepnv += '<a href="' + u.url + '" target="_blank" rel="noopener">' + escapeHtml(u.label || u.url) + '</a>';
          });
          oepnv += '</p>';
        }
      }
      if (pt.moreInfoUrl) {
        oepnv += '<p><a href="' + pt.moreInfoUrl + '" target="_blank" rel="noopener">Weitere Infos zur Anreise</a></p>';
      }
    } else {
      oepnv += richText(item.publicTransport);
    }
  }
  if (oepnv) sections.oepnv = oepnv;

  // PARKEN
  var parken = '';
  // Variante 1: directions.parking (Wiedweg)
  if (item.directions && typeof item.directions === 'object' && item.directions.parking) {
    parken += richText(item.directions.parking);
  }
  // Variante 2: parking-Array oder -String
  if (item.parking) {
    if (Array.isArray(item.parking)) {
      if (item.parking.length) {
        parken += '<ul>';
        item.parking.forEach(function(p) {
          parken += '<li><strong>' + escapeHtml(p.location||'') + ':</strong>'
            + (p.free ? '<br>kostenlos: ' + escapeHtml(p.free) : '')
            + (p.paid ? '<br>gebührenpflichtig: ' + escapeHtml(p.paid) : '')
            + '</li>';
        });
        parken += '</ul>';
      }
    } else {
      parken += richText(item.parking);
    }
  }
  if (parken) sections.parken = parken;

  // WEGBESCHREIBUNG
  var weg = '';
  if (item.routeDescription) {
    if (typeof item.routeDescription === 'object') {
      if (item.routeDescription.general) weg += richText(item.routeDescription.general);
      if (item.routeDescription.accessTrails && item.routeDescription.accessTrails.length) {
        weg += '<p><strong>Zuwege:</strong></p><ul>';
        item.routeDescription.accessTrails.forEach(function(t) { weg += '<li>' + escapeHtml(t) + '</li>'; });
        weg += '</ul>';
      }
      if (item.routeDescription.accessTrailMarking) {
        weg += '<p><strong>Markierung:</strong> ' + escapeHtml(item.routeDescription.accessTrailMarking) + '</p>';
      }
    } else {
      weg = richText(item.routeDescription);
    }
  }
  // Wiedweg nutzt wayDescription
  if (!weg && item.wayDescription) weg = richText(item.wayDescription);
  if (weg) sections.wegbeschreibung = weg;

  // SICHERHEITSHINWEISE
  var sicher = '';
  if (item.safetyNotes) sicher += richText(item.safetyNotes);
  if (item.safetyAppUrl) {
    sicher += '<p><strong>App-Empfehlung:</strong> '
      + '<a href="' + item.safetyAppUrl + '" target="_blank" rel="noopener">'
      + 'Rheinland-Pfalz erleben</a></p>';
  }
  if (sicher) sections.sicherheit = sicher;

  // AUSRÜSTUNG
  if (item.equipment) sections.ausruestung = richText(item.equipment);

  // TIPPS
  var tipps = '';
  if (item.tips) {
    if (Array.isArray(item.tips)) {
      if (item.tips.length) {
        tipps += '<ul>';
        item.tips.forEach(function(t) {
          tipps += '<li><strong>' + escapeHtml(t.name||'') + '</strong>'
            + (t.note ? '<br>' + escapeHtml(t.note) : '')
            + (t.url ? '<br><a href="' + t.url + '" target="_blank" rel="noopener">' + t.url + '</a>' : '')
            + '</li>';
        });
        tipps += '</ul>';
      }
    } else {
      tipps = richText(item.tips);
    }
  }
  if (tipps) sections.tipps = tipps;

  // LITERATUR
  var lit = '';
  if (item.literature) {
    if (Array.isArray(item.literature)) {
      if (item.literature.length) {
        lit += '<ul>';
        item.literature.forEach(function(l) { lit += '<li>' + escapeHtml(l) + '</li>'; });
        lit += '</ul>';
      }
    } else {
      lit = richText(item.literature);
    }
  }
  if (lit) sections.literatur = lit;

  // START
  var start = '';
  if (item.start) {
    if (typeof item.start === 'object') {
      start = '<p><strong>' + escapeHtml(item.start.name||'') + '</strong>'
        + (item.start.address ? '<br>' + escapeHtml(item.start.address) : '')
        + (item.start.coordinates ? '<br><em>' + escapeHtml(item.start.coordinates) + '</em>' : '')
        + '</p>';
    } else {
      start = richText(item.start);
    }
  } else if (item.startPoint) {
    start = richText(item.startPoint);
  }
  if (start) sections.start = start;

  // ZIEL
  var ziel = '';
  if (item.destination) {
    if (typeof item.destination === 'object') {
      ziel = '<p><strong>' + escapeHtml(item.destination.name||'') + '</strong>'
        + (item.destination.address ? '<br>' + escapeHtml(item.destination.address) : '')
        + (item.destination.coordinates ? '<br><em>' + escapeHtml(item.destination.coordinates) + '</em>' : '')
        + '</p>';
    } else {
      ziel = richText(item.destination);
    }
  } else if (item.endPoint) {
    ziel = richText(item.endPoint);
  }
  if (ziel) sections.ziel = ziel;

  return sections;
}

function renderRouteDetail(ziel, item, info, zurueck) {
  var n = normalisiere(item);
  var sw = swKlasse(n.schwierigkeit);
  var diffBg = sw ? 'diff-' + sw + '-bg' : '';

  // STICKY HEADER: nav + intro + Etappentitel + Schwierigkeit/GPX/Karte
  var stickyTopRow = '<div class="diff-gpx-row">';
  if (n.schwierigkeit) stickyTopRow += '<span class="diff-pill ' + diffBg + '">' + escapeHtml(n.schwierigkeit) + '</span>';
  if (n.gpxUrl) stickyTopRow += '<a class="btn-action btn-gpx" href="' + n.gpxUrl + '" target="_blank" rel="noopener">📥 GPX</a>';
  // Karte intern (Leaflet + GPX/Marker) — anzeigen wenn GPX ODER Start/Ziel-Daten vorhanden
  if (info.karteUrl && (n.gpxUrl || item.start || item.destination)) {
    stickyTopRow += '<a class="btn-action outline" href="' + info.karteUrl + '">🗺️ Karte</a>';
  } else if (n.tourenplanerUrl) {
    stickyTopRow += '<a class="btn-action outline" href="' + n.tourenplanerUrl + '" target="_blank" rel="noopener">🗺️ Karte</a>';
  }
  stickyTopRow += '</div>';

  var html = '<div class="sticky-detail">'
    + navBar(zurueck, info.breadcrumb)
    + intro(info.titel, info.untertitel || '')
    + '<div class="sticky-detail-titel">' + escapeHtml(n.titel) + '</div>'
    + stickyTopRow
    + '</div>';

  // STATS-GRID (im scrollenden Bereich)
  html += '<div class="detail-section">';
  if (n.subtitle) html += '<div class="detail-subtitle">' + escapeHtml(n.subtitle) + '</div>';

  var sList = [];
  var addStat = function(label, val) { if (val) sList.push('<div class="stat"><div class="stat-label">' + label + '</div><div class="stat-wert">' + escapeHtml(val) + '</div></div>'); };
  addStat('Distanz', n.km ? (n.km + (String(n.km).indexOf('km')<0 ? ' km' : '')) : '');
  addStat('Dauer', n.dauer);
  addStat('Aufstieg', n.aufstieg);
  addStat('Abstieg', n.abstieg);
  addStat('Höchster Punkt', n.hoechster);
  addStat('Tiefster Punkt', n.tiefster);
  if (sList.length) html += '<div class="stats-grid">' + sList.join('') + '</div>';

  // KANONISCHE DROPDOWNS in fester Reihenfolge
  var sections = buildCanonicalSections(item);
  var firstShown = false;
  for (var i = 0; i < CANON_ORDER.length; i++) {
    var key = CANON_ORDER[i][0];
    var label = CANON_ORDER[i][1];
    if (sections[key]) {
      html += dropdown(label, sections[key], !firstShown);
      firstShown = true;
    }
  }

  // Hinweis falls noch keine Detail-Daten
  if (!firstShown) {
    html += '<div class="hinweis">Detail-Informationen zu dieser Tour werden noch ergänzt.</div>';
  }

  html += '</div><div class="spacer"></div>';
  ziel.innerHTML = html;
}

// === Ausflugsziel / Museum / Literatur ===
function renderAusflDetail(ziel, item, info, zurueck) {
  var html = navBar(zurueck, info.breadcrumb)
    + intro(info.titel || 'Detail', '')
    + '<div class="detail-section">'
    + '<h2 class="detail-titel">' + escapeHtml(item.name) + '</h2>';
  var tagRow = '<div class="diff-gpx-row">';
  if (item.mainTopic || item.topic) tagRow += '<span class="diff-pill">' + escapeHtml(item.mainTopic || item.topic) + '</span>';
  if (item.town) tagRow += '<span class="diff-pill diff-leicht-bg">' + escapeHtml(item.town) + '</span>';
  if (item.url) tagRow += '<a class="btn-action btn-gpx" href="' + item.url + '" target="_blank" rel="noopener">🌐 Website</a>';
  if (hatVerortbareInfo(item) && info.karteUrl) {
    tagRow += '<a class="btn-action outline" href="' + info.karteUrl + '">🗺️ Karte</a>';
  }
  tagRow += '</div>';
  html += tagRow;
  if (item.description || item.desc) html += dropdown('Beschreibung', txt(item.description || item.desc), true);
  if (item.url) html += dropdown('Mehr Informationen', '<p><a href="' + item.url + '" target="_blank" rel="noopener">' + item.url + '</a></p>');
  html += '</div><div class="spacer"></div>';
  ziel.innerHTML = html;
}

// === Badesee ===
function renderBadeseeDetail(ziel, item, info, zurueck) {
  var html = navBar(zurueck, info.breadcrumb)
    + intro(info.titel, '')
    + '<div class="detail-section">'
    + '<h2 class="detail-titel">' + escapeHtml(item.name) + '</h2>';
  var tagRow = '<div class="diff-gpx-row">';
  if (item.ort) tagRow += '<span class="diff-pill diff-leicht-bg">📍 ' + escapeHtml(item.ort) + '</span>';
  if (hatVerortbareInfo(item) && info.karteUrl) {
    tagRow += '<a class="btn-action outline" href="' + info.karteUrl + '">🗺️ Karte</a>';
  }
  tagRow += '</div>';
  html += tagRow;
  if (item.kurz) html += dropdown('Kurzinfo', txt(item.kurz), true);
  if (item.detail) html += dropdown('Beschreibung', txt(item.detail));

  // Vollständige Adresse: Straße, PLZ + Ort, Telefon, E-Mail, Web
  var kontakt = '';
  // Adresse als Block
  var adresse = '';
  if (item.strasse) adresse += escapeHtml(item.strasse) + '<br>';
  if (item.plz || item.ort) {
    adresse += (item.plz ? escapeHtml(item.plz) + ' ' : '') + (item.ort ? escapeHtml(item.ort) : '') + '<br>';
  }
  if (adresse) kontakt += '<p><strong>Adresse:</strong><br>' + adresse + '</p>';
  if (item.tel)  kontakt += '<p><strong>Telefon:</strong> <a href="tel:' + escapeHtml(item.tel.replace(/\s+/g,'')) + '">' + escapeHtml(item.tel) + '</a></p>';
  if (item.mail) kontakt += '<p><strong>E-Mail:</strong> <a href="mailto:' + escapeHtml(item.mail) + '">' + escapeHtml(item.mail) + '</a></p>';
  if (item.links && item.links.length) {
    item.links.forEach(function(l) {
      kontakt += '<p><strong>Web:</strong> <a href="' + escapeHtml(l) + '" target="_blank" rel="noopener">' + escapeHtml(l.replace(/^https?:\/\//,'').replace(/\/$/,'')) + '</a></p>';
    });
  }
  if (!kontakt) kontakt = '<p class="hinweis-leer"><em>Kontaktdaten bitte beim örtlichen Tourismusbüro erfragen.</em></p>';
  html += dropdown('Kontakt', kontakt);

  html += '</div><div class="spacer"></div>';
  ziel.innerHTML = html;
}

// === Unterkunft ===
function renderUnterkunftDetail(ziel, item, info, zurueck) {
  var html = navBar(zurueck, info.breadcrumb)
    + intro(info.titel, '')
    + '<div class="detail-section">'
    + '<h2 class="detail-titel">' + escapeHtml(item.name) + '</h2>';
  var tagRow = '<div class="diff-gpx-row">';
  var hatTags = false;
  if (item.categories && item.categories.length) {
    item.categories.forEach(function(c) { tagRow += '<span class="diff-pill">' + escapeHtml(c) + '</span>'; });
    hatTags = true;
  }
  if (hatVerortbareInfo(item) && info.karteUrl) {
    tagRow += '<a class="btn-action outline" href="' + info.karteUrl + '">🗺️ Karte</a>';
    hatTags = true;
  }
  tagRow += '</div>';
  if (hatTags) html += tagRow;
  if (item.description) html += dropdown('Beschreibung', txt(item.description), true);
  if (item.features && item.features.length) {
    var f = '<ul>';
    item.features.forEach(function(x) { f += '<li>' + escapeHtml(x) + '</li>'; });
    f += '</ul>';
    html += dropdown('Ausstattung', f);
  }
  if (item.contact && (item.contact.phone || item.contact.email || item.contact.url)) {
    var k = '';
    if (item.contact.phone) k += '<strong>Telefon:</strong> ' + escapeHtml(item.contact.phone) + '<br>';
    if (item.contact.email) k += '<strong>E-Mail:</strong> <a href="mailto:' + item.contact.email + '">' + item.contact.email + '</a><br>';
    if (item.contact.url)   k += '<strong>Web:</strong> <a href="' + item.contact.url + '" target="_blank">' + item.contact.url + '</a>';
    html += dropdown('Kontakt', '<p>' + k + '</p>');
  }
  if (!item.description && (!item.features || !item.features.length)) {
    html += '<div class="hinweis">Detail-Daten zu dieser Unterkunft werden noch befüllt.</div>';
  }
  html += '</div><div class="spacer"></div>';
  ziel.innerHTML = html;
}


// ════════════════════════════════════════════════════════════════
// AUSFLUGSZIELE / UNTERKÜNFTE: Liste mit Typ-Filter + Suche
// ════════════════════════════════════════════════════════════════

var GEFILTERT_STATE = { typ: 'alle', suche: '' };
window._aktuelleGefiltert = null;

function gefiltertFilterUI(l) {
  var html = '<div class="filter-leiste gefiltert-filter">';
  html += '<div class="filter-gruppe filter-bezirk">';
  html += '<span class="filter-label">' + escapeHtml(l.filterLabel || 'Typ') + ':</span>';
  for (var i = 0; i < l.filterTypen.length; i++) {
    var t = l.filterTypen[i];
    var aktiv = GEFILTERT_STATE.typ === t.key;
    html += '<button class="filter-pill' + (aktiv ? ' aktiv' : '') + '" '
      + 'onclick="setzeGefiltertFilter(\'' + t.key + '\')">' + escapeHtml(t.label) + '</button>';
  }
  html += '</div>';
  html += '<div class="filter-gruppe filter-suche">';
  html += '<input type="text" class="filter-such-input" placeholder="🔍 Suchen…" '
    + 'value="' + escapeHtml(GEFILTERT_STATE.suche) + '" '
    + 'oninput="setzeGefiltertSuche(this.value)">';
  html += '</div>';
  html += '</div>';
  return html;
}

function setzeGefiltertFilter(key) {
  GEFILTERT_STATE.typ = key;
  refreshGefiltertView();
}
function setzeGefiltertSuche(val) {
  GEFILTERT_STATE.suche = val || '';
  refreshGefiltertView();
}
function refreshGefiltertView() {
  var ctx = window._aktuelleGefiltert;
  if (!ctx) return;
  // Nur das Filter-Wrapper und die Liste neu rendern, nicht die ganze Seite
  var filterWrap = document.getElementById('gefiltert-filter-wrap');
  if (filterWrap) filterWrap.innerHTML = gefiltertFilterUI(ctx.info);
  var listenEl = document.getElementById('gefiltert-liste');
  if (listenEl) {
    var html = baueGefiltertListe(ctx.slug, ctx.info);
    listenEl.innerHTML = html.html;
    var trefferEl = document.getElementById('gefiltert-treffer');
    if (trefferEl) trefferEl.innerHTML = '<strong>' + html.gefiltertCount + '</strong> von <strong>' + html.gesamtCount + '</strong> Einträgen';
  }
}

function gefiltertItemTyp(item, l) {
  // l.typErkenner: function(item) → key (passend zu filterTypen[].key)
  if (l.typErkenner) return l.typErkenner(item);
  return 'sonstige';
}

function baueGefiltertListe(slug, l) {
  var rohdaten = window[l.datenName] || [];
  var suche = (GEFILTERT_STATE.suche || '').toLowerCase().trim();

  var gefiltert = rohdaten.filter(function(item) {
    if (GEFILTERT_STATE.typ !== 'alle') {
      if (gefiltertItemTyp(item, l) !== GEFILTERT_STATE.typ) return false;
    }
    if (suche) {
      var blob = ((item.name || '') + ' ' + (item.town || '') + ' ' + (item.region || '') + ' ' + (item.topic || '') + ' ' + (item.mainTopic || '')).toLowerCase();
      if (blob.indexOf(suche) < 0) return false;
    }
    return true;
  });

  if (!gefiltert.length) {
    return { html: '<div class="hinweis">Keine Einträge passen zu deiner Auswahl.</div>',
             gefiltertCount: 0, gesamtCount: rohdaten.length };
  }

  // Sortieren alphabetisch
  gefiltert.sort(function(a,b) {
    return (a.name || '').localeCompare(b.name || '', 'de');
  });

  var html = gefiltert.map(function(item) {
    var idx = rohdaten.indexOf(item);
    var titel = item.name || 'Eintrag';
    var ort = item.town || (item.contact && item.contact.town) || '';
    var thema = item.topic || item.mainTopic || gefiltertItemTyp(item, l) || '';
    var typLabel = '';
    if (l.filterTypen && l.typErkenner) {
      var tk = gefiltertItemTyp(item, l);
      for (var i = 0; i < l.filterTypen.length; i++) {
        if (l.filterTypen[i].key === tk && tk !== 'alle') { typLabel = l.filterTypen[i].label; break; }
      }
    }
    var meta = [];
    if (ort) meta.push('📍 ' + escapeHtml(ort));
    if (thema && thema !== typLabel) meta.push(escapeHtml(thema));
    return '<button class="eintrag" onclick="navigateTo(\'detail/' + l.detailKey + '/' + slug + '_' + idx + '\')">'
      + (typLabel ? '<div class="eintrag-typ-badge">' + escapeHtml(typLabel) + '</div>' : '')
      + '<div class="eintrag-text">'
        + '<div class="eintrag-titel">' + escapeHtml(titel) + '</div>'
        + (meta.length ? '<div class="eintrag-meta">' + meta.join(' · ') + '</div>' : '')
      + '</div>'
      + '<div class="eintrag-pfeil">&rsaquo;</div>'
    + '</button>';
  }).join('');

  return { html: html, gefiltertCount: gefiltert.length, gesamtCount: rohdaten.length };
}

function renderGefiltertListe(ziel, slug, l) {
  GEFILTERT_STATE = { typ: 'alle', suche: '' };
  window._aktuelleGefiltert = { slug: slug, info: l };

  var rohdaten = window[l.datenName] || [];
  if (!rohdaten.length) {
    ziel.innerHTML =
      '<div class="sticky-region">'
      + navBar(l.zurueck, l.breadcrumb)
      + intro(l.titel, l.untertitel)
      + '</div>'
      + '<div class="hinweis">Daten noch nicht verfügbar.</div>'
      + '<div class="spacer"></div>';
    return;
  }
  var liste = baueGefiltertListe(slug, l);

  ziel.innerHTML =
    '<div class="sticky-region">'
      + navBar(l.zurueck, l.breadcrumb)
      + intro(l.titel, l.untertitel)
      + '<div id="gefiltert-filter-wrap">' + gefiltertFilterUI(l) + '</div>'
    + '</div>'
    + '<div id="gefiltert-treffer" class="filter-treffer"><strong>' + liste.gefiltertCount + '</strong> von <strong>' + liste.gesamtCount + '</strong> Einträgen</div>'
    + '<div class="liste" id="gefiltert-liste">' + liste.html + '</div>'
    + '<div class="spacer"></div>';
}


// ════════════════════════════════════════════════════════════════
// INHALTS-SEITE (statischer HTML-Inhalt im App-Stil)
// Für: Westerwald-Box, Westerwälder Ernte
// ════════════════════════════════════════════════════════════════
function renderInhaltSeite(ziel, slug, l) {
  var inhalt = (window._INHALTE && window._INHALTE[l.inhaltKey]) || '';
  ziel.innerHTML =
    '<div class="sticky-region">'
      + navBar(l.zurueck, l.breadcrumb)
      + intro(l.titel, l.untertitel)
    + '</div>'
    + '<div class="detail-section inhalts-seite">' + (inhalt || '<div class="hinweis">Inhalt wird noch ergänzt.</div>') + '</div>'
    + '<div class="spacer"></div>';

  // Bilderslider initialisieren (sofern vorhanden)
  var sliders = ziel.querySelectorAll('.bilder-slider');
  for (var i = 0; i < sliders.length; i++) initSlider(sliders[i]);

  // Betriebs-Liste in Westerwald-Box einhängen
  var betriebeListe = ziel.querySelector('#ww-box-betriebe-liste');
  if (betriebeListe && window.DATA_WESTERWALDBOX_BETRIEBE) {
    betriebeListe.innerHTML = baueBetriebeListe();
  }
}

// ════════════════════════════════════════════════════════════════
// BILDERSLIDER (vanilla JS, swipe-fähig)
// Erwartet: <div class="bilder-slider" data-images='[{url,alt},...]'>
//   <div class="slider-bilder"></div>
//   <button class="slider-prev"></button><button class="slider-next"></button>
//   <div class="slider-punkte"></div><div class="slider-counter"></div>
// </div>
// ════════════════════════════════════════════════════════════════
function initSlider(slider) {
  var dataAttr = slider.getAttribute('data-images');
  if (!dataAttr) return;
  var bilder;
  try { bilder = JSON.parse(dataAttr); } catch (e) { return; }
  if (!bilder || !bilder.length) return;

  var bilderDiv = slider.querySelector('.slider-bilder');
  var punkteDiv = slider.querySelector('.slider-punkte');
  var counterDiv = slider.querySelector('.slider-counter');
  var prevBtn = slider.querySelector('.slider-prev');
  var nextBtn = slider.querySelector('.slider-next');

  // Bilder einsetzen
  var html = '';
  for (var i = 0; i < bilder.length; i++) {
    html += '<img class="slider-bild" data-idx="' + i + '" '
         + 'src="' + escapeHtml(bilder[i].url) + '" '
         + 'alt="' + escapeHtml(bilder[i].alt || '') + '" '
         + 'loading="lazy">';
  }
  if (bilderDiv) bilderDiv.innerHTML = html;

  // Punkte
  if (punkteDiv) {
    var punkteHtml = '';
    for (var j = 0; j < bilder.length; j++) {
      punkteHtml += '<button class="slider-punkt" data-idx="' + j + '" aria-label="Bild ' + (j+1) + '"></button>';
    }
    punkteDiv.innerHTML = punkteHtml;
  }

  var aktiv = 0;
  var anzahl = bilder.length;

  function zeige(idx) {
    if (idx < 0) idx = anzahl - 1;
    if (idx >= anzahl) idx = 0;
    aktiv = idx;
    if (bilderDiv) bilderDiv.style.transform = 'translateX(-' + (idx * 100) + '%)';
    if (counterDiv) counterDiv.textContent = (idx + 1) + ' / ' + anzahl;
    if (punkteDiv) {
      var punkte = punkteDiv.querySelectorAll('.slider-punkt');
      for (var k = 0; k < punkte.length; k++) {
        punkte[k].classList.toggle('aktiv', k === idx);
      }
    }
  }

  if (prevBtn) prevBtn.addEventListener('click', function() { zeige(aktiv - 1); });
  if (nextBtn) nextBtn.addEventListener('click', function() { zeige(aktiv + 1); });
  if (punkteDiv) {
    punkteDiv.addEventListener('click', function(e) {
      var btn = e.target.closest && e.target.closest('.slider-punkt');
      if (btn) zeige(parseInt(btn.getAttribute('data-idx'), 10));
    });
  }

  // Touch-Swipe
  var startX = null, deltaX = 0;
  slider.addEventListener('touchstart', function(e) {
    if (e.touches.length !== 1) return;
    startX = e.touches[0].clientX;
    deltaX = 0;
  }, { passive: true });
  slider.addEventListener('touchmove', function(e) {
    if (startX === null) return;
    deltaX = e.touches[0].clientX - startX;
  }, { passive: true });
  slider.addEventListener('touchend', function() {
    if (startX !== null && Math.abs(deltaX) > 40) {
      zeige(deltaX < 0 ? aktiv + 1 : aktiv - 1);
    }
    startX = null;
    deltaX = 0;
  });

  zeige(0);
}

function baueBetriebeListe() {
  var d = window.DATA_WESTERWALDBOX_BETRIEBE || [];
  var html = '';
  for (var i = 0; i < d.length; i++) {
    var b = d[i];
    var ortText = (b.plz || '') + (b.plz && b.ort ? ' ' : '') + (b.ort || '');
    var meta = [];
    if (ortText) meta.push('📍 ' + escapeHtml(ortText));
    if (b.branche) meta.push(escapeHtml(b.branche));
    var logoHtml = '';
    if (b.logo) {
      logoHtml = '<img class="betrieb-logo" src="' + escapeHtml(b.logo) + '" alt="Logo ' + escapeHtml(b.name) + '" loading="lazy" onerror="this.style.display=\'none\'">';
    }
    html += '<button class="eintrag betrieb-eintrag" onclick="navigateTo(\'detail/wwbox/' + i + '\')">'
      + (logoHtml || '<div class="betrieb-logo-platzhalter">' + escapeHtml(b.name.charAt(0)) + '</div>')
      + '<div class="eintrag-text">'
        + '<div class="eintrag-titel">' + escapeHtml(b.name) + '</div>'
        + (meta.length ? '<div class="eintrag-meta">' + meta.join(' · ') + '</div>' : '')
      + '</div>'
      + '<div class="eintrag-pfeil">&rsaquo;</div>'
    + '</button>';
  }
  return html;
}

// ════════════════════════════════════════════════════════════════
// IFRAME-SEITE (PDF oder externe Seite eingebettet)
// Für: Einkaufsführer-PDF, Naturgenuss Partner/Broschüre
// ════════════════════════════════════════════════════════════════
function renderIframeSeite(ziel, slug, l) {
  var iframeUrl = l.iframeUrl || '';
  var iframeTyp = l.iframeTyp || 'pdf'; // 'pdf' (default) oder 'webseite'
  var ua = (navigator.userAgent || '').toLowerCase();
  var istMobil = /iphone|ipad|ipod|android|mobile/.test(ua);

  // ── WEBSEITE ────────────────────────────────────────────────────
  if (iframeTyp === 'webseite') {
    // Seite blockiert per X-Frame-Options das Einbetten?
    // - Wenn Proxy konfiguriert: URL durch den Proxy routen, normal weiter
    // - Wenn kein Proxy: Fallback-Karte mit "Seite öffnen"-Button
    if (l.iframeBlockiert || l.iframeProxy) {
      var proxied = ggfProxy(iframeUrl);
      if (proxied) {
        // Proxy verfügbar → URL austauschen und weiterlaufen wie normal
        iframeUrl = proxied;
      } else {
        // Kein Proxy → Fallback-Karte
        var hostB = (l.iframeUrl || '').replace(/^https?:\/\//,'').split('/')[0];
        ziel.innerHTML =
          '<div class="sticky-region">'
            + navBar(l.zurueck, l.breadcrumb)
            + intro(l.titel, l.untertitel)
          + '</div>'
          + '<div class="pdf-mobile-karte">'
            + '<div class="pdf-mobile-icon">🌐</div>'
            + '<div class="pdf-mobile-titel">' + escapeHtml(l.titel) + '</div>'
            + '<p class="pdf-mobile-hinweis">Diese Webseite erlaubt keine direkte Einbettung. Öffne sie in einem neuen Tab.</p>'
            + '<a class="btn-pdf-oeffnen-gross" href="' + l.iframeUrl + '" target="_blank" rel="noopener">🌐 Seite jetzt öffnen</a>'
            + '<p class="pdf-mobile-meta">Inhalt von <a href="' + l.iframeUrl + '" target="_blank" rel="noopener">' + escapeHtml(hostB) + '</a></p>'
          + '</div>'
          + '<div class="spacer"></div>';
        return;
      }
    }
    if (istMobil) {
      // Mobile: schöne Karte mit "In neuem Tab öffnen"-Button.
      // Externe Web-Apps wie westerwald.info sind im iframe auf Mobile
      // schwer zu bedienen (Touch-Konflikte, scrollen, kleine Buttons).
      ziel.innerHTML =
        '<div class="sticky-region">'
          + navBar(l.zurueck, l.breadcrumb)
          + intro(l.titel, l.untertitel)
        + '</div>'
        + '<div class="pdf-mobile-karte">'
          + '<div class="pdf-mobile-icon">🌐</div>'
          + '<div class="pdf-mobile-titel">' + escapeHtml(l.titel) + '</div>'
          + '<p class="pdf-mobile-hinweis">Auf dem Smartphone funktioniert die externe Webseite am besten in einem eigenen Tab.</p>'
          + '<a class="btn-pdf-oeffnen-gross" href="' + iframeUrl + '" target="_blank" rel="noopener">🌐 Seite jetzt öffnen</a>'
          + '<p class="pdf-mobile-meta">Inhalt von <a href="' + iframeUrl + '" target="_blank" rel="noopener">' + escapeHtml(iframeUrl.replace(/^https?:\/\//,'').split('/')[0]) + '</a></p>'
        + '</div>'
        + '<div class="spacer"></div>';
      return;
    }
    // Desktop: Strategie "Karte + optionaler iframe":
    //   - Oben immer sichtbar: Karte mit großem "Seite öffnen"-Button.
    //     Damit hat der User auch dann ein klares Ziel, wenn der iframe
    //     vom Anbieter via X-Frame-Options blockiert wird.
    //   - Darunter: Versuch, die Seite eingebettet zu zeigen. Wenn das
    //     vom Anbieter erlaubt ist, sieht der User zusätzlich die echte
    //     Vorschau. Wenn nicht, bleibt der iframe-Bereich entweder leer
    //     oder er wird per Heuristik nach 3.5s ausgeblendet.
    var iframeId = 'iframe-' + Math.random().toString(36).slice(2);
    var hostname = iframeUrl.replace(/^https?:\/\//,'').split('/')[0];

    ziel.innerHTML =
      '<div class="sticky-region">'
        + navBar(l.zurueck, l.breadcrumb)
        + intro(l.titel, l.untertitel)
      + '</div>'
      // Karte oben — immer sichtbar
      + '<div class="iframe-info-karte">'
        + '<div class="iframe-info-text">'
          + '<strong>Inhalt von ' + escapeHtml(hostname) + '</strong>'
          + '<span class="iframe-info-hinweis">Falls die eingebettete Vorschau unten leer bleibt, kannst du die Seite hier in einem neuen Tab öffnen:</span>'
        + '</div>'
        + '<a class="btn-pdf-oeffnen-gross btn-info-karte" href="' + iframeUrl + '" target="_blank" rel="noopener">🌐 Seite öffnen</a>'
      + '</div>'
      // iframe-Versuch
      + '<div class="iframe-wrap iframe-versuch" id="' + iframeId + '-wrap">'
        + '<div class="iframe-lade-hinweis">Versuche, die Seite einzubetten …</div>'
        + '<iframe id="' + iframeId + '" src="' + iframeUrl + '" class="inhalts-iframe" '
        + 'allowfullscreen referrerpolicy="no-referrer-when-downgrade" '
        + 'sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-popups-to-escape-sandbox"></iframe>'
      + '</div>'
      + '<div class="spacer"></div>';

    // Lade-Hinweis nach 3.5s ausblenden, egal ob iframe geladen ist oder nicht
    setTimeout(function() {
      var wrap = document.getElementById(iframeId + '-wrap');
      if (!wrap) return;
      var hinweis = wrap.querySelector('.iframe-lade-hinweis');
      if (hinweis) hinweis.style.display = 'none';
    }, 3500);
    return;
  }

  // ── PDF (default) ───────────────────────────────────────────────
  // Mobile: PDF.js rendert Seiten als Canvas (zuverlässig auf allen
  //         Smartphones, vor allem iOS Safari, wo iframes oft scheitern).
  // Desktop: iframe-Einbettung (funktioniert gut und ist schnell).
  var pdfWrapId = 'pdfvw-' + Math.random().toString(36).slice(2);

  if (istMobil) {
    ziel.innerHTML =
      '<div class="sticky-region">'
        + navBar(l.zurueck, l.breadcrumb)
        + intro(l.titel, l.untertitel)
        + '<div class="iframe-aktionen">'
          + '<a class="btn-action btn-pdf-oeffnen" href="' + iframeUrl + '" target="_blank" rel="noopener">📄 PDF in neuem Tab öffnen</a>'
        + '</div>'
      + '</div>'
      + '<div class="pdf-mobile-viewer" id="' + pdfWrapId + '">'
        + '<div class="pdf-lade-hinweis" id="' + pdfWrapId + '-lade">PDF wird geladen…</div>'
      + '</div>'
      + '<div class="spacer"></div>';
    rendePdfMobile(pdfWrapId, iframeUrl);
    return;
  }

  // Desktop: iframe
  ziel.innerHTML =
    '<div class="sticky-region">'
      + navBar(l.zurueck, l.breadcrumb)
      + intro(l.titel, l.untertitel)
      + '<div class="iframe-aktionen">'
        + '<a class="btn-action btn-pdf-oeffnen" href="' + iframeUrl + '" target="_blank" rel="noopener">📄 PDF in neuem Tab öffnen</a>'
      + '</div>'
    + '</div>'
    + '<div class="iframe-wrap iframe-wrap-pdf" id="' + pdfWrapId + '-wrap">'
      + '<div class="iframe-lade-hinweis">PDF wird geladen…</div>'
      + '<iframe id="' + pdfWrapId + '" src="' + iframeUrl + '#view=FitH" class="inhalts-iframe inhalts-iframe-pdf" '
      + 'type="application/pdf" '
      + 'allowfullscreen referrerpolicy="no-referrer-when-downgrade" '
      + 'onload="this.parentNode.classList.add(\'iframe-geladen\')"></iframe>'
    + '</div>'
    + '<div class="iframe-fallback">'
      + 'PDF wird nicht angezeigt? <a href="' + iframeUrl + '" target="_blank" rel="noopener">Direkt öffnen ↗</a>'
    + '</div>'
    + '<div class="spacer"></div>';
  setTimeout(function() {
    var wrap = document.getElementById(pdfWrapId + '-wrap');
    if (wrap) wrap.classList.add('iframe-geladen');
  }, 6000);
}

// ════════════════════════════════════════════════════════════════
// PDF.JS MOBILE-RENDERER
// Lädt PDF.js dynamisch und rendert die PDF-Seiten als Canvas in
// einen scrollbaren Container. Funktioniert zuverlässig auf allen
// Mobile-Browsern (im Gegensatz zu iframe-PDF-Einbettung).
// ════════════════════════════════════════════════════════════════
var PDFJS_LADE_PROMISE = null;
function ladePdfJs() {
  if (window.pdfjsLib) return Promise.resolve();
  if (PDFJS_LADE_PROMISE) return PDFJS_LADE_PROMISE;
  PDFJS_LADE_PROMISE = new Promise(function(resolve, reject) {
    var s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js';
    s.async = true;
    s.onload = function() {
      if (window.pdfjsLib && window.pdfjsLib.GlobalWorkerOptions) {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc =
          'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
      }
      resolve();
    };
    s.onerror = function() { reject(new Error('PDF.js konnte nicht geladen werden')); };
    document.head.appendChild(s);
  });
  return PDFJS_LADE_PROMISE;
}

function rendePdfMobile(containerId, pdfUrl) {
  var container = document.getElementById(containerId);
  var ladeEl   = document.getElementById(containerId + '-lade');
  if (!container) return;

  function zeigeFehler(msg) {
    if (ladeEl) ladeEl.style.display = 'none';
    container.innerHTML =
      '<div class="pdf-fehler">'
        + '<p>' + escapeHtml(msg) + '</p>'
        + '<a class="btn-pdf-oeffnen-gross" href="' + pdfUrl + '" target="_blank" rel="noopener">📄 PDF in neuem Tab öffnen</a>'
      + '</div>';
  }

  ladePdfJs().then(function() {
    var pdfjsLib = window.pdfjsLib;
    if (!pdfjsLib) return zeigeFehler('PDF-Viewer konnte nicht initialisiert werden.');

    pdfjsLib.getDocument(pdfUrl).promise.then(function(pdf) {
      if (ladeEl) ladeEl.style.display = 'none';
      var anzSeiten = pdf.numPages;

      // Seiten der Reihe nach rendern (verhindert Speicher-Spike auf Mobile)
      var promise = Promise.resolve();
      for (var i = 1; i <= anzSeiten; i++) {
        (function(seitenNr) {
          promise = promise.then(function() {
            return pdf.getPage(seitenNr).then(function(page) {
              var containerBreite = container.clientWidth - 16; // etwas Innenabstand
              var basisViewport = page.getViewport({ scale: 1 });
              var scale = containerBreite / basisViewport.width;
              // Auf Retina-Displays für Schärfe doppelt rendern
              var devicePixelRatio = window.devicePixelRatio || 1;
              var renderViewport = page.getViewport({ scale: scale * devicePixelRatio });

              var canvas = document.createElement('canvas');
              canvas.className = 'pdf-seite-canvas';
              canvas.width  = renderViewport.width;
              canvas.height = renderViewport.height;
              // CSS-Breite an Container anpassen (Retina wird automatisch herunterskaliert)
              canvas.style.width  = (renderViewport.width / devicePixelRatio) + 'px';
              canvas.style.height = (renderViewport.height / devicePixelRatio) + 'px';

              var seitenWrap = document.createElement('div');
              seitenWrap.className = 'pdf-seite-wrap';
              seitenWrap.appendChild(canvas);
              var seitenNum = document.createElement('div');
              seitenNum.className = 'pdf-seiten-nr';
              seitenNum.textContent = 'Seite ' + seitenNr + ' von ' + anzSeiten;
              seitenWrap.appendChild(seitenNum);

              container.appendChild(seitenWrap);

              return page.render({
                canvasContext: canvas.getContext('2d'),
                viewport: renderViewport
              }).promise;
            });
          });
        })(i);
      }
      return promise;
    }).catch(function(err) {
      console.error('[PDF] Render-Fehler:', err);
      zeigeFehler('PDF konnte nicht geladen werden.');
    });
  }).catch(function(err) {
    console.error('[PDF] Library-Fehler:', err);
    zeigeFehler('PDF-Viewer konnte nicht geladen werden.');
  });
}

// ════════════════════════════════════════════════════════════════
// MUSEEN INLINE (alle Einträge mit Inhalt als Liste, kein externer Link)
// ════════════════════════════════════════════════════════════════
function renderMuseenInline(ziel, slug, l) {
  var daten = window[l.datenName] || [];
  if (!daten.length) {
    ziel.innerHTML = '<div class="sticky-region">' + navBar(l.zurueck, l.breadcrumb) + intro(l.titel, l.untertitel) + '</div>'
      + '<div class="hinweis">Museen-Daten werden noch ergänzt.</div><div class="spacer"></div>';
    return;
  }
  var items = daten.map(function(m, idx) {
    var ort = m.ort || m.town || '';
    var meta = [];
    if (ort) meta.push('📍 ' + escapeHtml(ort));
    return '<button class="eintrag" onclick="navigateTo(\'detail/museum/' + slug + '_' + idx + '\')">'
      + '<div class="eintrag-text">'
        + '<div class="eintrag-titel">' + escapeHtml(m.name) + '</div>'
        + (meta.length ? '<div class="eintrag-meta">' + meta.join(' · ') + '</div>' : '')
      + '</div>'
      + '<div class="eintrag-pfeil">&rsaquo;</div>'
    + '</button>';
  }).join('');
  ziel.innerHTML =
    '<div class="sticky-region">'
      + navBar(l.zurueck, l.breadcrumb)
      + intro(l.titel, l.untertitel)
    + '</div>'
    + '<div class="liste">' + items + '</div>'
    + '<div class="spacer"></div>';
}


// ════════════════════════════════════════════════════════════════
// NATURGENUSS LINKS (zwei PDF-Untereinträge)
// ════════════════════════════════════════════════════════════════
function renderNaturgenussLinks(ziel, slug, l) {
  var links = [
    {label:'Erzeuger & Produkte (PDF, 2025)',  url:'#liste/regional-naturgenuss-erzeuger',  meta:'Übersicht aller Naturgenuss-Partner'},
    {label:'Naturgenuss Broschüre (PDF, 2022)', url:'#liste/regional-naturgenuss-broschuere', meta:'Magazin der Naturgenuss-Initiative'},
    {label:'Naturgenuss Saisonprodukte (PDF)',  url:'#liste/regional-naturgenuss-saisonprodukte', meta:'Saisonale Produkte und Rezepte'}
  ];
  var items = links.map(function(lnk) {
    return '<a class="eintrag" href="' + lnk.url + '">'
      + '<div class="eintrag-text">'
        + '<div class="eintrag-titel">' + escapeHtml(lnk.label) + '</div>'
        + '<div class="eintrag-meta">' + escapeHtml(lnk.meta) + '</div>'
      + '</div>'
      + '<div class="eintrag-pfeil">&rsaquo;</div>'
    + '</a>';
  }).join('');
  ziel.innerHTML =
    '<div class="sticky-region">'
      + navBar(l.zurueck, l.breadcrumb)
      + intro(l.titel, l.untertitel)
    + '</div>'
    + '<div class="liste linklist">' + items + '</div>'
    + '<div class="spacer"></div>';
}

// ════════════════════════════════════════════════════════════════
// BAHN & BUS LINKS (drei Landkreise mit eigenen Fahrplan-iframes)
// Hardcoded statt aus DATA_MOBILITAET_VERKEHR, damit unabhängig von
// externer Datenquelle.
// ════════════════════════════════════════════════════════════════
function renderBahnBusLinks(ziel, slug, l) {
  var links = [
    {label:'Landkreis Altenkirchen', url:'#liste/mobilitaet-bahn-bus-westerwaldbus', meta:'Fahrplanauskunft Westerwaldbus'},
    {label:'Westerwaldkreis',        url:'#liste/mobilitaet-bahn-bus-oepnv-ww',      meta:'Fahrplanauskunft VRM'},
    {label:'Landkreis Neuwied',      url:'#liste/mobilitaet-bahn-bus-vrm',           meta:'Fahrplanauskunft VRM'}
  ];
  var items = links.map(function(lnk) {
    return '<a class="eintrag" href="' + lnk.url + '">'
      + '<div class="eintrag-text">'
        + '<div class="eintrag-titel">' + escapeHtml(lnk.label) + '</div>'
        + '<div class="eintrag-meta">' + escapeHtml(lnk.meta) + '</div>'
      + '</div>'
      + '<div class="eintrag-pfeil">&rsaquo;</div>'
    + '</a>';
  }).join('');
  ziel.innerHTML =
    '<div class="sticky-region">'
      + navBar(l.zurueck, l.breadcrumb)
      + intro(l.titel, l.untertitel)
    + '</div>'
    + '<div class="liste linklist">' + items + '</div>'
    + '<div class="spacer"></div>';
}

// ════════════════════════════════════════════════════════════════
// MITFAHRERBANK-KARTE (Leaflet + OpenStreetMap + Overpass-API)
// Zeigt eine eigene OSM-Karte mit allen in OpenStreetMap erfassten
// Mitfahrerbänken in den Landkreisen Altenkirchen, Neuwied und
// Westerwaldkreis. Daten werden live aus Overpass geladen.
// ════════════════════════════════════════════════════════════════
var LEAFLET_LADEPROMISE = null;
function ladeLeaflet() {
  if (window.L) return Promise.resolve();
  if (LEAFLET_LADEPROMISE) return LEAFLET_LADEPROMISE;
  LEAFLET_LADEPROMISE = new Promise(function(resolve, reject) {
    // CSS einfügen
    if (!document.querySelector('link[data-leaflet]')) {
      var css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      css.setAttribute('data-leaflet', '1');
      document.head.appendChild(css);
    }
    // JS einfügen
    var js = document.createElement('script');
    js.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    js.async = true;
    js.onload = resolve;
    js.onerror = function() { reject(new Error('Leaflet konnte nicht geladen werden')); };
    document.head.appendChild(js);
  });
  return LEAFLET_LADEPROMISE;
}

// ════════════════════════════════════════════════════════════════
// KARTE: Generischer Renderer für GPX-Touren + einzelne Standorte
// Mit Landkreis-Overlay (AK/WW/NR) und optionalem Eigen-Standort.
// ════════════════════════════════════════════════════════════════

// Bounding-Box der drei Landkreise (S, W, N, O) – grob, für Map-Default
var KARTE_BBOX = [50.30, 7.20, 50.95, 8.35];

// In-Memory Cache für Landkreis-GeoJSON (einmal pro Session geholt)
var WW_KREISE_CACHE = null;

// Promise-Cache für zusätzliche Scripts (osmtogeojson für Landkreis-Overlay)
var KARTE_PLUGIN_PROMISE = null;

function ladeScript(url) {
  return new Promise(function(resolve, reject) {
    var s = document.createElement('script');
    s.src = url;
    s.async = true;
    s.onload = resolve;
    s.onerror = function() { reject(new Error('Script konnte nicht geladen werden: ' + url)); };
    document.head.appendChild(s);
  });
}

function ladeKartenPlugins() {
  // Lädt Leaflet + osmtogeojson + leaflet-gpx nacheinander
  if (window.L && window.osmtogeojson && window.L.GPX) return Promise.resolve();
  if (KARTE_PLUGIN_PROMISE) return KARTE_PLUGIN_PROMISE;
  KARTE_PLUGIN_PROMISE = ladeLeaflet().then(function() {
    var pendings = [];
    if (!window.osmtogeojson) {
      pendings.push(ladeScript('https://cdn.jsdelivr.net/npm/osmtogeojson@3.0.0-beta.5/osmtogeojson.min.js'));
    }
    if (!window.L.GPX) {
      pendings.push(ladeScript('https://cdn.jsdelivr.net/npm/leaflet-gpx@1.7.0/gpx.min.js'));
    }
    return Promise.all(pendings);
  });
  return KARTE_PLUGIN_PROMISE;
}

// CDN-Basis für lokale GPX-Dateien aus dem eigenen Repo. Wird nur genutzt,
// wenn ein Mapping existiert (siehe gpx-mapping.js).
var GPX_LOKAL_CDN = 'https://cdn.jsdelivr.net/gh/infostele/infostele2@main/';

// ─── DATEN-LOOKUP (parallel zu renderDetail) ────────────────────
// ─── KOORDINATEN-HELFER ────────────────────────────────────────
// Parst DMS-Strings wie: "N 50° 41' 0.0" | O 8° 18' 11.0""
// Auch tolerant gegenüber unterschiedlichen Quotes, Trennzeichen, Dezimalkomma.
function parseDmsCoordinates(str) {
  if (!str || typeof str !== 'string') return null;

  // Format 1: "N 50° 41' 0.0" | O 8° 18' 11.0"" (Buchstabe VORNE)
  var re1 = /([NSns])\s*(\d+)\s*°\s*(\d+)\s*['′]\s*([\d.,]+)\s*["″]?\s*[|\/,;\s]+\s*([EOWeow])\s*(\d+)\s*°\s*(\d+)\s*['′]\s*([\d.,]+)\s*["″]?/;
  var m = str.match(re1);
  if (m) {
    var lat = parseInt(m[2],10) + parseInt(m[3],10)/60 + parseFloat(m[4].replace(',','.'))/3600;
    var lng = parseInt(m[6],10) + parseInt(m[7],10)/60 + parseFloat(m[8].replace(',','.'))/3600;
    if (m[1].toUpperCase() === 'S') lat = -lat;
    if (m[5].toUpperCase() === 'W') lng = -lng;
    return { lat: lat, lng: lng };
  }

  // Format 2: "50°41'0.0"N 8°18'11.0"E" (Buchstabe HINTEN)
  var re2 = /(\d+)\s*°\s*(\d+)\s*['′]\s*([\d.,]+)\s*["″]?\s*([NSns])\s*[,;\/\s]+\s*(\d+)\s*°\s*(\d+)\s*['′]\s*([\d.,]+)\s*["″]?\s*([EOWeow])/;
  m = str.match(re2);
  if (m) {
    var lat2 = parseInt(m[1],10) + parseInt(m[2],10)/60 + parseFloat(m[3].replace(',','.'))/3600;
    var lng2 = parseInt(m[5],10) + parseInt(m[6],10)/60 + parseFloat(m[7].replace(',','.'))/3600;
    if (m[4].toUpperCase() === 'S') lat2 = -lat2;
    if (m[8].toUpperCase() === 'W') lng2 = -lng2;
    return { lat: lat2, lng: lng2 };
  }

  // Format 3: Dezimalgrad "50.123456, 7.456789"
  var re3 = /(-?\d{1,2}[.,]\d{3,})\s*[,;\s]+\s*(-?\d{1,2}[.,]\d{3,})/;
  m = str.match(re3);
  if (m) {
    var lat3 = parseFloat(m[1].replace(',','.'));
    var lng3 = parseFloat(m[2].replace(',','.'));
    // Plausibilitätscheck: Deutschland ungefähr lat 47-55, lng 5-15
    if (lat3 > 45 && lat3 < 56 && lng3 > 4 && lng3 < 16) {
      return { lat: lat3, lng: lng3 };
    }
  }

  return null;
}

// Baut die beste verfügbare Geocoding-Adresse aus einem Item, je nach Typ.
// Baut Popup-HTML für Marker: Titel + Straße + PLZ/Ort (jeweils eigene Zeile)
function popupAdresse(item) {
  var titel = item.titel || item.name || item.title || '';
  var strasse = '';
  var plzOrt = '';

  if (item.strasse) strasse = item.strasse;
  else if (item.adresse) strasse = item.adresse;
  else if (item.address) strasse = item.address;
  else if (item.contact && item.contact.street) strasse = item.contact.street;

  if (item.plz && item.ort) plzOrt = item.plz + ' ' + item.ort;
  else if (item.plzOrt) plzOrt = item.plzOrt;
  else if (item.ort && !strasse) plzOrt = item.ort;
  else if (item.contact) {
    var p = [];
    if (item.contact.zip)  p.push(item.contact.zip);
    if (item.contact.town) p.push(item.contact.town);
    plzOrt = p.join(' ');
  }

  // Manche Daten haben "Straße, PLZ Ort" in einem String — aufsplitten
  if (strasse && /,\s*\d{5}\s/.test(strasse) && !plzOrt) {
    var parts = strasse.split(/,\s*/);
    strasse = parts[0];
    plzOrt = parts.slice(1).join(', ');
  }

  var html = '<strong>' + escapeHtml(titel) + '</strong>';
  if (strasse) html += '<br>' + escapeHtml(strasse);
  if (plzOrt)  html += '<br>' + escapeHtml(plzOrt);
  return html;
}

// Wenn das Straßen-Feld mehrere Komma-getrennte Teile enthält wie
// "vor dem Regionalladen UNIKUM, Bahnhofstraße 26", findet diese Funktion
// den TEIL, der tatsächlich eine Straßen-Adresse ist (Hausnummer am Ende
// oder typisches Straßen-Suffix wie -straße/-weg/-platz). Wichtig für das
// Geocoding via Nominatim, das sonst auf die Place-Beschreibung reinfällt.
function extrahiereStrasse(rohStrasse) {
  if (!rohStrasse || rohStrasse.indexOf(',') < 0) return rohStrasse;
  var parts = rohStrasse.split(',').map(function(p) { return p.trim(); });
  // PLZ + Ort-Teile (z. B. "57562 Herdorf") rausfiltern, die gehören nicht in die Straße
  parts = parts.filter(function(p) { return !/^\d{5}\s/.test(p); });
  if (parts.length === 0) return rohStrasse;
  if (parts.length === 1) return parts[0];

  // Bevorzuge Teil mit Hausnummer am Ende ("Bahnhofstraße 26", "Auf der Bell 5")
  for (var i = 0; i < parts.length; i++) {
    if (/\s\d+[a-z]?$/i.test(parts[i])) return parts[i];
  }
  // Bevorzuge Teil mit typischem Straßen-Suffix
  for (var j = 0; j < parts.length; j++) {
    if (/(straße|str\.|weg|platz|allee|gasse|ring|markt|ufer|damm|chaussee|hof)\b/i.test(parts[j])) {
      return parts[j];
    }
  }
  // Sonst: ersten Teil (häufigster Fall: das ist die Straße)
  return parts[0];
}

function baueAdresseFuerGeocoding(item, typ) {
  if (!item) return null;
  var strasseRoh = '';
  var ortTeil = '';

  // Strukturierte Felder (Badesee, Veranstaltung aus Excel)
  if (item.strasse) strasseRoh = item.strasse;
  else if (item.adresse) strasseRoh = item.adresse;
  else if (item.address) strasseRoh = item.address;
  else if (item.contact && item.contact.street) strasseRoh = item.contact.street;

  // PLZ + Ort
  if (item.plz && item.ort) ortTeil = item.plz + ' ' + item.ort;
  else if (item.plzOrt) ortTeil = item.plzOrt;
  else if (item.ort) ortTeil = item.ort;
  else if (item.town) ortTeil = item.town;
  else if (item.contact) {
    var p = []; if (item.contact.zip) p.push(item.contact.zip); if (item.contact.town) p.push(item.contact.town);
    ortTeil = p.join(' ');
  }

  // Echte Straße aus möglicherweise mehrteiliger Rohadresse extrahieren
  var strasse = extrahiereStrasse(strasseRoh);

  // Wenn ortTeil leer ist aber strasseRoh PLZ-Teile enthält:
  // PLZ aus strasseRoh extrahieren (z. B. "Marktplatz, 35745 Herborn" → ortTeil = "35745 Herborn")
  if (!ortTeil && strasseRoh && strasseRoh.indexOf(',') >= 0) {
    var teile = strasseRoh.split(',').map(function(p){ return p.trim(); });
    for (var ti = 0; ti < teile.length; ti++) {
      if (/^\d{5}\s/.test(teile[ti])) { ortTeil = teile[ti]; break; }
    }
  }

  // Wenn die extrahierte Straße schon PLZ enthält, ist sie bereits komplett
  if (strasse && /\d{5}\s+/.test(strasse) && !ortTeil) return strasse.trim();

  var parts = [];
  if (strasse) parts.push(strasse);
  if (ortTeil && (!strasse || strasse.indexOf(ortTeil) < 0)) parts.push(ortTeil);
  if (!parts.length) return null;
  return parts.join(', ');
}

// Geocoding via Nominatim mit localStorage-Cache.
// Hinweis: Nominatim erlaubt 1 Request/Sekunde – für eine Regional-App mehr
// als ausreichend, vor allem mit Cache (jede Adresse wird nur einmal gefragt).
function geocodeAdresse(adresse) {
  if (!adresse) return Promise.resolve(null);
  var key = 'wwgeo:' + adresse.toLowerCase().trim();
  try {
    var cached = localStorage.getItem(key);
    if (cached) return Promise.resolve(JSON.parse(cached));
  } catch (e) {}

  // Suche eingrenzen auf Deutschland für bessere Treffer
  var url = 'https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=de&accept-language=de&q='
    + encodeURIComponent(adresse);
  return fetch(url, { headers: { 'Accept-Language': 'de' } })
    .then(function(r) { return r.ok ? r.json() : null; })
    .then(function(arr) {
      if (!arr || !arr.length) return null;
      var result = { lat: parseFloat(arr[0].lat), lng: parseFloat(arr[0].lon) };
      try { localStorage.setItem(key, JSON.stringify(result)); } catch (e) {}
      return result;
    })
    .catch(function() { return null; });
}

// Findet Koordinaten für ein Item durch Fallback-Kette:
//   1. item.lat/lng (numerisch)
//   2. DMS-Koordinaten aus item.start.coordinates / item.coordinates
//   3. Geocoding der Adresse via Nominatim (gecacht)
// Prüft, ob die Straßen-Komponente einer Adresse eine Hausnummer enthält.
//   "Auf der Bell, 57562 Herdorf"  → false
//   "Walzwerkstraße 22, 57537 …"   → true
function hatHausnummer(adresse) {
  if (!adresse) return false;
  var strassenTeil = adresse.split(',')[0].trim();
  // Erkennt einzelne Hausnummern (22, 22a) und Bereiche (1-3, 1/3, 22a-24b)
  return /\s\d+[a-z]?(?:[-\/]\d+[a-z]?)?\s*$/i.test(strassenTeil);
}

// Setzt eine Hausnummer in eine Adresse OHNE Nummer ein.
//   "Auf der Bell, 57562 Herdorf" + "1"  →  "Auf der Bell 1, 57562 Herdorf"
function fuegeHausnummerEin(adresse, nummer) {
  var parts = adresse.split(',');
  parts[0] = parts[0].trim() + ' ' + nummer;
  return parts.join(',').trim();
}

// Erstellt eine geordnete Liste von Adress-Varianten zum Probieren.
// Reihenfolge: präzise → weniger präzise. Sobald eine Variante geocoded wird,
// stoppt die Kette. So landen wir z. B. bei "Auf der Bell 1, 57562 Herdorf"
// (Bergbaumuseum) statt bei "57562 Herdorf" (Ortsmitte) zu enden.
function baueAdressKandidaten(item, typ, opts) {
  opts = opts || {};
  // strikt=true: KEINE PLZ+Ort/Ort-Fallbacks (lieber leer als ungenau)
  // strikt=false: PLZ+Ort und Ort als Notfall-Fallback (für Routen-Marker)
  var strikt = (opts.strikt !== false);

  var basis = baueAdresseFuerGeocoding(item, typ);
  var kandidaten = [];

  if (basis) {
    // Hausnummer-Bereiche ("1-3", "22a-24") erkennen: nur ERSTE Nummer
    // verwenden (User-Vorgabe: zweite Nummer ergibt oft falsche Position).
    var rangeMatch = basis.match(/(\d+)([a-z]?)[-\/](\d+)([a-z]?)/i);
    if (rangeMatch) {
      var num1 = rangeMatch[1] + (rangeMatch[2] || '');
      kandidaten.push(basis.replace(rangeMatch[0], num1));
    } else {
      kandidaten.push(basis);
      // Wenn keine Hausnummer in der Straße: mit 1 und 2 erweitern
      if (!hatHausnummer(basis)) {
        kandidaten.push(fuegeHausnummerEin(basis, '1'));
        kandidaten.push(fuegeHausnummerEin(basis, '2'));
      }
    }
  }

  // Im strikten Modus (Punkt-Items wie Veranstaltungen, Museen, Badeseen)
  // KEINE Ort-Fallbacks anhängen – sonst landen wir bei verfehlten Adressen
  // auf der Ortsmitte (Hallenbad etc.). Lieber gar keine Karte als falsche.
  if (!strikt) {
    var plzOrt = '';
    if (item.plz && item.ort) plzOrt = item.plz + ' ' + item.ort;
    else if (item.plzOrt) plzOrt = item.plzOrt;
    else if (basis) {
      var m = basis.match(/(\d{5}\s+[A-Za-zäöüÄÖÜß\-\s]+)/);
      if (m) plzOrt = m[1].trim();
    }
    if (plzOrt && kandidaten.indexOf(plzOrt) < 0) kandidaten.push(plzOrt);

    var ortAllein = item.ort || (item.contact && item.contact.town) || item.town || '';
    if (ortAllein && kandidaten.indexOf(ortAllein) < 0) kandidaten.push(ortAllein);
  }

  return kandidaten;
}

// Probiert nacheinander alle Adress-Varianten, gibt das erste Ergebnis zurück
function probiereAdressen(kandidaten, idx) {
  idx = idx || 0;
  if (idx >= kandidaten.length) return Promise.resolve(null);
  return geocodeAdresse(kandidaten[idx]).then(function(c) {
    if (c) return c;
    return probiereAdressen(kandidaten, idx + 1);
  });
}

function findeKoordinaten(item, typ) {
  var titel = item.titel || item.name || item.title || '(unbenannt)';
  // 1. Direkt
  var lat = parseFloat(item.lat); var lng = parseFloat(item.lng);
  if (!isNaN(lat) && !isNaN(lng)) return Promise.resolve({ lat: lat, lng: lng });

  // 2. DMS aus div. Feldern
  var dms = null;
  if (item.coordinates) dms = parseDmsCoordinates(item.coordinates);
  if (!dms && item.start && typeof item.start === 'object' && item.start.coordinates) {
    dms = parseDmsCoordinates(item.start.coordinates);
  }
  if (dms) return Promise.resolve(dms);

  // 3. Adress-Kandidaten der Reihe nach probieren – STRIKT (keine Ort-Fallbacks).
  // Lieber kein Marker als ein Marker auf der Ortsmitte.
  var kandidaten = baueAdressKandidaten(item, typ, { strikt: true });
  if (!kandidaten.length) {
    console.warn('[Karte] Keine geocodierbaren Daten für:', titel);
    return Promise.resolve(null);
  }
  return probiereAdressen(kandidaten, 0).then(function(c) {
    if (!c) {
      console.warn('[Karte] Geocoding ohne Treffer für "' + titel + '". Probierte Kandidaten:', kandidaten);
    }
    return c;
  });
}

// Findet die Start- bzw. Zielkoordinate einer Wander-/Rad-Etappe.
// Für Routen-Marker erlauben wir den weicheren Modus (PLZ+Ort/Ort-Fallback),
// damit zumindest die ungefähre Region eingezeichnet wird, falls die exakte
// Adresse nicht erfasst ist.
function findeRoutenPunkte(item) {
  var titel = item.title || item.name || item.titel || '(Etappe)';

  function einPunkt(obj, rolle) {
    if (!obj) return Promise.resolve(null);
    // DMS-Koordinaten haben Priorität
    if (typeof obj === 'object' && obj.coordinates) {
      var d = parseDmsCoordinates(obj.coordinates);
      if (d) return Promise.resolve(d);
      console.warn('[Karte] ' + rolle + '-Koordinaten konnten nicht geparst werden für "' + titel + '":', obj.coordinates);
    }
    // Adresse normalisieren
    var adresseRoh = '';
    if (typeof obj === 'object') {
      adresseRoh = obj.address || obj.name || '';
    } else if (typeof obj === 'string') {
      adresseRoh = obj;
    }
    if (!adresseRoh) {
      console.warn('[Karte] Kein ' + rolle + ' für "' + titel + '" vorhanden.');
      return Promise.resolve(null);
    }
    var pseudoItem = { adresse: adresseRoh };
    // Bei Routen-Markern: weicher Modus (PLZ+Ort als Fallback OK)
    var kandidaten = baueAdressKandidaten(pseudoItem, 'route', { strikt: false });
    if (!kandidaten.length) return Promise.resolve(null);
    return probiereAdressen(kandidaten, 0).then(function(c) {
      if (!c) {
        console.warn('[Karte] ' + rolle + '-Geocoding fehlgeschlagen für "' + titel + '". Kandidaten:', kandidaten);
      }
      return c;
    });
  }
  return Promise.all([einPunkt(item.start, 'Start'), einPunkt(item.destination, 'Ziel')]).then(function(arr) {
    return { start: arr[0], ziel: arr[1] };
  });
}

// Generische Prüfung: Hat das Item überhaupt Daten, die wir verorten könnten?
// Prüft, ob das Item Daten hat, die einen "ansatzweise korrekten" Standort
// auf der Karte ermöglichen. Verlangt:
//   - Direkte Koordinaten (lat/lng oder DMS), ODER
//   - GPX-Track, ODER
//   - Eine Adresse mit Straßenanteil (NICHT nur Ort/PLZ)
// Wenn nur ein Ortsname vorhanden wäre, würde Geocoding nur die Ortsmitte
// liefern – das ist nicht ausreichend genau, deshalb dann kein Karte-Button.
function hatVerortbareInfo(item) {
  if (!item) return false;
  if (item.lat && item.lng) return true;
  if (item.coordinates && parseDmsCoordinates(item.coordinates)) return true;
  if (item.start && item.start.coordinates && parseDmsCoordinates(item.start.coordinates)) return true;
  if (item.gpxUrl) return true;

  // Straßen-Felder einsammeln
  var strasse = item.strasse || item.adresse || item.address ||
                (item.contact && item.contact.street) ||
                (item.start && (item.start.address || item.start.name));
  if (!strasse) return false;

  // Heuristik: Ist das wirklich eine Straße oder nur ein Ortsname?
  // Akzeptiert wenn:
  //   - enthält Zahlen (z. B. Hausnummer), ODER
  //   - typisches Straßen-Suffix (-straße, -weg, -platz, ...), ODER
  //   - mehrere Wörter (z. B. "Auf der Bell" — echte Straßen ohne Suffix)
  var extrahiert = (typeof extrahiereStrasse === 'function') ? extrahiereStrasse(strasse) : strasse;
  if (!extrahiert) return false;
  var trimmed = extrahiert.trim();
  var hatZahl = /\d/.test(trimmed);
  var hatSuffix = /(straße|str\.|weg|platz|allee|gasse|ring|markt|ufer|damm|chaussee|hof|brücke|tor|park)\b/i.test(trimmed);
  var hatMehrereWoerter = /\s/.test(trimmed);
  return hatZahl || hatSuffix || hatMehrereWoerter;
}

// ════════════════════════════════════════════════════════════════
// KARTEN-OVERRIDES für Routen, deren Adressen in den Quelldaten zu
// falschen Geocoding-Treffern führen (z. B. "Steinebach" landet beim
// Steinebach in Hessen statt Steinebach an der Sieg).
// Schlüssel: Substring, der im Tour-/Etappentitel ODER Routen-Slug enthalten
// sein muss (Vergleich case-insensitiv). Erster Treffer gewinnt.
// Werte als Adress-Strings ("Stöffelstraße, 57647 Enspel") oder direkte
// Koordinaten ({lat:..., lng:...}) – beides erlaubt.
// ════════════════════════════════════════════════════════════════
var KARTEN_OVERRIDES = [
  // ─── Druidensteig ───────────────────────────────────────────────
  { match: { typ: 'wandern', slug: 'druidensteig', etappe: 5 }, // 6. Etappe (0-indexed)
    ziel:  '57589 Steinebach an der Sieg' },
  { match: { typ: 'wandern', slug: 'druidensteig', etappe: 6 }, // 7. Etappe
    start: '57589 Steinebach an der Sieg' },

  // ─── Wiedweg ────────────────────────────────────────────────────
  { match: { typ: 'wandern', slug: 'wiedweg', etappe: 0 },
    start: 'Linden, 57629 Westerburg',
    ziel:  'Linden, 57629 Westerburg' },
  { match: { typ: 'wandern', slug: 'wiedweg', etappe: 1 },
    start: 'Linden, 57629 Westerburg' },

  // ─── Wäller Routen / Wäller Touren ──────────────────────────────
  { match: { titelEnthaelt: ['stöffel', 'stoeffel'] },
    start: 'Stöffelstraße, 57647 Enspel' },
  { match: { titelEnthaelt: ['nauort'] },
    start: { lat: 50.467114, lng: 7.619140 } },
  { match: { titelEnthaelt: ['bärenkopp', 'baerenkopp'] },
    start: 'Marktstraße, 56588 Waldbreitbach' },
  { match: { titelEnthaelt: ['klosterweg'] },
    start: 'Friedrich-Ebert-Straße, 56579 Rengsdorf' },
  { match: { titelEnthaelt: ['iserbachschleife', 'iserbach'] },
    start: 'Auf dem Löh 2, 56584 Anhausen' },
  { match: { titelEnthaelt: ['brexbachschluchtweg', 'brexbachschlucht'] },
    start: 'Burgstraße 7, 56203 Höhr-Grenzhausen' },
  { match: { titelEnthaelt: ['augst'] },
    start: { lat: 50.39064, lng: 7.72018 },
    ziel:  { lat: 50.52887, lng: 7.96737 } },
  { match: { titelEnthaelt: ['elbertshöhen', 'elbertshoehen'] },
    start: { lat: 50.41045, lng: 7.81216 } },
  { match: { titelEnthaelt: ['buchfinkenland'] },
    start: { lat: 50.367250, lng: 7.854216 } },
  { match: { titelEnthaelt: ['watzenhahn'] },
    start: { lat: 50.52887, lng: 7.96737 } },
  { match: { titelEnthaelt: ['hohe hahnscheid', 'hahnscheid'] },
    start: 'Kirchstraße 11, 56479 Irmtraut' },
  { match: { titelEnthaelt: ['greifenstein schleife etappe 2', 'greifenstein-schleife-etappe-2'] },
    start: { lat: 50.58552, lng: 8.24354 } },
  { match: { titelEnthaelt: ['greifenstein schleife', 'greifenstein-schleife'] },
    start: { lat: 50.67576, lng: 8.29388 } },

  // ─── Kleiner Wäller (Rundwege: Start = Ziel) ───────────────────
  { match: { titelEnthaelt: ['wied-runde', 'wied runde'] },
    start: { lat: 50.55198, lng: 7.42065 },
    ziel:  { lat: 50.55198, lng: 7.42065 } },
  { match: { titelEnthaelt: ['malbergseeblick', 'malberg-seeblick', 'malberg seeblick'] },
    start: { lat: 50.56306, lng: 7.39167 },
    ziel:  { lat: 50.56306, lng: 7.39167 } },
  { match: { titelEnthaelt: ['zwergenweg 2', 'zwergenweg2'] },
    start: { lat: 50.50550, lng: 7.49350 },
    ziel:  { lat: 50.50550, lng: 7.49350 } },
  { match: { titelEnthaelt: ['basalt + wasser', 'basalt und wasser', 'basalt & wasser'] },
    start: { lat: 50.57945, lng: 8.24921 },
    ziel:  { lat: 50.57945, lng: 8.24921 } },
  { match: { titelEnthaelt: ['sagenweg'] },
    start: { lat: 50.68686, lng: 7.51334 },
    ziel:  { lat: 50.68686, lng: 7.51334 } },
  { match: { titelEnthaelt: ['klangpfad'] },
    start: 'Walter-Bartels-Weg, 57632 Rott',
    ziel:  'Walter-Bartels-Weg, 57632 Rott' },

  // ─── Kleiner Wäller – weitere Tranche ──────────────────────────
  { match: { titelEnthaelt: ['kunst + natur', 'kunst und natur', 'kunst & natur'] },
    start: 'Märchenpark 1, 35753 Greifenstein',
    ziel:  'Märchenpark 1, 35753 Greifenstein' },
  { match: { titelEnthaelt: ['wolfsteine'] },
    start: 'Wildparkstraße 15, 56470 Bad Marienberg',
    ziel:  'Wildparkstraße 15, 56470 Bad Marienberg' },
  { match: { titelEnthaelt: ['weg der sinne'] },
    start: { lat: 50.723441, lng: 7.532203 },
    ziel:  { lat: 50.723441, lng: 7.532203 } },
  { match: { titelEnthaelt: ['vitalparcours'] },
    start: 'Wanderparkplatz Hardert, K104, 56599 Hardert',
    ziel:  'Wanderparkplatz Hardert, K104, 56599 Hardert' },
  { match: { titelEnthaelt: ['georoute glasstadt', 'georoute-glasstadt', 'glasstadt wirges'] },
    start: 'Montchaninplatz 1, 56422 Wirges',
    ziel:  'Montchaninplatz 1, 56422 Wirges' }
];

// Liefert {start, ziel} aus den Overrides – oder null falls kein Match.
// Beide Felder können String (Adresse) oder Coords-Objekt {lat,lng} sein,
// oder undefined falls Override nur eine Seite überschreibt.
function findeKartenOverride(typ, listeSlug, etappenIdx, item) {
  var titel = (item && (item.title || item.name || item.titel) || '').toLowerCase();
  var slugLower = (listeSlug || '').toLowerCase();
  for (var i = 0; i < KARTEN_OVERRIDES.length; i++) {
    var rule = KARTEN_OVERRIDES[i];
    var m = rule.match || {};
    // typ + slug + etappe (präzise)
    if (m.typ && m.slug !== undefined && m.etappe !== undefined) {
      if (m.typ === typ && slugLower.indexOf(m.slug) >= 0 && m.etappe === etappenIdx) {
        return rule;
      }
      continue;
    }
    // titelEnthaelt (flexibel über Substring im Etappentitel)
    if (m.titelEnthaelt) {
      var arr = Array.isArray(m.titelEnthaelt) ? m.titelEnthaelt : [m.titelEnthaelt];
      for (var j = 0; j < arr.length; j++) {
        if (titel.indexOf(String(arr[j]).toLowerCase()) >= 0) return rule;
      }
    }
  }
  return null;
}

// Wandelt einen Override-Wert (String oder Coords) in ein Promise<{lat,lng}> um.
function aufloeseOverrideWert(wert) {
  if (!wert) return Promise.resolve(null);
  if (typeof wert === 'object' && typeof wert.lat === 'number') {
    return Promise.resolve({ lat: wert.lat, lng: wert.lng });
  }
  if (typeof wert === 'string') {
    // Ist es eine DMS- oder Dezimal-Koordinate als String?
    var dms = parseDmsCoordinates(wert);
    if (dms) return Promise.resolve(dms);
    return geocodeAdresse(wert);
  }
  return Promise.resolve(null);
}

function ladeKartenItem(typ, schluessel) {
  // Liefert { item, info, zurueck } oder null
  if (typ === 'wwbox') {
    var bIdx = parseInt(schluessel, 10);
    var bData = window.DATA_WESTERWALDBOX_BETRIEBE || [];
    if (!bData[bIdx]) return null;
    return { item: bData[bIdx], info: { titel: bData[bIdx].name, breadcrumb: 'Karte' }, zurueck: 'detail/wwbox/' + bIdx };
  }
  var teile = schluessel.split('_');
  var listeSlug = teile.slice(0, -1).join('_');
  var idx = parseInt(teile[teile.length - 1], 10);
  var info = null, daten = null, zurueck = 'home';
  if (typ === 'wandern') {
    var sub = listeSlug.split('-').slice(2).join('-');
    info = WANDER_DATEN[sub]; daten = info && window[info.name];
    zurueck = 'detail/wandern/' + schluessel;
  } else if (typ === 'rad') {
    var sub = listeSlug.split('-').slice(2).join('-');
    info = RAD_DATEN[sub]; daten = info && window[info.name];
    zurueck = 'detail/rad/' + schluessel;
  } else {
    var ll = LISTEN[listeSlug];
    if (ll) {
      info = { breadcrumb: ll.breadcrumb, titel: ll.titel };
      daten = window[ll.datenName];
      zurueck = 'detail/' + typ + '/' + schluessel;
    }
  }
  if (!daten || !daten[idx]) return null;
  return { item: daten[idx], info: info, zurueck: zurueck };
}

// ─── HAUPT-RENDERER ─────────────────────────────────────────────
function renderKarte(ziel, typ, schluessel) {
  var ctx = ladeKartenItem(typ, schluessel);
  if (!ctx) {
    ziel.innerHTML = navBar('home','') + intro('Nicht gefunden','') + '<div class="hinweis">Eintrag nicht verfügbar.</div>';
    return;
  }
  var item = ctx.item;
  var titel = item.titel || item.name || item.title || 'Karte';

  // Listen-Slug und Etappenindex aus dem Schlüssel extrahieren
  // Format: "tourismus-wandern-druidensteig_5"  → listeSlug="tourismus-wandern-druidensteig", idx=5
  var teile = schluessel.split('_');
  var listeSlug = teile.slice(0, -1).join('_');
  var etappenIdx = parseInt(teile[teile.length - 1], 10);

  // Override für diese Etappe? (Korrekturen für falsche Adress-Treffer)
  var override = (typ === 'wandern' || typ === 'rad')
    ? findeKartenOverride(typ, listeSlug, etappenIdx, item)
    : null;

  // Karten-Modus bestimmen
  var hatGpx = false;
  var gpxUrl = null;
  var gpxLokalPfad = null;

  if (typ === 'wandern' || typ === 'rad') {
    gpxUrl = item.gpxUrl || (typeof gpxAusTourenplaner === 'function' ? gpxAusTourenplaner(item.tourenplanerUrl || item.tourenplaner) : null);
    if (gpxUrl) hatGpx = true;
    // Lokale GPX-Datei aus eigenem Repo? (falls gpx-mapping.js geladen ist)
    if (typeof findeGpxDateinameLokal === 'function') {
      // Slug-Mapping: WANDER_DATEN/RAD_DATEN-Slug zum Mapping-Schlüssel umwandeln.
      // listeSlug ist z. B. "tourismus-wandern-druidensteig" – wir brauchen
      // den hinteren Teil ("druidensteig") als Gruppe.
      var gruppeSlug = listeSlug.replace(/^tourismus-(wandern|radfahren)-/, '').replace(/^tourismus-rad-/, '');
      gpxLokalPfad = findeGpxDateinameLokal(typ, gruppeSlug, etappenIdx);
      if (gpxLokalPfad) hatGpx = true;
    }
  }

  // Bei Wandern/Rad ohne GPX, aber MIT Override oder vorhandenen Start/Ziel-Daten
  // → trotzdem im Routen-Modus (Start/Ziel-Marker) anzeigen
  var hatRouteOhneGpx = false;
  if (!hatGpx && (typ === 'wandern' || typ === 'rad') &&
      (override || item.start || item.destination)) {
    hatRouteOhneGpx = true;
  }

  var mapId = 'karte-' + Math.random().toString(36).slice(2);
  ziel.innerHTML =
    '<div class="sticky-region">'
      + navBar(ctx.zurueck, ctx.info.breadcrumb + ' › <strong>Karte</strong>')
      + intro(titel, '')
    + '</div>'
    + '<div class="karte-wrap">'
      + '<div id="' + mapId + '" class="karte-leaflet"></div>'
      + '<div class="karte-lade-hinweis" id="' + mapId + '-lade">Karte wird geladen …</div>'
    + '</div>'
    + '<div class="karte-meta">'
      + (gpxLokalPfad ? '<p>Tour-Verlauf · GPX aus eigenem Datenbestand · Kartendaten: © OpenStreetMap-Mitwirkende</p>'
                      : hatGpx ? '<p>Tour-Verlauf · GPX-Daten: Tourenplaner Rheinland-Pfalz · Kartendaten: © OpenStreetMap-Mitwirkende</p>'
                               : '<p>Kartendaten: © OpenStreetMap-Mitwirkende. Adress-Suche: Nominatim / OSM.</p>')
    + '</div>'
    + '<div class="spacer"></div>';

  ladeKartenPlugins().then(function() {
    if (hatGpx || hatRouteOhneGpx) {
      // Vorab Start/Ziel parallel geocoden. Override-Werte haben Vorrang vor
      // dem Daten-basierten Geocoding (für bekannte Problemfälle).
      var startPromise = override && override.start
        ? aufloeseOverrideWert(override.start)
        : null;
      var zielPromise  = override && override.ziel
        ? aufloeseOverrideWert(override.ziel)
        : null;

      Promise.all([
        startPromise || Promise.resolve(null),
        zielPromise  || Promise.resolve(null),
        findeRoutenPunkte(item)
      ]).then(function(arr) {
        var oStart = arr[0], oZiel = arr[1], pts = arr[2];
        initWesterwaldKarte(mapId, {
          modus: 'gpx',
          gpxUrl: gpxUrl,
          gpxLokalUrl: gpxLokalPfad ? (GPX_LOKAL_CDN + gpxLokalPfad) : null,
          label: titel,
          popupHtml: popupAdresse(item),
          startPunkt: oStart || pts.start,
          zielPunkt:  oZiel  || pts.ziel
        });
      });
    } else {
      // Punkt-Modus: Koordinaten asynchron auflösen (lat/lng → DMS → Geocoding)
      findeKoordinaten(item, typ).then(function(coords) {
        if (!coords) {
          var ladeEl = document.getElementById(mapId + '-lade');
          if (ladeEl) ladeEl.innerHTML = 'Für diesen Eintrag konnte kein Standort ermittelt werden.';
          initWesterwaldKarte(mapId, { modus: 'leer', label: titel });
          return;
        }
        initWesterwaldKarte(mapId, {
          modus: 'punkt', lat: coords.lat, lng: coords.lng,
          label: titel, popupHtml: popupAdresse(item)
        });
      });
    }
  }).catch(function() {
    var ladeEl = document.getElementById(mapId + '-lade');
    if (ladeEl) ladeEl.innerHTML = 'Karte konnte nicht geladen werden.';
  });
}

// ─── MAP-INITIALISIERUNG ───────────────────────────────────────
function initWesterwaldKarte(mapId, opts) {
  var mapEl = document.getElementById(mapId);
  if (!mapEl || !window.L) return;
  var map = L.map(mapId, {
    center: [(KARTE_BBOX[0]+KARTE_BBOX[2])/2, (KARTE_BBOX[1]+KARTE_BBOX[3])/2],
    zoom: 10,
    scrollWheelZoom: false
  });
  // Scroll-Wheel-Zoom aktivieren wenn Karte angeklickt wird (Konflikt mit Seiten-Scroll vermeiden)
  map.on('focus', function() { map.scrollWheelZoom.enable(); });
  map.on('blur',  function() { map.scrollWheelZoom.disable(); });
  map.getContainer().addEventListener('click', function() { map.scrollWheelZoom.enable(); });

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
    maxZoom: 18
  }).addTo(map);

  // 1. Landkreis-Grenzen als Overlay laden (asynchron, blockiert nichts)
  ladeKreisGrenzen(map);

  // 2. Inhalt anzeigen (GPX oder Punkt oder leer)
  var ladeEl = document.getElementById(mapId + '-lade');

  // Helfer: Start- und Ziel-Marker zeichnen (für Wandern/Rad als Fallback,
  // wenn GPX nicht lädt, oder als Ergänzung wenn beides vorhanden ist)
  function zeichneStartZiel() {
    // Prüfe ob Start und Ziel identisch sind (Rundweg) – dann nur EIN Marker
    var istRundweg = opts.startPunkt && opts.zielPunkt &&
      Math.abs(opts.startPunkt.lat - opts.zielPunkt.lat) < 0.0001 &&
      Math.abs(opts.startPunkt.lng - opts.zielPunkt.lng) < 0.0001;

    if (istRundweg) {
      L.marker([opts.startPunkt.lat, opts.startPunkt.lng], {
        icon: L.divIcon({
          className: 'marker-start-ziel marker-start',
          html: '<span>S</span>',
          iconSize: [28, 28]
        })
      }).addTo(map)
        .bindTooltip('Start / Ziel', { permanent: true, direction: 'right', offset: [16, 0], className: 'marker-label marker-label-start' })
        .openTooltip();
      map.setView([opts.startPunkt.lat, opts.startPunkt.lng], 13);
      return 1;
    }

    var pts = [];
    if (opts.startPunkt) {
      L.marker([opts.startPunkt.lat, opts.startPunkt.lng], {
        icon: L.divIcon({
          className: 'marker-start-ziel marker-start',
          html: '<span>S</span>',
          iconSize: [28, 28]
        })
      }).addTo(map)
        .bindTooltip('Start', { permanent: true, direction: 'right', offset: [16, 0], className: 'marker-label marker-label-start' })
        .openTooltip();
      pts.push([opts.startPunkt.lat, opts.startPunkt.lng]);
    }
    if (opts.zielPunkt) {
      L.marker([opts.zielPunkt.lat, opts.zielPunkt.lng], {
        icon: L.divIcon({
          className: 'marker-start-ziel marker-ziel',
          html: '<span>Z</span>',
          iconSize: [28, 28]
        })
      }).addTo(map)
        .bindTooltip('Ziel', { permanent: true, direction: 'right', offset: [16, 0], className: 'marker-label marker-label-ziel' })
        .openTooltip();
      pts.push([opts.zielPunkt.lat, opts.zielPunkt.lng]);
    }
    if (pts.length === 1) {
      map.setView(pts[0], 13);
    } else if (pts.length === 2) {
      L.polyline(pts, { color: '#888', weight: 2, dashArray: '6,8', opacity: 0.7 }).addTo(map);
      map.fitBounds(pts, { padding: [30, 30] });
    }
    return pts.length;
  }

  if (opts.modus === 'gpx') {
    // Sofort Start/Ziel anzeigen (aus Geocoding)
    var n = zeichneStartZiel();
    if (n > 0) {
      if (ladeEl) ladeEl.style.display = 'none';
    } else {
      if (ladeEl) ladeEl.innerHTML = 'Start/Ziel konnten nicht ermittelt werden.';
    }

    // Wenn lokale GPX-URL vorhanden: Track aus dem eigenen Repo laden und zeichnen
    if (opts.gpxLokalUrl && window.L && window.L.GPX) {
      try {
        new L.GPX(opts.gpxLokalUrl, {
          async: true,
          // Eigene Start/Ziel-Marker ausblenden, weil wir die selbst gesetzt haben
          marker_options: {
            startIconUrl: '',
            endIconUrl: '',
            shadowUrl: ''
          },
          polyline_options: { color: '#0b422a', weight: 4, opacity: 0.85 }
        })
        .on('loaded', function(e) {
          try { map.fitBounds(e.target.getBounds(), { padding: [30, 30] }); } catch (err) {}
        })
        .on('error', function(err) {
          console.warn('[Karte] GPX-Track konnte nicht geladen werden:', opts.gpxLokalUrl, err);
        })
        .addTo(map);
      } catch (e) {
        console.warn('[Karte] GPX-Track Fehler:', e);
      }
    }

    // Legende oben rechts: Start (grün), Ziel (rot) - bei Rundwegen nur "Start/Ziel"
    var istRundwegLeg = opts.startPunkt && opts.zielPunkt &&
      Math.abs(opts.startPunkt.lat - opts.zielPunkt.lat) < 0.0001 &&
      Math.abs(opts.startPunkt.lng - opts.zielPunkt.lng) < 0.0001;
    var legende = L.control({ position: 'topright' });
    legende.onAdd = function() {
      var div = L.DomUtil.create('div', 'karte-legende');
      var html = '';
      if (istRundwegLeg) {
        html += '<div class="legende-zeile"><span class="legende-punkt punkt-start"></span> Start / Ziel</div>';
      } else {
        html += '<div class="legende-zeile"><span class="legende-punkt punkt-start"></span> Start</div>'
              + '<div class="legende-zeile"><span class="legende-punkt punkt-ziel"></span> Ziel</div>';
      }
      if (opts.gpxLokalUrl) {
        html += '<div class="legende-zeile"><span class="legende-linie"></span> Route</div>';
      }
      div.innerHTML = html;
      L.DomEvent.disableClickPropagation(div);
      return div;
    };
    legende.addTo(map);
  } else if (opts.modus === 'punkt') {
    var popupContent = opts.popupHtml || ('<strong>' + escapeHtml(opts.label) + '</strong>');
    L.marker([opts.lat, opts.lng]).addTo(map).bindPopup(popupContent).openPopup();
    map.setView([opts.lat, opts.lng], 14);
    if (ladeEl) ladeEl.style.display = 'none';
  } else {
    // modus === 'leer' – nur Landkreis-Overlay und Eigen-Standort
    // ladeEl bleibt sichtbar mit Fehlermeldung (vom Aufrufer gesetzt)
  }

  // 3. Eigener Standort (asynchron, nur wenn User erlaubt)
  zeigeEigenenStandort(map);
}

// ─── LANDKREIS-OVERLAY ─────────────────────────────────────────
function ladeKreisGrenzen(map) {
  if (WW_KREISE_CACHE) { ueberlageKreise(map, WW_KREISE_CACHE); return; }
  // Overpass-Query: die drei Landkreise als administrative Boundaries (admin_level=6)
  var query = '[out:json][timeout:25];'
    + '('
      + 'relation["boundary"="administrative"]["admin_level"="6"]["name"="Landkreis Altenkirchen (Westerwald)"];'
      + 'relation["boundary"="administrative"]["admin_level"="6"]["name"="Westerwaldkreis"];'
      + 'relation["boundary"="administrative"]["admin_level"="6"]["name"="Landkreis Neuwied"];'
    + ');'
    + '(._;>;);'
    + 'out body;';
  fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    body: 'data=' + encodeURIComponent(query)
  })
  .then(function(r) { return r.json(); })
  .then(function(data) {
    if (!window.osmtogeojson) return;
    var geojson = window.osmtogeojson(data);
    // Nur Polygone/MultiPolygone behalten
    geojson.features = geojson.features.filter(function(f) {
      return f.geometry && (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon');
    });
    WW_KREISE_CACHE = geojson;
    ueberlageKreise(map, geojson);
  })
  .catch(function(err) {
    // Stiller Fehler: Karte funktioniert auch ohne Overlay
    console.warn('Landkreis-Overlay konnte nicht geladen werden:', err);
  });
}

function ueberlageKreise(map, geojson) {
  L.geoJSON(geojson, {
    style: {
      color: '#1d6b3e',       // Linienfarbe (Westerwald-Grün)
      weight: 2,
      opacity: 0.7,
      fillColor: '#88c340',   // Füllfarbe (helleres Grün, hebt Region hervor)
      fillOpacity: 0.12
    },
    interactive: false        // Klicks gehen durch zur Karte
  }).addTo(map);
}

// ─── EIGENER STANDORT ──────────────────────────────────────────
function zeigeEigenenStandort(map) {
  if (!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(function(pos) {
    var lat = pos.coords.latitude, lng = pos.coords.longitude;
    // Marker für Eigen-Standort: blauer Kreis mit weißem Rand
    L.circleMarker([lat, lng], {
      radius: 8,
      fillColor: '#3388ff',
      color: '#ffffff',
      weight: 3,
      opacity: 1,
      fillOpacity: 0.9
    }).addTo(map).bindPopup('<strong>Dein Standort</strong>');
    // Genauigkeits-Radius andeuten
    if (pos.coords.accuracy && pos.coords.accuracy < 5000) {
      L.circle([lat, lng], {
        radius: pos.coords.accuracy,
        color: '#3388ff',
        weight: 1,
        opacity: 0.4,
        fillColor: '#3388ff',
        fillOpacity: 0.08,
        interactive: false
      }).addTo(map);
    }
  }, function() { /* User hat abgelehnt oder Fehler – still */ }, {
    enableHighAccuracy: false,
    timeout: 8000,
    maximumAge: 60000
  });
}

// Helper: Karte-Button HTML für Detail-Views
function karteButton(typ, schluessel, sichtbar) {
  if (!sichtbar) return '';
  return '<a class="btn-action outline" href="#karte/' + typ + '/' + schluessel + '">🗺️ Karte</a>';
}

function renderMitfahrbankKarte(ziel, slug, l) {
  var mapId = 'mfbk-' + Math.random().toString(36).slice(2);
  ziel.innerHTML =
    '<div class="sticky-region">'
      + navBar(l.zurueck, l.breadcrumb)
      + intro(l.titel, l.untertitel)
    + '</div>'
    + '<div class="osm-karte-wrap">'
      + '<div id="' + mapId + '" class="osm-karte"></div>'
      + '<div class="osm-lade-hinweis" id="' + mapId + '-lade">Karte wird geladen …</div>'
    + '</div>'
    + '<div class="osm-meta">'
      + '<p>Datenquelle: <strong>OpenStreetMap</strong>. '
      + 'Standorte werden von Freiwilligen gepflegt – die Liste kann unvollständig sein. '
      + 'Offizielle Übersicht: <a href="https://mitfahrerbank-ww.de/" target="_blank" rel="noopener">mitfahrerbank-ww.de ↗</a></p>'
    + '</div>'
    + '<div class="spacer"></div>';

  ladeLeaflet().then(function() {
    initMitfahrbankMap(mapId);
  }).catch(function(err) {
    var ladeEl = document.getElementById(mapId + '-lade');
    if (ladeEl) ladeEl.innerHTML = 'Karte konnte nicht geladen werden. <a href="https://mitfahrerbank-ww.de/" target="_blank" rel="noopener">Zur Webseite ↗</a>';
  });
}

function initMitfahrbankMap(mapId) {
  var mapEl = document.getElementById(mapId);
  if (!mapEl || !window.L) return;
  // Westerwald-Zentrum: ca. zwischen Altenkirchen, Neuwied und Westerburg
  var map = L.map(mapId, {
    center: [50.65, 7.85],
    zoom: 10,
    scrollWheelZoom: false   // Scroll-Konflikt mit Seiten-Scroll vermeiden
  });
  // Bei Klick: Scroll-Wheel aktivieren (besseres UX)
  map.on('focus', function() { map.scrollWheelZoom.enable(); });
  map.on('blur',  function() { map.scrollWheelZoom.disable(); });
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>-Mitwirkende',
    maxZoom: 18
  }).addTo(map);
  // Region einrahmen (Landkreis AK + NR + Westerwaldkreis)
  var bbox = [50.30, 7.30, 50.95, 8.30]; // S, W, N, O
  map.fitBounds([[bbox[0], bbox[1]], [bbox[2], bbox[3]]]);
  // Mitfahrerbänke aus Overpass laden
  ladeMitfahrbaenke(map, bbox, mapId);
}

function ladeMitfahrbaenke(map, bbox, mapId) {
  // Overpass-Query: Mitfahrbänke im Westerwald
  // Tags in OSM für Mitfahrerbänke: amenity=hitchhiking_spot oder highway=hitchhiking
  var query =
    '[out:json][timeout:25];'
    + '('
      + 'node["amenity"="hitchhiking_spot"](' + bbox.join(',') + ');'
      + 'node["highway"="hitchhiking"](' + bbox.join(',') + ');'
      + 'node["amenity"="bench"]["hitchhiking"="yes"](' + bbox.join(',') + ');'
    + ');'
    + 'out body;';
  var url = 'https://overpass-api.de/api/interpreter';
  fetch(url, {
    method: 'POST',
    body: 'data=' + encodeURIComponent(query)
  })
  .then(function(r) {
    if (!r.ok) throw new Error('Overpass-Fehler ' + r.status);
    return r.json();
  })
  .then(function(data) {
    var ladeEl = document.getElementById(mapId + '-lade');
    if (ladeEl) ladeEl.style.display = 'none';
    if (!data.elements || !data.elements.length) {
      L.popup({autoClose:false, closeOnClick:false})
        .setLatLng([50.65, 7.85])
        .setContent('<strong>Keine Mitfahrerbänke gefunden</strong><br>In OpenStreetMap sind derzeit keine Mitfahrerbänke für die Region erfasst. Schau auf <a href="https://mitfahrerbank-ww.de/" target="_blank" rel="noopener">mitfahrerbank-ww.de</a>.')
        .openOn(map);
      return;
    }
    data.elements.forEach(function(el) {
      if (!el.lat || !el.lon) return;
      var tags = el.tags || {};
      var name = tags.name || 'Mitfahrerbank';
      var ort  = tags['addr:city'] || tags['addr:suburb'] || '';
      var ziel = tags.destination || tags['hitchhiking:destination'] || '';
      var info = '<strong>' + escapeHtml(name) + '</strong>';
      if (ort) info += '<br>' + escapeHtml(ort);
      if (ziel) info += '<br><em>Richtung:</em> ' + escapeHtml(ziel);
      L.marker([el.lat, el.lon]).addTo(map).bindPopup(info);
    });
  })
  .catch(function(err) {
    var ladeEl = document.getElementById(mapId + '-lade');
    if (ladeEl) ladeEl.innerHTML = 'Daten konnten nicht geladen werden. <a href="https://mitfahrerbank-ww.de/" target="_blank" rel="noopener">Zur Webseite ↗</a>';
  });
}


// ════════════════════════════════════════════════════════════════
// MUSEUM-DETAIL: Inhalte direkt in der App
// ════════════════════════════════════════════════════════════════
function renderMuseumDetail(ziel, item, info, zurueck) {
  var html = '<div class="sticky-detail">'
    + navBar(zurueck, info.breadcrumb)
    + intro(info.titel, '')
    + '<div class="sticky-detail-titel">' + escapeHtml(item.name) + '</div>'
    + '<div class="diff-gpx-row">';
  if (item.ort) html += '<span class="diff-pill diff-leicht-bg">📍 ' + escapeHtml(item.ort) + '</span>';
  if (item.sourceUrl) html += '<a class="btn-action btn-gpx" href="' + item.sourceUrl + '" target="_blank" rel="noopener">🌐 Website</a>';
  if (hatVerortbareInfo(item) && info.karteUrl) {
    html += '<a class="btn-action outline" href="' + info.karteUrl + '">🗺️ Karte</a>';
  }
  html += '</div></div>';

  html += '<div class="detail-section">';

  // Stats-Grid
  var stats = [];
  if (item.adresse) stats.push('<div class="stat"><div class="stat-label">Adresse</div><div class="stat-wert">' + escapeHtml(item.adresse) + '</div></div>');
  if (item.telefon) stats.push('<div class="stat"><div class="stat-label">Telefon</div><div class="stat-wert"><a href="tel:' + item.telefon.replace(/\s+/g,'') + '">' + escapeHtml(item.telefon) + '</a></div></div>');
  if (item.eintritt) stats.push('<div class="stat"><div class="stat-label">Eintritt</div><div class="stat-wert">' + escapeHtml(item.eintritt) + '</div></div>');
  if (stats.length) html += '<div class="stats-grid">' + stats.join('') + '</div>';

  // Dropdowns
  var first = true;
  if (item.beschreibung) { html += dropdown('Beschreibung', '<p>' + escapeHtml(item.beschreibung) + '</p>', first); first = false; }

  if (item.schwerpunkte && item.schwerpunkte.length) {
    var s = '<ul>' + item.schwerpunkte.map(function(x) { return '<li>' + escapeHtml(x) + '</li>'; }).join('') + '</ul>';
    html += dropdown('Schwerpunkte', s, first);
    first = false;
  }

  if (item.oeffnungszeiten) {
    html += dropdown('Öffnungszeiten', '<p>' + escapeHtml(item.oeffnungszeiten) + '</p>', first);
    first = false;
  }

  // Kontakt
  var kontakt = '';
  if (item.adresse) kontakt += '<p><strong>Adresse:</strong> ' + escapeHtml(item.adresse) + '</p>';
  if (item.telefon) kontakt += '<p><strong>Telefon:</strong> <a href="tel:' + item.telefon.replace(/\s+/g,'') + '">' + escapeHtml(item.telefon) + '</a></p>';
  if (item.email)   kontakt += '<p><strong>E-Mail:</strong> <a href="mailto:' + item.email + '">' + escapeHtml(item.email) + '</a></p>';
  if (item.website) {
    var w = item.website.indexOf('http') === 0 ? item.website : 'https://' + item.website;
    kontakt += '<p><strong>Website:</strong> <a href="' + w + '" target="_blank" rel="noopener">' + escapeHtml(item.website) + '</a></p>';
  }
  if (kontakt) { html += dropdown('Kontakt & Anfahrt', kontakt, first); first = false; }

  if (item.sourceUrl) {
    html += dropdown('Weitere Informationen',
      '<p>Diese Inhalte basieren auf den Daten der Tourismusplattform <a href="' + item.sourceUrl + '" target="_blank" rel="noopener">westerwald-sieg.de</a>. Bitte prüfen Sie aktuelle Öffnungszeiten und Eintrittspreise dort.</p>',
      first);
    first = false;
  }

  if (first) html += '<div class="hinweis">Inhalt wird ergänzt.</div>';

  html += '</div><div class="spacer"></div>';
  ziel.innerHTML = html;
}


// ════════════════════════════════════════════════════════════════
// BETRIEB-DETAIL: Hofläden, Direktvermarkter (Westerwald-Box-Anbieter)
// Einheitliches Schema: Beschreibung, Öffnungszeiten, Unternehmen,
// Karriere, Standort, Weitere Informationen
// ════════════════════════════════════════════════════════════════
function renderBetriebDetail(ziel, b, idx) {
  var zurueck = 'liste/regional-westerwald-box';
  var info = { breadcrumb: 'Regionale Produkte › Westerwald-Box › <strong>' + escapeHtml(b.name) + '</strong>', titel: 'Westerwald-Box' };

  var html = '<div class="sticky-detail">'
    + navBar(zurueck, info.breadcrumb)
    + intro(info.titel, '')
    + '<div class="sticky-detail-titel">' + escapeHtml(b.name) + '</div>'
    + '<div class="diff-gpx-row">';
  if (b.ort) {
    var ortStr = (b.plz ? b.plz + ' ' : '') + b.ort;
    html += '<span class="diff-pill diff-leicht-bg">📍 ' + escapeHtml(ortStr) + '</span>';
  }
  if (b.branche) html += '<span class="diff-pill diff-mittel-bg">' + escapeHtml(b.branche) + '</span>';
  if (b.website) html += '<a class="btn-action btn-gpx" href="' + escapeHtml(b.website) + '" target="_blank" rel="noopener">🌐 Website</a>';
  html += '</div></div>';

  html += '<div class="detail-section">';

  // Logo (groß) oben
  if (b.logo) {
    html += '<div class="betrieb-logo-gross-wrap">'
      + '<img class="betrieb-logo-gross" src="' + escapeHtml(b.logo) + '" alt="Logo ' + escapeHtml(b.name) + '" loading="lazy" onerror="this.parentNode.style.display=\'none\'">'
      + '</div>';
  }

  // Helper: leeres-Dropdown mit Hinweis-Text
  function leererHinweis(txt) {
    return '<p class="hinweis-leer"><em>' + txt + '</em></p>';
  }

  // 1. BESCHREIBUNG (immer)
  html += dropdown('Beschreibung',
    b.beschreibung ? '<p>' + escapeHtml(b.beschreibung) + '</p>' : leererHinweis('Keine Beschreibung hinterlegt.'),
    true);

  // 2. ÖFFNUNGSZEITEN (immer)
  var ozHtml;
  if (b.oeffnungszeiten && b.oeffnungszeiten.length) {
    ozHtml = '<table class="oeffnungszeiten-tab"><thead><tr><th>Tag</th><th>von</th><th>bis</th></tr></thead><tbody>';
    for (var i = 0; i < b.oeffnungszeiten.length; i++) {
      var oz = b.oeffnungszeiten[i];
      ozHtml += '<tr>';
      ozHtml += '<td>' + escapeHtml(oz.tag) + '</td>';
      if (oz.hinweis) {
        ozHtml += '<td colspan="2"><em>' + escapeHtml(oz.hinweis) + '</em></td>';
      } else {
        ozHtml += '<td>' + escapeHtml(oz.von || '') + (oz.von ? ' Uhr' : '') + '</td>';
        ozHtml += '<td>' + escapeHtml(oz.bis || '') + (oz.bis ? ' Uhr' : '') + '</td>';
      }
      ozHtml += '</tr>';
    }
    ozHtml += '</tbody></table>';
  } else {
    ozHtml = leererHinweis('Öffnungszeiten bitte direkt beim Betrieb erfragen.');
  }
  html += dropdown('Öffnungszeiten', ozHtml, false);

  // 3. DAS UNTERNEHMEN (immer)
  var untHtml = '';
  if (b.inhaber)   untHtml += '<p><strong>Inhaber/Geschäftsführer:</strong><br>' + escapeHtml(b.inhaber) + '</p>';
  if (b.branche)   untHtml += '<p><strong>Branche:</strong><br>' + escapeHtml(b.branche) + '</p>';
  if (b.gruendung) untHtml += '<p><strong>Gründung:</strong><br>' + escapeHtml(b.gruendung) + '</p>';
  if (b.produkte && b.produkte.length) {
    untHtml += '<p><strong>Produkte:</strong></p><ul>';
    for (var p = 0; p < b.produkte.length; p++) untHtml += '<li>' + escapeHtml(b.produkte[p]) + '</li>';
    untHtml += '</ul>';
  }
  if (!untHtml) untHtml = leererHinweis('Keine Angaben zum Unternehmen hinterlegt.');
  html += dropdown('Das Unternehmen', untHtml, false);

  // 4. KARRIERE (nur wenn Ausbildungen vorhanden – sonst weglassen)
  if (b.ausbildungen && b.ausbildungen.length) {
    var karHtml = '<p><strong>Ausbildungen:</strong></p><ul>';
    for (var a = 0; a < b.ausbildungen.length; a++) karHtml += '<li>' + escapeHtml(b.ausbildungen[a]) + '</li>';
    karHtml += '</ul>';
    html += dropdown('Karriere', karHtml, false);
  }

  // 5. STANDORT (immer)
  var stdHtml = '';
  if (b.landkreis) stdHtml += '<p><strong>Landkreis:</strong><br>' + escapeHtml(b.landkreis) + '</p>';
  if (b.vg)        stdHtml += '<p><strong>Verbandsgemeinde:</strong><br>' + escapeHtml(b.vg) + '</p>';
  var ortLine = '';
  if (b.plz)       ortLine = b.plz;
  if (b.ort)       ortLine += (ortLine ? ' ' : '') + b.ort;
  if (b.ortsteil)  ortLine += (ortLine ? ' / ' : '') + b.ortsteil;
  if (ortLine)     stdHtml += '<p><strong>Ort:</strong><br>' + escapeHtml(ortLine) + '</p>';
  if (b.strasse)   stdHtml += '<p><strong>Straße, Hausnummer:</strong><br>' + escapeHtml(b.strasse) + '</p>';
  if (!stdHtml)    stdHtml = leererHinweis('Standort wird derzeit nicht öffentlich angegeben.');
  html += dropdown('Standort', stdHtml, false);

  // 6. WEITERE INFORMATIONEN (immer)
  var weitHtml = '';
  if (b.ansprechpartner) weitHtml += '<p><strong>Ansprechpartner:</strong><br>' + escapeHtml(b.ansprechpartner) + '</p>';
  if (b.email)           weitHtml += '<p><strong>E-Mail-Adresse:</strong><br><a href="mailto:' + escapeHtml(b.email) + '">' + escapeHtml(b.email) + '</a></p>';
  if (b.telefon)         weitHtml += '<p><strong>Telefonnummer:</strong><br><a href="tel:' + escapeHtml(b.telefon.replace(/\s+/g,'')) + '">' + escapeHtml(b.telefon) + '</a></p>';
  if (b.mobil)           weitHtml += '<p><strong>Mobilnummer:</strong><br><a href="tel:' + escapeHtml(b.mobil.replace(/\s+/g,'')) + '">' + escapeHtml(b.mobil) + '</a></p>';
  if (b.fax)             weitHtml += '<p><strong>Fax:</strong><br>' + escapeHtml(b.fax) + '</p>';
  if (b.website)         weitHtml += '<p><strong>Website:</strong><br><a href="' + escapeHtml(b.website) + '" target="_blank" rel="noopener">' + escapeHtml(b.website.replace(/^https?:\/\//,'')) + '</a></p>';
  if (b.sourceUrl)       weitHtml += '<p><a href="' + escapeHtml(b.sourceUrl) + '" target="_blank" rel="noopener">Eintrag bei Wir Westerwälder ↗</a></p>';
  if (!weitHtml)         weitHtml = leererHinweis('Keine zusätzlichen Kontaktdaten hinterlegt.');
  html += dropdown('Weitere Informationen', weitHtml, false);

  html += '</div><div class="spacer"></div>';
  ziel.innerHTML = html;
}


// ════════════════════════════════════════════════════════════════
// E-BIKE INFRASTRUKTUR DETAIL
// ════════════════════════════════════════════════════════════════
function renderEbikeDetail(ziel, item, info, zurueck) {
  var html = '<div class="sticky-detail">'
    + navBar(zurueck, info.breadcrumb)
    + intro(info.titel, '')
    + '<div class="sticky-detail-titel">' + escapeHtml(item.name) + '</div>'
    + '<div class="diff-gpx-row">';
  if (item.ort)  html += '<span class="diff-pill diff-leicht-bg">📍 ' + escapeHtml(item.ort) + '</span>';
  if (item.type) html += '<span class="diff-pill diff-mittel-bg">' + escapeHtml(item.type) + '</span>';
  if (hatVerortbareInfo(item) && info.karteUrl) {
    html += '<a class="btn-action outline" href="' + info.karteUrl + '">🗺️ Karte</a>';
  }
  html += '</div></div>';

  html += '<div class="detail-section">';
  var first = true;

  if (item.address) {
    html += dropdown('Adresse', '<p>' + escapeHtml(item.address) + '</p>', first);
    first = false;
  }
  if (item.type) {
    html += dropdown('Art der Station', '<p>' + escapeHtml(item.type) + '</p>', first);
    first = false;
  }
  if (item.ort && !item.address) {
    html += dropdown('Standort', '<p>' + escapeHtml(item.ort) + '</p>', first);
    first = false;
  }

  if (first) html += '<div class="hinweis">Weitere Details wurden nicht erfasst.</div>';
  html += '</div><div class="spacer"></div>';
  ziel.innerHTML = html;
}
