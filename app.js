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
  var ov         = document.getElementById('cookie-overlay');
  var box        = document.getElementById('cookie-box');
  var btn        = document.getElementById('cookie-akzeptieren');
  var btnAblehnen= document.getElementById('cookie-ablehnen');
  var checkbox   = document.getElementById('cookie-checkbox');
  var text       = document.getElementById('cookie-text');
  var label      = document.getElementById('cookie-checkbox-label');
  var ablehnung  = document.getElementById('cookie-ablehnung');
  var zurueckLink= document.getElementById('cookie-zurueck');
  var app        = document.getElementById('app');

  // App ist initial nicht sichtbar — wird erst nach Einwilligung freigegeben.
  if (app) app.style.visibility = 'hidden';

  function freischalten() {
    if (ov)  ov.style.display = 'none';
    if (app) app.style.visibility = '';
    router();
  }

  function zeigeAblehnung() {
    if (text)       text.style.display = 'none';
    if (label)      label.style.display = 'none';
    if (btn)        btn.style.display = 'none';
    if (btnAblehnen)btnAblehnen.style.display = 'none';
    if (ablehnung)  ablehnung.style.display = 'block';
  }

  function zurueckZurAbfrage() {
    if (ablehnung)  ablehnung.style.display = 'none';
    if (text)       text.style.display = '';
    if (label)      label.style.display = '';
    if (btn)        btn.style.display = '';
    if (btnAblehnen)btnAblehnen.style.display = '';
    if (checkbox)   checkbox.checked = false;
    if (btn)        btn.disabled = true;
  }

  // Overlay erscheint nach Splash-Ende
  setTimeout(function() {
    if (ov) ov.style.display = 'flex';
  }, 3400);

  // Button-Aktivierung ist an die Checkbox gekoppelt.
  if (checkbox && btn) {
    btn.disabled = !checkbox.checked;
    checkbox.addEventListener('change', function() {
      btn.disabled = !checkbox.checked;
    });
  }

  // Zustimmen-Button
  if (btn) {
    btn.addEventListener('click', function() {
      if (!checkbox || !checkbox.checked) return;   // Sicherheits-Doppelprüfung
      freischalten();
    });
  }

  // Ablehnen-Button
  if (btnAblehnen) {
    btnAblehnen.addEventListener('click', function() {
      zeigeAblehnung();
    });
  }

  // Zurück-Link in der Ablehnungs-Ansicht
  if (zurueckLink) {
    zurueckLink.addEventListener('click', function(e) {
      e.preventDefault();
      zurueckZurAbfrage();
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

  try {
    _routerDispatch(ziel, teile);
  } catch (err) {
    // Fehler sichtbar machen statt leere Seite
    console.error('Router-Crash:', err, 'hash=', hash);
    ziel.innerHTML = '<div style="padding:20px;font-family:monospace;font-size:13px;line-height:1.5;">'
      + '<h2 style="color:#b00;">Renderer-Fehler</h2>'
      + '<p>Beim Aufbau der Seite ist ein Fehler aufgetreten:</p>'
      + '<pre style="background:#fff8dc;padding:10px;border-radius:6px;overflow:auto;">'
      + (err && err.message ? escapeHtml(String(err.message)) : 'Unbekannter Fehler') + '\n\n'
      + (err && err.stack ? escapeHtml(String(err.stack).split('\n').slice(0,6).join('\n')) : '')
      + '</pre>'
      + '<p>Route: <code>' + escapeHtml(hash) + '</code></p>'
      + '<p><a href="#home">⌂ Zur Startseite</a></p>'
      + '</div>';
  }
}

function _routerDispatch(ziel, teile) {
  if (teile[0] === 'home' || teile[0] === '') renderHome(ziel);
  else if (teile[0] === 'kategorie' && teile[1]) renderKategorie(ziel, teile[1]);
  else if (teile[0] === 'liste' && teile[1])    renderListe(ziel, teile[1]);
  else if (teile[0] === 'detail' && teile[1] && teile[2]) renderDetail(ziel, teile[1], teile[2]);
  else if (teile[0] === 'detail-home' && teile[1] && teile[2]) renderDetail(ziel, teile[1], teile[2], 'home');
  else if (teile[0] === 'karte'  && teile[1] && teile[2]) renderKarte(ziel, teile[1], teile[2]);
  else if (teile[0] === 'karte-liste' && teile[1]) {
    try {
      if (teile[1] === 'veranstaltungen-alle') {
        renderVeranstaltungenKarte(ziel);
      } else {
        renderListenKarte(ziel, teile[1]);
      }
    } catch (err) {
      // Falls eine Karten-Funktion crasht: zeig wenigstens den Fehler sichtbar
      // statt eine leere Seite, damit Bug-Reports moeglich sind.
      console.error('Karten-Renderer-Crash:', err);
      ziel.innerHTML = navBar('home','') + intro('Fehler','')
        + '<div class="hinweis" style="white-space:pre-wrap;font-family:monospace;font-size:12px;">'
        + 'Beim Rendern der Karte ist ein Fehler aufgetreten:<br><br>'
        + escapeHtml(String(err.message || err))
        + '<br><br>(Bitte Screenshot mitsenden, oder F12 → Konsole)</div>';
    }
  }
  else if (teile[0] === 'unterkunft-buchen' && teile[1]) {
    renderUnterkunftBuchung(ziel, teile[1], teile[2] || '');
  }
  else if (teile[0] === 'unterkunft-anfrage' && teile[1]) {
    renderUnterkunftAnfrage(ziel, parseInt(teile[1], 10));
  }
  else if (teile[0] === 'detail-karte' && teile[1] && teile[2]) {
    // Wie detail/<typ>/<key>, aber Zurueck-Button fuehrt auf die Karte (nicht Liste)
    var sk = teile[2];
    var skParts = sk.split('_');
    var lsSlug = skParts.slice(0, -1).join('_');
    renderDetail(ziel, teile[1], sk, 'karte-liste/' + lsSlug);
  }
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
    + renderTagesHighlights()
    + '<nav class="kategorien">'
      + kachel('tourismus', 'Tourismus<br>&amp; Freizeit', ICONS.wandern)
      + kachel('regional',  'Regionale<br>Produkte',     ICONS.korb)
      + kachel('veranstaltungen', 'Veran&shy;staltungen',           ICONS.kalender)
      + kachel('mobilitaet','Mobilität<br>&amp; Verkehr',ICONS.bus)
    + '</nav>'
    + '<div class="spacer"></div>';
}

// ────────────────────────────────────────────────────────────────────
// TAGES-HIGHLIGHTS: 3 Karten auf der Startseite
//   - heute laufende Einzelevents oder Mehrtages-Events
//   - regelmaessige Termine (Maerkte, jeden-Mittwoch-X) werden ausgeblendet
//     ueber Heuristik: gleicher Titel >= 3x in den naechsten 30 Tagen
//   - Wenn weniger als 3 Events: mit zufaelligem Ausflugsziel auffuellen
// ────────────────────────────────────────────────────────────────────
function renderTagesHighlights() {
  var highlights = sammleTagesHighlights(3);
  if (!highlights.length) return '';  // gar nichts? dann lassen

  var html = '<div class="heute-section">'
    + '<h3 class="heute-titel">✨ Heute entdecken</h3>'
    + '<div class="heute-karten">';
  // Symbol je nach Typ. Bilder sind auf der Startseite bewusst weggelassen,
  // weil DataHub-Fotos teilweise blockiert oder nicht erreichbar sind und ein
  // halber Platzhalter unschoen aussieht. Icons sind robust und schnell.
  var typIcon = function(t) {
    if (t === 'event') return '🎭';
    if (t === 'tour')  return '🥾';
    if (t === 'poi')   return '📍';
    if (t === 'gastro') return '🍽️';
    return '✨';
  };
  for (var i = 0; i < highlights.length; i++) {
    var h = highlights[i];
    html += '<button class="heute-karte" onclick="navigateTo(\'' + escapeHtml(h.ziel) + '\')">'
      + '<div class="heute-karte-icon">' + typIcon(h.typ) + '</div>'
      + '<div class="heute-karte-text">'
      +   '<div class="heute-karte-pille heute-karte-pille-' + h.typ + '">' + h.pille + '</div>'
      +   '<div class="heute-karte-titel">' + escapeHtml(h.titel) + '</div>'
      +   (h.untertitel ? '<div class="heute-karte-meta">' + escapeHtml(h.untertitel) + '</div>' : '')
      + '</div>'
      + '<div class="heute-karte-pfeil">&rsaquo;</div>'
      + '</button>';
  }
  html += '</div></div>';
  return html;
}

function sammleTagesHighlights(n) {
  var heute = new Date();
  heute.setHours(0,0,0,0);
  var pad = function(x) { return String(x).padStart(2,'0'); };
  var heuteIso = heute.getFullYear() + '-' + pad(heute.getMonth()+1) + '-' + pad(heute.getDate());
  var heuteDe = pad(heute.getDate()) + '.' + pad(heute.getMonth()+1) + '.' + heute.getFullYear();
  // Ende Filter-Fenster: 30 Tage in der Zukunft (fuer Haeufigkeits-Heuristik)
  var maxDate = new Date(heute.getTime() + 30*24*60*60*1000);
  var maxDateIso = maxDate.getFullYear() + '-' + pad(maxDate.getMonth()+1) + '-' + pad(maxDate.getDate());

  var alleEvents = window.DATA_VERANSTALTUNGEN_ALLE || [];

  // 1) HEUTE laufende Events finden
  var heuteEvents = [];
  for (var i = 0; i < alleEvents.length; i++) {
    var ev = alleEvents[i];
    if (!ev.datumIso) continue;
    var ende = ev.datumBisIso || ev.datumIso;
    var laeuftHeute = (ev.datumIso <= heuteIso && ende >= heuteIso);
    if (!laeuftHeute) continue;
    heuteEvents.push({ ev: ev, idx: i });
  }
  if (!heuteEvents.length) {
    // Gar keine heutigen Events -> nur Ausflugsziele zeigen
    return zufaelligeAusflugsziele(n);
  }

  // 2) Haeufigkeit der Event-Titel in den naechsten 30 Tagen zaehlen
  //    Wenn >= 3, ist es vermutlich ein Markt / wiederkehrender Termin -> raus.
  var titelZaehlung = {};
  for (var k = 0; k < alleEvents.length; k++) {
    var ev2 = alleEvents[k];
    if (!ev2.datumIso) continue;
    if (ev2.datumIso < heuteIso || ev2.datumIso > maxDateIso) continue;
    var t = (ev2.titel || ev2.name || '').toLowerCase().trim();
    if (!t) continue;
    titelZaehlung[t] = (titelZaehlung[t] || 0) + 1;
  }

  // 3) Filtern: keine regelmaessigen Termine
  //    Plus: doppelte Titel im heute-Bestand auf 1 reduzieren
  var gesehen = {};
  var einzelEvents = [];
  var mehrtagesEvents = [];
  for (var m = 0; m < heuteEvents.length; m++) {
    var item = heuteEvents[m];
    var ev3 = item.ev;
    var titel = (ev3.titel || ev3.name || '').toLowerCase().trim();
    if (!titel) continue;
    if (gesehen[titel]) continue;
    gesehen[titel] = true;
    // Markt-Heuristik: >= 3 Auftritte in 30 Tagen -> regelmaessig
    if ((titelZaehlung[titel] || 0) >= 3) continue;
    var istMehrtags = !!(ev3.datumBisIso && ev3.datumBisIso !== ev3.datumIso);
    if (istMehrtags) mehrtagesEvents.push(item);
    else einzelEvents.push(item);
  }

  // 4) Auswahl: Eintagesveranstaltungen werden BEVORZUGT (Walli's Wunsch).
  //    Dauer-/Mehrtagesveranstaltungen erscheinen nur als Fallback, wenn
  //    es an dem Tag keine Einzel-Events gibt -- ein laufendes Festival ist
  //    weniger "Tipp des Tages"-Charakter als ein konkreter Tagestermin.
  var ausgewaehlt = [];
  var maxEvents = Math.min(2, n);
  // Erst Einzel-Events mischen und auffuellen
  var einzelMix = mischeArray(einzelEvents.slice());
  for (var p = 0; p < einzelMix.length && ausgewaehlt.length < maxEvents; p++) {
    var ev4 = einzelMix[p].ev;
    var globalIdx = einzelMix[p].idx;
    var zeitStr = '';
    if (ev4.zeit) zeitStr = ev4.zeit + ' Uhr';
    var orStr = ev4.ort || '';
    var unter = [orStr, zeitStr].filter(Boolean).join(' · ');
    ausgewaehlt.push({
      typ: 'event',
      pille: 'Heute',
      titel: ev4.titel || ev4.name || 'Veranstaltung',
      untertitel: unter || heuteDe,
      bild: ev4.bild || '',
      ziel: 'detail-home/event/veranstaltungen-alle_' + globalIdx
    });
  }
  // Falls noch Plaetze frei sind und keine Einzelevents gefunden wurden,
  // ZUSAETZLICH Mehrtages-/Dauerveranstaltungen einbeziehen
  if (ausgewaehlt.length < maxEvents && einzelEvents.length === 0) {
    var mehrMix = mischeArray(mehrtagesEvents.slice());
    for (var pm = 0; pm < mehrMix.length && ausgewaehlt.length < maxEvents; pm++) {
      var ev4m = mehrMix[pm].ev;
      var globalIdxM = mehrMix[pm].idx;
      var zeitStrM = '';
      if (ev4m.zeit) zeitStrM = ev4m.zeit + ' Uhr';
      var orStrM = ev4m.ort || '';
      var unterM = [orStrM, zeitStrM].filter(Boolean).join(' · ');
      ausgewaehlt.push({
        typ: 'event',
        pille: 'Festival · Heute',
        titel: ev4m.titel || ev4m.name || 'Veranstaltung',
        untertitel: unterM || heuteDe,
        bild: ev4m.bild || '',
        ziel: 'detail-home/event/veranstaltungen-alle_' + globalIdxM
      });
    }
  }

  // 5) Auffuellen mit Ausflugszielen (Zufall)
  var lueckenZahl = n - ausgewaehlt.length;
  if (lueckenZahl > 0) {
    ausgewaehlt = ausgewaehlt.concat(zufaelligeAusflugsziele(lueckenZahl));
  }
  return ausgewaehlt;
}

function zufaelligeAusflugsziele(n) {
  var pois = window.DATA_POIS_DH || [];
  if (!pois.length) return [];
  // Bevorzugt mit Bild
  var mitBild = [];
  for (var i = 0; i < pois.length; i++) {
    if (pois[i]._bild) mitBild.push({ p: pois[i], idx: i });
  }
  var pool = mitBild.length ? mitBild : pois.map(function(p, i) { return { p: p, idx: i }; });
  var ausgewaehlt = [];
  var gesehenIdx = {};
  var maxVersuche = pool.length * 2;
  while (ausgewaehlt.length < n && maxVersuche-- > 0) {
    var r = Math.floor(Math.random() * pool.length);
    if (gesehenIdx[r]) continue;
    gesehenIdx[r] = true;
    var entry = pool[r];
    var p = entry.p;
    var orStr = p.ort || '';
    ausgewaehlt.push({
      typ: 'poi',
      pille: 'Ausflugstipp',
      titel: p.name || 'Ausflugsziel',
      untertitel: orStr,
      bild: p._bild || '',
      ziel: 'detail-home/badesee/tourismus-ausflugsziele_' + entry.idx
    });
  }
  return ausgewaehlt;
}

// Fisher-Yates Shuffle, in-place auf Kopie
function mischeArray(arr) {
  var kopie = arr.slice();
  for (var i = kopie.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var tmp = kopie[i]; kopie[i] = kopie[j]; kopie[j] = tmp;
  }
  return kopie;
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
      {slug:'wandern',         label:'Wandern',         meta:'', icon:ICONS.wandern},
      {slug:'radfahren',       label:'Radfahren',       meta:'', icon:ICONS.fahrrad},
      {slug:'ausflugsziele',   label:'Ausflugsziele',   meta:'', icon:ICONS.markierung},
      {slug:'gastronomie',     label:'Gastronomie',     meta:'', icon:ICONS.markt},
      {slug:'unterkuenfte',    label:'Unterkünfte',     meta:'', icon:ICONS.haus}
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
  // (Kunst & Kultur wurde entfernt – die Hauptrubrik 'Veranstaltungen' ersetzt sie.
  //  Klick auf die Kachel "Veranstaltungen" wird direkt in renderKategorie auf
  //  die Veranstaltungs-Liste umgeleitet, ohne Zwischenmenü.)
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
  // Sonderfall: Hauptrubrik "Veranstaltungen" hat keine Zwischenseite,
  // sondern öffnet direkt die Termin-Liste.
  if (slug === 'veranstaltungen') {
    renderListe(ziel, 'veranstaltungen-alle');
    return;
  }
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
    zurueck:'kategorie/tourismus', untertitel:'Die Wandertouren des Westerwaldes.',
    typ:'unterkategorie',
    items:[
      {label:'WesterwaldSteig', meta:'', sub:'westerwaldsteig', icon:ICONS.wandernSimple},
      {label:'Wäller Touren',   meta:'', sub:'waeller-touren',  icon:ICONS.wandernSimple},
      {label:'Kleine Wäller',   meta:'', sub:'kleine-waeller',  icon:ICONS.wandernSimple},
      {label:'Wiedweg',         meta:'', sub:'wiedweg',         icon:ICONS.wandernSimple},
      {label:'Druidensteig',    meta:'', sub:'druidensteig',    icon:ICONS.wandernSimple},
      {label:'Einzeltouren',    meta:'', sub:'einzeltouren',    icon:ICONS.wandernSimple}
    ]
  },
  'tourismus-radfahren': {
    titel:'Radfahren', breadcrumb:'Tourismus &amp; Freizeit › <strong>Radfahren</strong>',
    zurueck:'kategorie/tourismus', untertitel:'Routen für jeden Anspruch.',
    typ:'unterkategorie',
    items:[
      {label:'Rundradwege',     meta:'', sub:'rundradwege',     icon:ICONS.rundrad},
      {label:'Streckenradwege', meta:'', sub:'streckenradwege', icon:ICONS.streckenrad},
      {label:'Gravelbike',      meta:'', sub:'gravelbike',      icon:ICONS.gravelbike},
      {label:'Mountainbike',    meta:'', sub:'mountainbike',    icon:ICONS.mountainbike}
    ]
  },
  'tourismus-ausflugsziele': {
    datenName:'DATA_AUSFLUGSZIELE_DH',
    titel:'Ausflugsziele',
    breadcrumb:'Tourismus &amp; Freizeit › <strong>Ausflugsziele</strong>',
    zurueck:'kategorie/tourismus',
    untertitel:'Sehenswürdigkeiten, Badeseen, Natur & Kultur — Live-Daten vom DataHub RLP.',
    detailKey:'badesee',
    renderTyp:'gefiltert',
    karteButtonLabel:'🗺️ Karte mit allen Ausflugszielen öffnen',
    filterLabel:'Art',
    filterTypen:[
      {key:'alle',         label:'Alle'},
      {key:'kultur',       label:'Kultur & Historie'},
      {key:'natur',        label:'Natur'},
      {key:'aktiv',        label:'Aktiv'},
      {key:'badesee',      label:'Badesee'},
      {key:'sonstige',     label:'Sonstige'}
    ],
    filterBezirke:[
      {key:'alle',   label:'Alle'},
      {key:'AK',     label:'Kreis Altenkirchen'},
      {key:'NR',     label:'Kreis Neuwied'},
      {key:'WW',     label:'Westerwaldkreis'},
      {key:'HE',     label:'Hessen'},
      {key:'SO',     label:'Sonstige'},
      {key:'Hessen', label:'Hessen'},
      {key:'NRW',    label:'NRW'}
    ],
    typErkenner: function(item) {
      var cats = (item.categories || []).join(' | ').toLowerCase();
      var name = (item.name || '').toLowerCase();
      // Badesee zuerst pruefen (auch wenn keine Kategorie matched, aber im Namen)
      if (/(badesee|talsperre|weiher|wiesensee|krombach|see\b|seeufer)/.test(cats + ' ' + name)) return 'badesee';
      if (/(kultur|kirche|kloster|museum|sehensw|denkmal|historisch|geistlich|kunst|bauten|stift|burg|schloss)/.test(cats)) return 'kultur';
      if (/(natur|aussicht|geolog|landschaft|wald|park|tier|baum|garten)/.test(cats)) return 'natur';
      if (/(sport|wandern|fahrrad|radfahren|outdoor|aktiv|freizeit)/.test(cats)) return 'aktiv';
      return 'sonstige';
    }
  },
  'tourismus-unterkuenfte': {
    datenName:'DATA_UNTERKUENFTE_DH',
    titel:'Unterkünfte',
    breadcrumb:'Tourismus &amp; Freizeit › <strong>Unterkünfte</strong>',
    zurueck:'kategorie/tourismus',
    untertitel:'Hotels, Pensionen, Ferienwohnungen, Ferienhäuser — Live-Daten vom DataHub RLP.',
    detailKey:'unterkunft',
    renderTyp:'gefiltert',
    karteButtonLabel:'🗺️ Karte mit allen Unterkünften öffnen',
    filterLabel:'Art',
    filterTypen:[
      {key:'alle',          label:'Alle'},
      {key:'hotel',         label:'Hotel & Pension'},
      {key:'fewo',          label:'Ferienwohnung'},
      {key:'ferienhaus',    label:'Ferienhaus'},
      {key:'camping',       label:'Camping & Mobilheim'},
      {key:'sonstige',      label:'Sonstige'}
    ],
    filterBezirke:[
      {key:'alle',   label:'Alle'},
      {key:'AK',     label:'Kreis Altenkirchen'},
      {key:'NR',     label:'Kreis Neuwied'},
      {key:'WW',     label:'Westerwaldkreis'},
      {key:'HE',     label:'Hessen'},
      {key:'SO',     label:'Sonstige'},
      {key:'Hessen', label:'Hessen'},
      {key:'NRW',    label:'NRW'}
    ],
    typErkenner: function(item) {
      var cats = (item.categories || []).join(' | ').toLowerCase();
      if (/(hotel|pension|gasthof|gasthaus|gasthaeuser)/.test(cats)) return 'hotel';
      if (/(ferienwohnung|fewo|appartement|apartment)/.test(cats)) return 'fewo';
      if (/(ferienhaus|haus)/.test(cats)) return 'ferienhaus';
      if (/(camping|campingplatz|mobilheim|wohnmobil)/.test(cats)) return 'camping';
      return 'sonstige';
    }
  },
  'tourismus-gastronomie': {
    datenName:'DATA_GASTRONOMIE_DH',
    titel:'Gastronomie',
    breadcrumb:'Tourismus &amp; Freizeit › <strong>Gastronomie</strong>',
    zurueck:'kategorie/tourismus',
    untertitel:'Restaurants, Cafés, Imbisse, Biergärten — Live-Daten vom DataHub RLP.',
    detailKey:'gastronomie',
    renderTyp:'gefiltert',
    karteButtonLabel:'🗺️ Karte mit allen Gastronomiebetrieben öffnen',
    filterLabel:'Art',
    filterTypen:[
      {key:'alle',       label:'Alle'},
      {key:'restaurant', label:'Restaurant'},
      {key:'cafe',       label:'Café'},
      {key:'imbiss',     label:'Imbiss'},
      {key:'kneipe',     label:'Bar/Kneipe'},
      {key:'baeckerei',  label:'Bäckerei'},
      {key:'sonstige',   label:'Sonstige'}
    ],
    filterBezirke:[
      {key:'alle',   label:'Alle'},
      {key:'AK',     label:'Kreis Altenkirchen'},
      {key:'NR',     label:'Kreis Neuwied'},
      {key:'WW',     label:'Westerwaldkreis'},
      {key:'HE',     label:'Hessen'},
      {key:'SO',     label:'Sonstige'},
      {key:'Hessen', label:'Hessen'},
      {key:'NRW',    label:'NRW'}
    ],
    typErkenner: function(item) {
      var cats = (item.categories || []).join(' | ').toLowerCase();
      if (/(bäckerei|baeckerei|konditorei)/.test(cats)) return 'baeckerei';
      if (/(café|cafe|kaffeehaus)/.test(cats)) return 'cafe';
      if (/(imbiss|snackbar|snack-bar|sb\/selbstbedienung|pizzeria|döner)/.test(cats)) return 'imbiss';
      if (/(bar|kneipe|biergarten|pub|lounge|brauerei|brennerei)/.test(cats)) return 'kneipe';
      if (/(restaurant|gasthof|gasthaus|gaststätte|gaststaette|ausflugslokal|wandereinkehr|bistro|hotelrestaurant)/.test(cats)) return 'restaurant';
      return 'sonstige';
    }
  },
  'veranstaltungen-alle': {datenName:'DATA_VERANSTALTUNGEN_ALLE', titel:'Veranstaltungen', breadcrumb:'<strong>Veranstaltungen</strong>', zurueck:'home', untertitel:'Alle Termine in der Region.', detailKey:'event', renderTyp:'termine', karteButtonLabel:'🗺️ Karte mit allen Veranstaltungen öffnen'},

  // KUNST & KULTUR – entfällt (Museen-Inhalte wurden gestrichen)

  // REGIONALE PRODUKTE
  'regional-einkaufsfuehrer': {titel:'Regionaler Einkaufsführer Westerwald', breadcrumb:'Regionale Produkte › <strong>Einkaufsführer</strong>', zurueck:'kategorie/regional', untertitel:'Direktvermarkter & Hofläden im Westerwald.', renderTyp:'iframe', iframeUrl:'https://cdn.jsdelivr.net/gh/infostele/infostele2@main/einkaufsfuehrer.pdf', coverBild:'https://cdn.jsdelivr.net/gh/infostele/infostele2@main/startbild_einkaufsfuehrer.jpg'},
  'regional-westerwald-box':  {titel:'Westerwald Box',  breadcrumb:'Regionale Produkte › <strong>Westerwald Box</strong>',  zurueck:'kategorie/regional', untertitel:'Der Westerwald als Geschenkbox.', renderTyp:'inhaltSeite', inhaltKey:'westerwaldBox'},
  'regional-westerwaelder-ernte': {titel:'Westerwälder Ernte', breadcrumb:'Regionale Produkte › <strong>Westerwälder Ernte</strong>', zurueck:'kategorie/regional', untertitel:'Saisonkalender und regionale Erzeuger.', renderTyp:'inhaltSeite', inhaltKey:'westerwaelderErnte'},
  'regional-naturgenuss':     {linkData:'naturgenuss',     titel:'Naturgenuss Partner', breadcrumb:'Regionale Produkte › <strong>Naturgenuss</strong>', zurueck:'kategorie/regional', untertitel:'Erzeuger & Produkte aus dem Westerwald.', renderTyp:'naturgenussLinks'},
  'regional-naturgenuss-erzeuger': {titel:'Naturgenuss Partner – Erzeuger & Produkte', breadcrumb:'Regionale Produkte › Naturgenuss › <strong>Erzeuger & Produkte</strong>', zurueck:'liste/regional-naturgenuss', untertitel:'PDF-Übersicht 05/2025.', renderTyp:'iframe', iframeUrl:'https://cdn.jsdelivr.net/gh/infostele/infostele2@main/naturgenusspartner.pdf', coverBild:'https://cdn.jsdelivr.net/gh/infostele/infostele2@main/startbild_naturgenusspartner.jpg'},
  'regional-naturgenuss-broschuere': {titel:'Naturgenuss Broschüre', breadcrumb:'Regionale Produkte › Naturgenuss › <strong>Broschüre</strong>', zurueck:'liste/regional-naturgenuss', untertitel:'Magazin 2022.', renderTyp:'iframe', iframeUrl:'https://cdn.jsdelivr.net/gh/infostele/infostele2@main/naturgenussmagazin.pdf', coverBild:'https://cdn.jsdelivr.net/gh/infostele/infostele2@main/startbild_naturgenussmagazin.jpg'},
  'regional-naturgenuss-saisonprodukte': {titel:'Naturgenuss Saisonprodukte', breadcrumb:'Regionale Produkte › Naturgenuss › <strong>Saisonprodukte</strong>', zurueck:'liste/regional-naturgenuss', untertitel:'Saisonale Produkte und Rezepte.', renderTyp:'iframe', iframeUrl:'https://cdn.jsdelivr.net/gh/infostele/infostele2@main/naturgenussrezepte.pdf', coverBild:'https://cdn.jsdelivr.net/gh/infostele/infostele2@main/startbild_naturgenussrezepte.jpg'},

  // MOBILITÄT & VERKEHR
  'mobilitaet-bahn-bus':      {titel:'Bahn & Bus', breadcrumb:'Mobilität &amp; Verkehr › <strong>Bahn & Bus</strong>', zurueck:'kategorie/mobilitaet', untertitel:'VRM-Fahrplanauskunft für Altenkirchen, Neuwied und Westerwaldkreis.', renderTyp:'iframe', iframeUrl:'https://www.vrminfo.de/fahrplanauskunft/', iframeTyp:'webseite', mobilIframe:true},
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
    iframeTyp:'webseite',
    mobilIframe:true
  },
  'mobilitaet-bahn-bus-oepnv-ww': {
    titel:'Westerwaldkreis',
    breadcrumb:'Mobilität &amp; Verkehr › Bahn & Bus › <strong>Westerwaldkreis</strong>',
    zurueck:'liste/mobilitaet-bahn-bus',
    untertitel:'Fahrpläne und Verbindungen im Westerwaldkreis.',
    renderTyp:'iframe',
    iframeUrl:'https://www.vrminfo.de/fahrplanauskunft/',
    iframeTyp:'webseite',
    mobilIframe:true
  },
  'mobilitaet-bahn-bus-vrm': {
    titel:'Landkreis Neuwied',
    breadcrumb:'Mobilität &amp; Verkehr › Bahn & Bus › <strong>Landkreis Neuwied</strong>',
    zurueck:'liste/mobilitaet-bahn-bus',
    untertitel:'Verkehrsverbund Rhein-Mosel: Fahrpläne und Verbindungen.',
    renderTyp:'iframe',
    iframeUrl:'https://www.vrminfo.de/fahrplanauskunft/',
    iframeTyp:'webseite',
    mobilIframe:true
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
  'westerwaldsteig': {name:'DATA_WANDERN_WESTERWALDSTEIG', titel:'WesterwaldSteig', breadcrumb:'Wandern › <strong>WesterwaldSteig</strong>', untertitel:'Etappen, Erlebnisschleifen und die Gesamtstrecke.', karteButtonLabel:'🗺️ Karte mit allen WesterwaldSteig-Etappen öffnen'},
  'druidensteig':    {name:'DATA_WANDERN_DRUIDENSTEIG',    titel:'Druidensteig',    breadcrumb:'Wandern › <strong>Druidensteig</strong>',    untertitel:'Auf den Spuren der Kelten.', karteButtonLabel:'🗺️ Karte mit allen Druidensteig-Etappen öffnen'},
  'wiedweg':         {name:'DATA_WANDERN_WIEDWEG',         titel:'Wiedweg',         breadcrumb:'Wandern › <strong>Wiedweg</strong>',         untertitel:'Entlang der Wied.', karteButtonLabel:'🗺️ Karte mit allen Wiedweg-Etappen öffnen'},
  'waeller-touren':  {name:'DATA_WANDERN_WAELLER_TOUREN',  titel:'Wäller Touren',   breadcrumb:'Wandern › <strong>Wäller Touren</strong>',   untertitel:'Tageswanderungen mit Charme.', karteButtonLabel:'🗺️ Karte mit allen Wäller Touren öffnen'},
  'kleine-waeller':  {name:'DATA_WANDERN_KLEINE_WAELLER',  titel:'Kleine Wäller',   breadcrumb:'Wandern › <strong>Kleine Wäller</strong>',   untertitel:'Kurze Rundtouren für zwischendurch.', karteButtonLabel:'🗺️ Karte mit allen Kleine-Wäller-Touren öffnen'},
  'einzeltouren':    {name:'DATA_WANDERN_EINZELTOUREN',    titel:'Einzeltouren',    breadcrumb:'Wandern › <strong>Einzeltouren</strong>',    untertitel:'Weitere Touren im Westerwald.', karteButtonLabel:'🗺️ Karte mit allen Wandertouren öffnen'}
};
var RAD_DATEN = {
  'rundradwege':     {name:'DATA_RADFAHREN_RUNDRADWEGE',     titel:'Rundradwege',     breadcrumb:'Radfahren › <strong>Rundradwege</strong>',     untertitel:'Tagestouren als Rundkurs.', karteButtonLabel:'🗺️ Karte mit allen Rundradwegen öffnen'},
  'streckenradwege': {name:'DATA_RADFAHREN_STRECKENRADWEGE', titel:'Streckenradwege', breadcrumb:'Radfahren › <strong>Streckenradwege</strong>', untertitel:'Strecken durch die Region.', karteButtonLabel:'🗺️ Karte mit allen Streckenradwegen öffnen'},
  'gravelbike':      {name:'DATA_RADFAHREN_GRAVELBIKE',      titel:'Gravelbike',      breadcrumb:'Radfahren › <strong>Gravelbike</strong>',      untertitel:'Routen abseits der Straße.', karteButtonLabel:'🗺️ Karte mit allen Gravelbike-Touren öffnen'},
  'mountainbike':    {name:'DATA_RADFAHREN_MOUNTAINBIKE',    titel:'Mountainbike',    breadcrumb:'Radfahren › <strong>Mountainbike</strong>',    untertitel:'Singletrails und Trails.', karteButtonLabel:'🗺️ Karte mit allen Mountainbike-Strecken öffnen'}
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
    sections:     item.sections,
    // WICHTIG fuer Region-Filter: bezirk und _track muessen erhalten bleiben.
    // bezirk kommt aus dem Python-Mapper (PLZ-/Polygon-basiert), _track ist
    // der Polygon-Fallback fuer tourBezirk().
    bezirk:       item.bezirk || '',
    _track:       item._track || null,
    plz:          item.plz || ''
  };
}

function gpxAusTourenplaner(url) {
  if (!url) return null;
  // DataHub liefert Kurz-URLs (/de/r/12345), aeltere Bestaende auch Langform
  // (/de/tour/12345). Beide haben dieselbe Tour-ID und werden vom GPX-Endpoint
  // unter ?i=ID akzeptiert.
  var m = url.match(/\/(?:r|tour)\/(\d+)/);
  if (!m) return null;
  return 'https://www.tourenplaner-rheinland-pfalz.de/de/download.tour.gpx?i=' + m[1] + '&project=oar-rlp';
}


// ──────────────────────────────────────────────────────────────────────
// POINT-IN-POLYGON: Standard Ray-Casting-Algorithmus. Wird benutzt um den
// Landkreis (AK/NR/WW) aus den Geo-Koordinaten eines Tour-Startpunkts zu
// ermitteln -- Grundlage fuer den Region-Filter bei Wandern und Radfahren.
// GeoJSON-Koordinaten sind immer [lng, lat] (NICHT [lat, lng]!).
// ──────────────────────────────────────────────────────────────────────
function pointInRing(pt, ring) {
  var x = pt[0], y = pt[1], inside = false;
  for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    var xi = ring[i][0], yi = ring[i][1];
    var xj = ring[j][0], yj = ring[j][1];
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}
function pointInGeometry(pt, geom) {
  if (!geom) return false;
  if (geom.type === 'Polygon') {
    var rings = geom.coordinates;
    if (!rings.length || !pointInRing(pt, rings[0])) return false;
    // Loecher (innere Ringe) abziehen
    for (var i = 1; i < rings.length; i++) {
      if (pointInRing(pt, rings[i])) return false;
    }
    return true;
  } else if (geom.type === 'MultiPolygon') {
    for (var k = 0; k < geom.coordinates.length; k++) {
      if (pointInGeometry(pt, { type: 'Polygon', coordinates: geom.coordinates[k] })) return true;
    }
  }
  return false;
}
// Liefert 'AK', 'NR', 'WW' oder null (falls Punkt ausserhalb der 3 Kreise liegt).
function ermittleBezirkAusKoords(lat, lng) {
  if (!window.LANDKREISE_WESTERWALD || lat == null || lng == null) return null;
  var pt = [lng, lat];
  var fc = window.LANDKREISE_WESTERWALD;
  for (var i = 0; i < fc.features.length; i++) {
    var f = fc.features[i];
    if (pointInGeometry(pt, f.geometry)) {
      var name = (f.properties && f.properties.name) || '';
      if (name === 'Altenkirchen')    return 'AK';
      if (name === 'Neuwied')         return 'NR';
      if (name === 'Westerwaldkreis') return 'WW';
    }
  }
  return null;
}
// Cached Bezirk-Lookup pro Tour basierend auf erstem Trackpunkt.
function tourBezirk(tour) {
  if (tour._bezirkCache !== undefined) return tour._bezirkCache;
  // 1. Wenn die Tour direkt ein 'bezirk'-Feld traegt (vom Mapper berechnet),
  //    nutzen wir das. Werte: 'AK', 'NR', 'WW', 'HE', 'SO'.
  if (tour.bezirk && /^(AK|NR|WW|HE|SO)$/.test(tour.bezirk)) {
    tour._bezirkCache = tour.bezirk;
    return tour.bezirk;
  }
  // 2. Aus erstem Track-Punkt via Polygon-Lookup (gibt nur AK/NR/WW)
  var pt = null;
  if (tour._track && tour._track.length && tour._track[0] && tour._track[0].length) {
    pt = tour._track[0][0];  // [lng, lat, h]
  }
  if (pt && pt.length >= 2) {
    var bz = ermittleBezirkAusKoords(pt[1], pt[0]);
    if (bz) { tour._bezirkCache = bz; return bz; }
  }
  // 3. Letzter Fallback: 'SO' (Sonstige). So fallen Touren mit Start ausserhalb
  //    der drei Westerwald-Kreise (z.B. WesterwaldSteig-Etappen in Hessen)
  //    nicht durch alle Filter, sondern lassen sich gezielt unter "Sonstige"
  //    finden. Wenn der Mapper Hessen erkennt (per Polygon-Erweiterung), wird
  //    statt 'SO' der Wert 'HE' geliefert -- siehe build_wandertouren.py.
  tour._bezirkCache = 'SO';
  return 'SO';
}

// ──────────────────────────────────────────────────────────────────────
// GPX-FALLBACK: aus inline-Track (DataHub-Format) GPX-XML generieren und
// als Blob-Download anbieten. Wird genutzt wenn keine externe GPX-URL
// verfuegbar ist (gpxAusTourenplaner findet keinen Treffer im Tour-Link).
// Track-Format: Array von Segmenten, jedes Segment ein Array von Punkten,
// Punkt = [lng, lat, ele].
// ──────────────────────────────────────────────────────────────────────
function trackToGpx(track, name) {
  if (!track || !track.length) return null;
  var esc = function(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
                          .replace(/"/g,'&quot;').replace(/'/g,'&apos;');
  };
  var xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<gpx version="1.1" creator="Guck ma, Westerwald" xmlns="http://www.topografix.com/GPX/1/1">\n';
  xml += '  <metadata>\n';
  xml += '    <name>' + esc(name || 'Tour') + '</name>\n';
  xml += '    <link href="https://infostele.github.io/infostele3/"><text>Guck ma, Westerwald</text></link>\n';
  xml += '  </metadata>\n';
  xml += '  <trk>\n';
  xml += '    <name>' + esc(name || 'Tour') + '</name>\n';
  for (var s = 0; s < track.length; s++) {
    var seg = track[s];
    if (!seg || !seg.length) continue;
    xml += '    <trkseg>\n';
    for (var p = 0; p < seg.length; p++) {
      var pt = seg[p];
      if (!pt || pt.length < 2) continue;
      var lng = pt[0], lat = pt[1], ele = pt[2];
      if (typeof lng !== 'number' || typeof lat !== 'number') continue;
      xml += '      <trkpt lat="' + lat + '" lon="' + lng + '">';
      if (typeof ele === 'number' && !isNaN(ele)) xml += '<ele>' + ele + '</ele>';
      xml += '</trkpt>\n';
    }
    xml += '    </trkseg>\n';
  }
  xml += '  </trk>\n';
  xml += '</gpx>\n';
  return xml;
}

// Loest den GPX-Download fuer die aktuell angezeigte Tour aus. Wird vom
// onclick-Handler des GPX-Buttons aufgerufen. Die Track-Daten liegen in
// window._aktiveTourGpx, das im renderRouteDetail bei jedem Aufruf gesetzt
// wird (siehe dort).
function downloadAktiveTourAlsGpx() {
  var data = window._aktiveTourGpx;
  if (!data || !data.track) {
    alert('Keine Track-Daten verfügbar.');
    return;
  }
  var gpx = trackToGpx(data.track, data.name);
  if (!gpx) {
    alert('GPX konnte nicht erzeugt werden.');
    return;
  }
  var blob = new Blob([gpx], { type: 'application/gpx+xml;charset=utf-8' });
  var url = URL.createObjectURL(blob);
  var dateiname = (data.name || 'tour').replace(/[^a-zA-Z0-9_\-äöüÄÖÜß]/g, '_').replace(/_+/g,'_') + '.gpx';
  var a = document.createElement('a');
  a.href = url;
  a.download = dateiname;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(function() { URL.revokeObjectURL(url); }, 200);
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
// Filter-State fuer Wandern/Rad-Touren. Multi-Select: pro Gruppe ein Object
// {key: true, ...}. Leeres Object = "alle". So koennen mehrere Werte gleichzeitig
// gewaehlt sein, z.B. Schwierigkeit "leicht" UND "mittel".
var FILTER_STATE = { sw: {}, dauer: {}, km: {}, bezirk: {} };

function filterAnwenden(eintraege) {
  // Anzahl moeglicher Keys pro Gruppe -- 0 oder gleich == "nicht filtern".
  var swCount    = Object.keys(FILTER_STATE.sw).length;
  var dauerCount = Object.keys(FILTER_STATE.dauer).length;
  var kmCount    = Object.keys(FILTER_STATE.km).length;
  var bezCount   = Object.keys(FILTER_STATE.bezirk).length;
  // Anzahl waehlbarer Optionen (alle "alle"-Optionen ausgenommen): 3,3,3,5
  var swAktiv    = swCount    > 0 && swCount    < 3;
  var dauerAktiv = dauerCount > 0 && dauerCount < 3;
  var kmAktiv    = kmCount    > 0 && kmCount    < 3;
  var bezAktiv   = bezCount   > 0 && bezCount   < 5;

  return eintraege.filter(function(n) {
    if (swAktiv) {
      if (!FILTER_STATE.sw[swKlasse(n.schwierigkeit)]) return false;
    }
    if (dauerAktiv) {
      var dm = dauerInMinuten(n.dauer);
      if (dm == null) return false;
      var matchDauer = false;
      if (FILTER_STATE.dauer.kurz   && dm <= 180) matchDauer = true;
      if (FILTER_STATE.dauer.mittel && dm > 180 && dm <= 360) matchDauer = true;
      if (FILTER_STATE.dauer.lang   && dm > 360) matchDauer = true;
      if (!matchDauer) return false;
    }
    if (kmAktiv) {
      var kk = kmZuZahl(n.km);
      if (kk == null) return false;
      var matchKm = false;
      if (FILTER_STATE.km.kurz   && kk <= 10) matchKm = true;
      if (FILTER_STATE.km.mittel && kk > 10 && kk <= 25) matchKm = true;
      if (FILTER_STATE.km.lang   && kk > 25) matchKm = true;
      if (!matchKm) return false;
    }
    if (bezAktiv) {
      // Tour-Bezirk: 'AK', 'NR', 'WW', 'HE', 'SO' oder null (Polygon ausserhalb)
      var bz = tourBezirk(n);
      if (!FILTER_STATE.bezirk[bz || '']) return false;
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
  // Vier Multi-Select-Dropdowns: 1. Reihe Schwierigkeit + Dauer,
  // 2. Reihe Laenge + Region. Identische Optik wie die anderen Listen-Filter.
  var swOpts = [
    {key:'leicht', label:'Leicht'},
    {key:'mittel', label:'Mittel'},
    {key:'schwer', label:'Schwer'}
  ];
  var dauerOpts = [
    {key:'kurz',   label:'< 3 h'},
    {key:'mittel', label:'3 – 6 h'},
    {key:'lang',   label:'> 6 h'}
  ];
  var kmOpts = [
    {key:'kurz',   label:'< 10 km'},
    {key:'mittel', label:'10 – 25 km'},
    {key:'lang',   label:'> 25 km'}
  ];
  var bezOpts = [
    {key:'AK', label:'Kreis Altenkirchen'},
    {key:'NR', label:'Kreis Neuwied'},
    {key:'WW', label:'Westerwaldkreis'},
    {key:'HE', label:'Hessen'},
    {key:'SO', label:'Sonstige'}
  ];
  var anyAktiv = Object.keys(FILTER_STATE.sw).length
              || Object.keys(FILTER_STATE.dauer).length
              || Object.keys(FILTER_STATE.km).length
              || Object.keys(FILTER_STATE.bezirk).length;
  var html = '<div class="filter-leiste">';
  if (anyAktiv) {
    html += '<div class="filter-titel"><button class="reset-btn" onclick="resetFilter()">↺ Zurücksetzen</button></div>';
  }
  html += '<div class="filter-row">'
    + renderFilterDropdownWR('Schwierigkeit', swOpts,    FILTER_STATE.sw,     'sw',     '⛰️')
    + renderFilterDropdownWR('Dauer',         dauerOpts, FILTER_STATE.dauer,  'dauer',  '⏱️')
    + '</div>';
  html += '<div class="filter-row">'
    + renderFilterDropdownWR('Länge',         kmOpts,    FILTER_STATE.km,     'km',     '📏')
    + renderFilterDropdownWR('Region',        bezOpts,   FILTER_STATE.bezirk, 'bezirk', '📍')
    + '</div>';
  html += '</div>';
  return html;
}

// Eigene Dropdown-Variante fuer Wandern/Rad-Filter (State auf FILTER_STATE,
// Confirm ruft filterDropdownConfirmWR auf, das rerenderListe ausloest).
function renderFilterDropdownWR(label, opts, stateObj, group, icon) {
  icon = icon || '';
  var aktivKeys = Object.keys(stateObj);
  var summary;
  if (aktivKeys.length === 0)                  summary = '<em>nicht gefiltert</em>';
  else if (aktivKeys.length === opts.length)   summary = 'Alle';
  else if (aktivKeys.length <= 2) {
    var names = [];
    for (var i = 0; i < opts.length; i++) if (stateObj[opts[i].key]) names.push(opts[i].label);
    summary = names.join(', ');
  } else summary = aktivKeys.length + ' gewählt';

  var ddId = 'wr-' + group + '-' + Math.random().toString(36).slice(2, 7);
  var html = '<div class="filter-dropdown">'
    + '<button type="button" class="filter-dropdown-head" onclick="toggleFilterDropdown(\'' + ddId + '\')">'
    +   '<span class="filter-dropdown-label">' + icon + ' ' + escapeHtml(label) + '</span>'
    +   '<span class="filter-dropdown-summary">' + summary + '</span>'
    +   '<span class="filter-dropdown-arrow">▾</span>'
    + '</button>'
    + '<div class="filter-dropdown-panel" id="' + ddId + '">'
    +   '<div class="filter-dropdown-opts">';
  for (var j = 0; j < opts.length; j++) {
    var o = opts[j];
    var aktiv = !!stateObj[o.key];
    html += '<label class="filter-dropdown-check">'
      + '<input type="checkbox" data-dd-key="' + escapeHtml(o.key) + '"'
      +   (aktiv ? ' checked' : '') + '>'
      + '<span>' + escapeHtml(o.label) + '</span>'
      + '</label>';
  }
  html += '</div>'
    + '<div class="filter-dropdown-bar">'
    +   '<button type="button" class="filter-dropdown-clear" onclick="filterDropdownClear(\'' + ddId + '\')">Zurücksetzen</button>'
    +   '<button type="button" class="filter-dropdown-confirm" onclick="filterDropdownConfirmWR(\'' + ddId + '\',\'' + group + '\')">Bestätigen</button>'
    + '</div>';
  html += '</div></div>';
  return html;
}

function filterDropdownConfirmWR(id, group) {
  var panel = document.getElementById(id);
  if (!panel) return;
  if (FILTER_STATE[group]) {
    for (var k in FILTER_STATE[group]) delete FILTER_STATE[group][k];
    var checks = panel.querySelectorAll('input[type="checkbox"]');
    for (var i = 0; i < checks.length; i++) {
      if (checks[i].checked) FILTER_STATE[group][checks[i].getAttribute('data-dd-key')] = true;
    }
  }
  panel.classList.remove('offen');
  rerenderListe();
}

function setzeFilter(name, wert) {
  // Legacy-Helper - bleibt fuer Kompatibilitaet, wird durch Dropdowns ersetzt
  FILTER_STATE[name] = wert;
  rerenderListe();
}
function resetFilter() {
  FILTER_STATE = { sw: {}, dauer: {}, km: {}, bezirk: {} };
  rerenderListe();
}
function rerenderListe() {
  // Wenn wir gerade die Touren-Karte sehen: Marker neu zeichnen + Filter-Leiste
  // neu rendern (damit die Dropdown-Header-Labels aktualisieren).
  if (typeof window._tourenKarteRefresh === 'function' &&
      document.querySelector('.listen-karte-map')) {
    var fLeisteK = document.getElementById('filter-leiste-wrapper');
    if (fLeisteK) fLeisteK.innerHTML = filterUI();
    window._tourenKarteRefresh();
    return;
  }
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
  // Wir kehren ggf. aus der Karten-Ansicht zurueck -- alten Refresh-Callback
  // verwerfen, sonst zeigt rerenderListe() ggf. auf eine nicht mehr passende Map.
  window._tourenKarteRefresh = null;
  // Filter-State nur resetten, wenn wir tatsächlich eine ANDERE Liste öffnen.
  // Wechsel Liste -> Karte -> Liste (gleicher slug) soll Auswahl erhalten.
  var letzterSlug = window._aktuelleListe && window._aktuelleListe.slug;
  if (letzterSlug !== slug) {
    FILTER_STATE = { sw: {}, dauer: {}, km: {}, bezirk: {} };
  }
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

  // Sticky-Region: navBar + filter-leiste (intro entfaellt -- Breadcrumb
  // genuegt als Ueberschrift, spart vertikalen Platz)
  ziel.innerHTML =
    '<div class="sticky-region">'
      + navBar('liste/' + zurueckSlug, info.breadcrumb)
      + '<div id="filter-leiste-wrapper">' + filterUI() + '</div>'
    + '</div>'
    + '<div class="listen-karte-btn-row">'
      + '<a class="listen-karte-btn" href="#karte-liste/' + escapeHtml(slug) + '">'
      + escapeHtml(info.karteButtonLabel || '🗺️ Karte mit allen Touren öffnen')
      + '</a>'
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
var TERMIN_FILTER = { datum: {}, bezirk: {}, art: {}, suche: '', eigenVon: '', eigenBis: '' };
window._aktuelleTermine = null;

function termineFilterUI() {
  // Multi-Select-Dropdowns mit "Bestätigen"-Button.
  // datum: OR-Semantik (heute ODER woche ODER monat...)
  // bezirk, art: einfache OR-Auswahl
  var datumOpts = [
    {key:'heute',  label:'Heute'},
    {key:'woche',  label:'Diese Woche'},
    {key:'monat',  label:'Dieser Monat'},
    {key:'jahr',   label:'Aktuelles Jahr'},
    {key:'dauer',  label:'Dauerveranstaltungen'},
    {key:'eigen', label:'Eigener Zeitraum…'}
  ];
  var bezirkOpts = [
    {key:'AK',     label:'Kreis Altenkirchen'},
    {key:'NR',     label:'Kreis Neuwied'},
    {key:'WW',     label:'Westerwaldkreis'},
    {key:'HE',     label:'Hessen'},
    {key:'SO',     label:'Sonstige'},
    {key:'Hessen', label:'Hessen'}
  ];
  var artOpts = [
    {key:'lit',      label:'WW-Lit'},
    {key:'natur',    label:'Naturerlebnisse'},
    {key:'sonstige', label:'Sonstige'}
  ];

  var html = '<div class="filter-leiste termine-filter">';
  // Suchfeld zuerst (bleibt frei eingebbar)
  html += '<div class="filter-gruppe filter-suche-gruppe">'
    + '<input type="search" class="termine-such-input" '
    +   'placeholder="🔍 Veranstaltung suchen…" '
    +   'value="' + escapeHtml(TERMIN_FILTER.suche || '') + '" '
    +   'oninput="setzeTermineSuche(this.value)" '
    +   'autocomplete="off">'
    + '</div>';
  html += '<div class="filter-row">';
  html += renderFilterDropdownTermine('Datum',  datumOpts,  TERMIN_FILTER.datum,  'datum',  '📅');
  html += renderFilterDropdownTermine('Region', bezirkOpts, TERMIN_FILTER.bezirk, 'bezirk', '📍');
  html += '</div>';
  // Eigener Zeitraum: zwei Datums-Felder die nur sichtbar sind wenn
  // im Dropdown "Eigener Zeitraum..." aktiv ist. Werden beim Confirm
  // ein-/ausgeblendet, siehe filterDropdownConfirmTermine().
  var eigenAktiv = !!TERMIN_FILTER.datum.eigen;
  html += '<div class="termin-eigen-bereich" id="termin-eigen-bereich" '
    + 'style="' + (eigenAktiv ? '' : 'display:none') + '">'
    +   '<div class="termin-eigen-row">'
    +     '<div class="termin-eigen-feld">'
    +       '<label for="termin-eigen-von">von</label>'
    +       '<input type="date" id="termin-eigen-von" value="' + escapeHtml(TERMIN_FILTER.eigenVon || '') + '">'
    +     '</div>'
    +     '<div class="termin-eigen-feld">'
    +       '<label for="termin-eigen-bis">bis</label>'
    +       '<input type="date" id="termin-eigen-bis" value="' + escapeHtml(TERMIN_FILTER.eigenBis || '') + '">'
    +     '</div>'
    +     '<button type="button" class="termin-eigen-btn" onclick="termineEigenAnwenden()">↻ Anwenden</button>'
    +   '</div>'
    + '</div>';
  html += renderFilterDropdownTermine('Art',    artOpts,    TERMIN_FILTER.art,    'art',    '🎭');
  html += '</div>';
  return html;
}

function renderFilterDropdownTermine(label, opts, stateObj, group, icon) {
  icon = icon || '';
  var aktivKeys = Object.keys(stateObj);
  var summary;
  if (aktivKeys.length === 0)               summary = '<em>nicht gefiltert</em>';
  else if (aktivKeys.length === opts.length) summary = 'Alle';
  else if (aktivKeys.length <= 2) {
    var names = [];
    for (var i = 0; i < opts.length; i++) if (stateObj[opts[i].key]) names.push(opts[i].label);
    summary = names.join(', ');
  } else summary = aktivKeys.length + ' gewählt';

  var ddId = 'tfd-' + group + '-' + Math.random().toString(36).slice(2, 7);
  var html = '<div class="filter-dropdown">'
    + '<button type="button" class="filter-dropdown-head" onclick="toggleFilterDropdown(\'' + ddId + '\')">'
    +   '<span class="filter-dropdown-label">' + icon + ' ' + escapeHtml(label) + '</span>'
    +   '<span class="filter-dropdown-summary">' + summary + '</span>'
    +   '<span class="filter-dropdown-arrow">▾</span>'
    + '</button>'
    + '<div class="filter-dropdown-panel" id="' + ddId + '">'
    +   '<div class="filter-dropdown-opts">';
  for (var j = 0; j < opts.length; j++) {
    var o = opts[j];
    html += '<label class="filter-dropdown-check">'
      + '<input type="checkbox"' + (stateObj[o.key] ? ' checked' : '') + ' data-dd-key="' + escapeHtml(o.key) + '"> '
      + escapeHtml(o.label) + '</label>';
  }
  html += '</div>'
    +   '<div class="filter-dropdown-bar">'
    +     '<button type="button" class="filter-dropdown-clear" onclick="filterDropdownClear(\'' + ddId + '\')">Zurücksetzen</button>'
    +     '<button type="button" class="filter-dropdown-confirm" onclick="filterDropdownConfirmTermine(\'' + ddId + '\',\'' + group + '\')">Bestätigen</button>'
    +   '</div>'
    + '</div></div>';
  return html;
}

function filterDropdownConfirmTermine(id, group) {
  var panel = document.getElementById(id);
  if (!panel) return;
  if (TERMIN_FILTER[group]) {
    for (var k in TERMIN_FILTER[group]) delete TERMIN_FILTER[group][k];
    var checks = panel.querySelectorAll('input[type="checkbox"]');
    for (var i = 0; i < checks.length; i++) {
      if (checks[i].checked) TERMIN_FILTER[group][checks[i].getAttribute('data-dd-key')] = true;
    }
  }
  panel.classList.remove('offen');
  // Eigener-Zeitraum-Bereich ein-/ausblenden je nach Datum-Checkbox
  if (group === 'datum') {
    var eigenBereich = document.getElementById('termin-eigen-bereich');
    if (eigenBereich) {
      eigenBereich.style.display = TERMIN_FILTER.datum.eigen ? '' : 'none';
    }
    // Wenn "Eigener Zeitraum" deaktiviert wurde -> Eingaben zurueck
    if (!TERMIN_FILTER.datum.eigen) {
      TERMIN_FILTER.eigenVon = '';
      TERMIN_FILTER.eigenBis = '';
    }
  }
  // Termin-Refresh via gespeichertem Context (_aktuelleTermine = {slug, info})
  var ctx = window._aktuelleTermine;
  if (ctx) {
    // Auf der Veranstaltungs-Karte? Dann Marker neu zeichnen statt Liste.
    if (typeof window._termineKarteRefresh === 'function' &&
        document.querySelector('.listen-karte-map')) {
      var fWrapK = document.getElementById('termine-filter-wrap');
      if (fWrapK) fWrapK.innerHTML = termineFilterUI();
      window._termineKarteRefresh();
      return;
    }
    var fLeiste = document.getElementById('filter-leiste-wrapper');
    var liste   = document.getElementById('termine-liste');
    if (fLeiste) fLeiste.innerHTML = termineFilterUI();
    if (liste)   liste.innerHTML = baueTermineListe(ctx.slug, ctx.info);
    if (typeof aktualisiereTermineTreffer === 'function') aktualisiereTermineTreffer(ctx);
  }
}

// Liest die zwei Datums-Felder aus dem eigen-Bereich, validiert und triggert
// Rerender. Wird vom "↻ Anwenden"-Button gerufen.
function termineEigenAnwenden() {
  var vonEl = document.getElementById('termin-eigen-von');
  var bisEl = document.getElementById('termin-eigen-bis');
  if (!vonEl || !bisEl) return;
  var von = vonEl.value, bis = bisEl.value;
  if (!von && !bis) {
    alert('Bitte mindestens "von" oder "bis" angeben.');
    return;
  }
  if (von && bis && von > bis) {
    alert('Das "bis"-Datum muss NACH dem "von"-Datum liegen.');
    return;
  }
  TERMIN_FILTER.eigenVon = von;
  TERMIN_FILTER.eigenBis = bis;
  // Sicherstellen dass eigen-Filter im Datum-Set ist
  TERMIN_FILTER.datum.eigen = true;
  // Auf der Karte? Marker neu zeichnen, sonst Liste.
  var ctx = window._aktuelleTermine;
  if (ctx) {
    if (typeof window._termineKarteRefresh === 'function' &&
        document.querySelector('.listen-karte-map')) {
      window._termineKarteRefresh();
      return;
    }
    var liste = document.getElementById('termine-liste');
    if (liste) liste.innerHTML = baueTermineListe(ctx.slug, ctx.info);
    if (typeof aktualisiereTermineTreffer === 'function') aktualisiereTermineTreffer(ctx);
  }
}

function setzeTerminFilter(group, val) {
  TERMIN_FILTER[group] = val;
  var l = window._aktuelleTermine;
  if (!l) return;
  // BEVOR das Filter-Wrap neu gebaut wird: Cursor im Such-Input merken.
  var aktiv = document.activeElement;
  var warSearch = aktiv && aktiv.classList && aktiv.classList.contains('termine-such-input');
  var caretPos = warSearch && aktiv.selectionStart != null ? aktiv.selectionStart : 0;
  var wrap = document.getElementById('filter-leiste-wrapper');
  if (wrap) wrap.innerHTML = termineFilterUI();
  var liste = document.getElementById('termine-liste');
  if (liste) liste.innerHTML = baueTermineListe(l.slug, l.info);
  aktualisiereTermineTreffer(l);
  if (warSearch && wrap) {
    var neu = wrap.querySelector('.termine-such-input');
    if (neu) {
      neu.focus();
      try { neu.setSelectionRange(caretPos, caretPos); } catch (e) {}
    }
  }
}

// Suche bei Veranstaltungen: identisches Debounce-Pattern wie bei
// setzeGefiltertSuche, damit der Tipp-Flow nicht stockt und der Fokus
// nicht verlorengeht.
var _termineSucheTimer = null;
function setzeTermineSuche(val) {
  TERMIN_FILTER.suche = val || '';
  if (_termineSucheTimer) clearTimeout(_termineSucheTimer);
  _termineSucheTimer = setTimeout(function() {
    var l = window._aktuelleTermine;
    if (!l) return;
    // Auf der Karte? Marker neu zeichnen statt Liste.
    if (typeof window._termineKarteRefresh === 'function' &&
        document.querySelector('.listen-karte-map')) {
      window._termineKarteRefresh();
      return;
    }
    // NUR die Liste neu rendern -- das Filter-Wrap bleibt unangetastet,
    // sodass das Such-Input seinen Fokus behaelt.
    var liste = document.getElementById('termine-liste');
    if (liste) liste.innerHTML = baueTermineListe(l.slug, l.info);
    aktualisiereTermineTreffer(l);
  }, 150);
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
    // Event muss noch laufen oder in der Zukunft sein (Enddatum berücksichtigen).
    // AUSNAHME: Wenn der User "Eigener Zeitraum" aktiv hat, soll auch Vergangenes
    // angezeigt werden duerfen (z.B. um nach historischen Terminen zu suchen).
    var dEnde = item.datumBisIso || d;
    var eigenAktiv = !!TERMIN_FILTER.datum.eigen;
    if (!eigenAktiv && dEnde < heuteStr) return false;

    // Mehrtaegig = "bis [Datum]"-Eintrag (Festival, Ausstellung, Kurs ueber mehrere Tage)
    var istMehrtaegig = !!(item.datumBisIso && item.datumBisIso !== item.datumIso);

    // Mehrtaegig = "bis [Datum]"-Eintrag (Festival, Ausstellung, Kurs ueber mehrere Tage)
    var istMehrtaegig = !!(item.datumBisIso && item.datumBisIso !== item.datumIso);

    // Multi-Select-Datum mit OR-Semantik: leer oder alle aktiv = kein Filter,
    // sonst muss item zu MINDESTENS einem gewaehlten Bucket passen.
    var datumKeys = Object.keys(TERMIN_FILTER.datum);
    // 6 Optionen jetzt (heute, woche, monat, jahr, dauer, eigen)
    var datumFilterAktiv = datumKeys.length > 0 && datumKeys.length < 6;
    // Sonderfall: nur 'dauer' aktiv → nur mehrtägige
    var nurDauer = datumKeys.length === 1 && datumKeys[0] === 'dauer';
    // Wenn 'dauer' NICHT in der Auswahl ist (und Filter aktiv): mehrtaegige raus
    var dauerErlaubt = !datumFilterAktiv || TERMIN_FILTER.datum.dauer;

    if (nurDauer) {
      if (!istMehrtaegig) return false;
    } else if (!datumFilterAktiv && datumKeys.length === 0) {
      // Kein Datum-Filter (Default): mehrtaegige ausblenden (eigene Rubrik)
      if (istMehrtaegig) return false;
    } else if (!dauerErlaubt && istMehrtaegig) {
      return false;
    } else if (datumFilterAktiv) {
      // OR-Match gegen alle gewaehlten Buckets
      var matched = false;
      var buckets = {
        'heute': heuteStr, 'woche': sonntagStr,
        'monat': monatsendeStr, 'jahr': jahresende
      };
      for (var bk in TERMIN_FILTER.datum) {
        if (bk === 'dauer') {
          if (istMehrtaegig) { matched = true; break; }
        } else if (bk === 'eigen') {
          // Freier Datumsbereich: item.datumIso muss zwischen eigenVon und eigenBis liegen.
          // Bei mehrtaegigen Events reicht eine Ueberlappung mit dem Zeitraum.
          var evStart = item.datumIso || '';
          var evEnde  = item.datumBisIso || item.datumIso || '';
          var von = TERMIN_FILTER.eigenVon || '';
          var bis = TERMIN_FILTER.eigenBis || '';
          // Ueberlappungs-Check: evStart <= bis UND evEnde >= von
          var passt = true;
          if (von && evEnde && evEnde < von) passt = false;
          if (bis && evStart && evStart > bis) passt = false;
          if (passt) { matched = true; break; }
        } else if (buckets[bk]) {
          if (d <= buckets[bk]) { matched = true; break; }
        }
      }
      if (!matched) return false;
    }

    // bezirk: Multi-Select
    var bezKeys = Object.keys(TERMIN_FILTER.bezirk);
    var bezFilterAktiv = bezKeys.length > 0 && bezKeys.length < 4;
    if (bezFilterAktiv && !TERMIN_FILTER.bezirk[item.bezirk || '']) return false;

    // art: Multi-Select
    var artKeys = Object.keys(TERMIN_FILTER.art);
    var artFilterAktiv = artKeys.length > 0 && artKeys.length < 3;
    if (artFilterAktiv) {
      var istLit = (item.quelle === 'lit');
      var istNatur = (item.quelle === 'natur');
      var itemArtKey = istLit ? 'lit' : (istNatur ? 'natur' : 'sonstige');
      if (!TERMIN_FILTER.art[itemArtKey]) return false;
    }
    // Volltextsuche ueber Titel, Ort und Beschreibung -- case-insensitive,
    // Leerzeichen-tolerant. Wird zuletzt geprueft, weil sie typisch
    // restriktiver ist als die Pillen-Filter.
    if (TERMIN_FILTER.suche) {
      var suche = TERMIN_FILTER.suche.toLowerCase().trim();
      if (suche) {
        var blob = ((item.titel || item.name || '') + ' '
                  + (item.ort || '') + ' '
                  + (item.beschreibung || item.description || '')).toLowerCase();
        if (blob.indexOf(suche) < 0) return false;
      }
    }
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
  // Karten-Refresh-Callback verwerfen (Wechsel von Karte -> Liste)
  window._termineKarteRefresh = null;
  // TERMIN_FILTER nur resetten, wenn wir tatsächlich auf eine andere Termin-Seite
  // wechseln. Wechsel Liste <-> Karte (gleicher slug) erhaelt die Auswahl.
  var letzterSlug = window._aktuelleTermine && window._aktuelleTermine.slug;
  if (letzterSlug !== slug) {
    TERMIN_FILTER = { datum: {}, bezirk: {}, art: {}, suche: '', eigenVon: '', eigenBis: '' };
  }
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
      + '<div id="filter-leiste-wrapper">' + termineFilterUI() + '</div>'
    + '</div>'
    + '<div class="listen-karte-btn-row">'
      + '<a class="listen-karte-btn" href="#karte-liste/' + escapeHtml(slug) + '">'
      + escapeHtml(l.karteButtonLabel || '🗺️ Karte mit allen Veranstaltungen öffnen')
      + '</a>'
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
function renderDetail(ziel, typ, schluessel, zurueckOverride) {
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
  // Optional: Zurueck-Ziel ueberschreiben (z.B. wenn Aufruf aus der Karte kommt)
  if (zurueckOverride) zurueck = zurueckOverride;
  var item = daten[idx];
  // Karte-URL für Detail-Renderer bereitstellen (wird nur genutzt, wenn Item
  // tatsächlich Koordinaten/GPX hat - die Render-Funktion prüft das selbst).
  info.karteUrl = '#karte/' + typ + '/' + schluessel;

  if (typ === 'wandern' || typ === 'rad')      renderRouteDetail(ziel, item, info, zurueck);
  else if (typ === 'ausfl')                    renderAusflDetail(ziel, item, info, zurueck);
  else if (typ === 'badesee')                  renderBadeseeDetail(ziel, item, info, zurueck);
  else if (typ === 'unterkunft')               renderUnterkunftDetail(ziel, item, info, zurueck, 'unterkunft');
  else if (typ === 'gastronomie')              renderUnterkunftDetail(ziel, item, info, zurueck, 'gastronomie');
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
    var bezirkLabel = item.bezirk === 'AK' ? 'Kreis Altenkirchen' : item.bezirk === 'WW' ? 'Westerwaldkreis' : item.bezirk === 'NR' ? 'Kreis Neuwied' : item.bezirk === 'HE' ? 'Hessen' : item.bezirk === 'SO' ? 'Sonstige' : item.bezirk;
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
  // Foto(s)-Button -> Slideshow. Veranstaltungen haben oft mehrere Bilder.
  var _bilderEv = (item.bilder && item.bilder.length)
    ? item.bilder
    : (item.bild ? [{url: item.bild, autor: item.bildUrheber || '', lizenz: item.bildLizenz || '', caption: ''}] : []);
  if (_bilderEv.length) {
    window._aktiveBilder = _bilderEv;
    var _fotoLabelEv = _bilderEv.length > 1 ? '📷 Fotos (' + _bilderEv.length + ')' : '📷 Foto';
    pills += '<button type="button" class="btn-action outline btn-foto" onclick="oeffneAktiveSlideshow()">' + _fotoLabelEv + '</button>';
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
  // Eindeutige IDs fuer die Foto-Sektion (Toggle ueber den Foto-Button)
  var fotoSecId = 'foto-sec-' + Math.random().toString(36).slice(2);

  // Hat dieser Eintrag eine inline-Track-Geometrie (von DataHub uebermittelt)?
  var hatInlineTrack = !!(item._track && item._track.length);
  var hatBild = !!item._bild;

  // Aktive Tour fuer den GPX-Download-Fallback merken (wird vom onclick-Handler
  // downloadAktiveTourAlsGpx() ausgelesen, sobald der Nutzer den Button klickt).
  if (hatInlineTrack) {
    window._aktiveTourGpx = { track: item._track, name: n.titel || item.title || 'Tour' };
  } else {
    window._aktiveTourGpx = null;
  }

  // STICKY HEADER: nav + intro + Etappentitel + Schwierigkeit/GPX/Karte/Foto
  var stickyTopRow = '<div class="diff-gpx-row">';
  if (n.schwierigkeit) stickyTopRow += '<span class="diff-pill ' + diffBg + '\">' + escapeHtml(n.schwierigkeit) + '</span>';
  // GPX-Button:
  //  1) direkter Link wenn n.gpxUrl gesetzt ist (z.B. Tourenplaner-RLP-Download)
  //  2) sonst Fallback: aus inline-Track clientseitig GPX-XML generieren
  //  3) sonst gar kein Button (weder URL noch Track verfuegbar)
  if (n.gpxUrl) {
    stickyTopRow += '<a class="btn-action btn-gpx" href="' + n.gpxUrl + '" target="_blank" rel="noopener" download>📥 GPX</a>';
  } else if (hatInlineTrack) {
    stickyTopRow += '<button type="button" class="btn-action btn-gpx" onclick="downloadAktiveTourAlsGpx()">📥 GPX</button>';
  }
  // Karte intern (Leaflet + GPX/Marker/inline-Track) — anzeigen wenn
  // GPX, Start/Ziel-Daten ODER inline-Track vorhanden sind
  if (info.karteUrl && (n.gpxUrl || item.start || item.destination || hatInlineTrack)) {
    stickyTopRow += '<a class="btn-action outline" href="' + info.karteUrl + '">🗺️ Karte</a>';
  } else if (n.tourenplanerUrl) {
    stickyTopRow += '<a class="btn-action outline" href="' + n.tourenplanerUrl + '" target="_blank" rel="noopener">🗺️ Karte</a>';
  }
  // Foto(s)-Button: oeffnet Slideshow mit allen verfuegbaren Bildern dieser
  // Tour. window._aktiveBilder wird gesetzt, der onclick liest es aus.
  var bilderListe = (item._bilder && item._bilder.length)
    ? item._bilder
    : (hatBild ? [{url: item._bild, autor: item._bildUrheber, lizenz: item._bildLizenz, caption: ''}] : []);
  if (bilderListe.length) {
    window._aktiveBilder = bilderListe;
    var label = bilderListe.length > 1 ? '📷 Fotos (' + bilderListe.length + ')' : '📷 Foto';
    stickyTopRow += '<button type="button" class="btn-action outline btn-foto" onclick="oeffneAktiveSlideshow()">' + label + '</button>';
  }
  stickyTopRow += '</div>';

  var html = '<div class="sticky-detail">'
    + navBar(zurueck, info.breadcrumb)
    + intro(info.titel, info.untertitel || '')
    + '<div class="sticky-detail-titel">' + escapeHtml(n.titel) + '</div>'
    + stickyTopRow
    + '</div>';

  // FOTO-SEKTION: standardmaessig ausgeklappt unsichtbar, wird via
  // toggleTourFoto() ein-/ausgeblendet. Steht direkt unter dem Sticky-Header.
  // !important auf den Bildgroessen, damit globale img-Regeln (z.B. max-height
  // fuer Listen-Thumbnails) das Foto hier nicht zusammendruecken.
  if (hatBild) {
    var creditHtml = '';
    if (item._bildUrheber) {
      creditHtml = 'Foto: ' + escapeHtml(item._bildUrheber);
      if (item._bildLizenz) {
        creditHtml += ' (<a href="' + escapeHtml(item._bildLizenz) + '" target="_blank" rel="noopener">Lizenz</a>)';
      }
    }
    html += '<div id="' + fotoSecId + '" class="tour-foto-sektion" style="display:none;margin:12px 0;line-height:0;">'
      +   '<img loading="lazy" src="' + escapeHtml(item._bild) + '" alt="' + escapeHtml(n.titel) + '" '
      +        'style="display:block !important;width:100% !important;max-width:100% !important;height:auto !important;max-height:none !important;border-radius:8px;">'
      +   (creditHtml ? '<div class="tour-foto-credit" style="font-size:0.85em;line-height:1.4;color:#666;margin-top:6px;text-align:left;">' + creditHtml + '</div>' : '')
      + '</div>';
  }

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
  // Eindeutige IDs fuer die Foto-Sektion (Toggle ueber den Foto-Button)
  var fotoSecId = 'foto-sec-' + Math.random().toString(36).slice(2);
  var hatBild = !!item._bild;

  var html = navBar(zurueck, info.breadcrumb)
    + intro(info.titel, '')
    + '<div class="detail-section">'
    + '<h2 class="detail-titel">' + escapeHtml(item.name) + '</h2>';
  var tagRow = '<div class="diff-gpx-row">';
  // Kategorie-Pillen (aus categories[] vom DataHub-POI) — zeigen die Filterzuordnung
  if (item.categories && item.categories.length) {
    item.categories.slice(0, 4).forEach(function(c) {
      tagRow += '<span class="diff-pill">' + escapeHtml(c) + '</span>';
    });
  } else if (item.ort) {
    tagRow += '<span class="diff-pill diff-leicht-bg">📍 ' + escapeHtml(item.ort) + '</span>';
  }
  if (hatVerortbareInfo(item) && info.karteUrl) {
    tagRow += '<a class="btn-action outline" href="' + info.karteUrl + '">🗺️ Karte</a>';
  }
  // Foto(s)-Button -> Slideshow mit allen verfuegbaren Bildern
  var _bilderListe = (item._bilder && item._bilder.length)
    ? item._bilder
    : (hatBild ? [{url: item._bild, autor: item._bildUrheber, lizenz: item._bildLizenz, caption: ''}] : []);
  if (_bilderListe.length) {
    window._aktiveBilder = _bilderListe;
    var _fotoLabel = _bilderListe.length > 1 ? '📷 Fotos (' + _bilderListe.length + ')' : '📷 Foto';
    tagRow += '<button type="button" class="btn-action outline btn-foto" onclick="oeffneAktiveSlideshow()">' + _fotoLabel + '</button>';
  }
  tagRow += '</div>';
  html += tagRow;

  // FOTO-SEKTION
  if (hatBild) {
    var creditHtml = '';
    if (item._bildUrheber) {
      creditHtml = 'Foto: ' + escapeHtml(item._bildUrheber);
      if (item._bildLizenz) {
        creditHtml += ' (<a href="' + escapeHtml(item._bildLizenz) + '" target="_blank" rel="noopener">Lizenz</a>)';
      }
    }
    html += '<div id="' + fotoSecId + '" class="tour-foto-sektion" style="display:none;margin:12px 0;line-height:0;">'
      +   '<img loading="lazy" src="' + escapeHtml(item._bild) + '" alt="' + escapeHtml(item.name) + '" '
      +        'style="display:block !important;width:100% !important;max-width:100% !important;height:auto !important;max-height:none !important;border-radius:8px;">'
      +   (creditHtml ? '<div class="tour-foto-credit" style="font-size:0.85em;line-height:1.4;color:#666;margin-top:6px;text-align:left;">' + creditHtml + '</div>' : '')
      + '</div>';
  }

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
function renderUnterkunftDetail(ziel, item, info, zurueck, typ) {
  // Eindeutige IDs fuer die Foto-Sektion (Toggle ueber den Foto-Button)
  var fotoSecId = 'foto-sec-' + Math.random().toString(36).slice(2);
  var hatBild = !!item._bild;
  var istUnterkunft = (typ === 'unterkunft');

  var html = navBar(zurueck, info.breadcrumb)
    + intro(info.titel, '')
    + '<div class="detail-section">'
    + '<h2 class="detail-titel">' + escapeHtml(item.name) + '</h2>';
  var tagRow = '<div class="diff-gpx-row">';
  var hatTags = false;
  if (item.categories && item.categories.length) {
    item.categories.slice(0, 4).forEach(function(c) { tagRow += '<span class="diff-pill">' + escapeHtml(c) + '</span>'; });
    hatTags = true;
  }
  if (hatVerortbareInfo(item) && info.karteUrl) {
    tagRow += '<a class="btn-action outline" href="' + info.karteUrl + '">🗺️ Karte</a>';
    hatTags = true;
  }
  // Foto(s)-Button -> Slideshow mit allen verfuegbaren Bildern
  var _bilderListeU = (item._bilder && item._bilder.length)
    ? item._bilder
    : (hatBild ? [{url: item._bild, autor: item._bildUrheber, lizenz: item._bildLizenz, caption: ''}] : []);
  if (_bilderListeU.length) {
    window._aktiveBilder = _bilderListeU;
    var _fotoLabelU = _bilderListeU.length > 1 ? '📷 Fotos (' + _bilderListeU.length + ')' : '📷 Foto';
    tagRow += '<button type="button" class="btn-action outline btn-foto" onclick="oeffneAktiveSlideshow()">' + _fotoLabelU + '</button>';
    hatTags = true;
  }
  // Verfuegbarkeit-Button nur bei Unterkuenften (nicht bei Gastronomie).
  // DataHub liefert die Feratel-UUID im identifier-Array mit, wir bauen daraus
  // einen Deep-Link direkt zur einzelnen TOSC5-Buchungsseite auf westerwald.info.
  // Die App oeffnet diese in einem iFrame (eigener Renderer renderUnterkunftBuchung),
  // damit der Nutzer nicht aus der App geworfen wird.
  if (istUnterkunft) {
    // "Verfuegbarkeit pruefen" leitet auf die eigene Anfrage-Maske der App.
    // Dort kann der Nutzer Datum + Personenzahl eingeben und die Anfrage
    // entweder per E-Mail an den Vermieter senden, anrufen oder die TOSC5-
    // Buchungsseite (best-effort mit Datums-Parametern) im neuen Tab oeffnen.
    // Der direkte TOSC5-iFrame-Ansatz war auf Smartphones unbedienbar.
    var anfrageIdx = (item._globalIdx !== undefined) ? item._globalIdx : -1;
    if (anfrageIdx < 0) {
      // Fallback: item-Index aus der Roh-Liste suchen
      var alleU = window.DATA_UNTERKUENFTE_DH || [];
      for (var aui = 0; aui < alleU.length; aui++) {
        if (alleU[aui] === item || alleU[aui].id === item.id) { anfrageIdx = aui; break; }
      }
    }
    if (anfrageIdx >= 0) {
      tagRow += '<a class="btn-action btn-gpx" href="#unterkunft-anfrage/' + anfrageIdx + '" title="Anfrage stellen">🛏️ Verfügbarkeit prüfen</a>';
    } else if (item.feratelUuid) {
      // Fallback wenn Index nicht ermittelbar: direkter TOSC5-Link
      var slugFb = item.slug || '';
      tagRow += '<a class="btn-action btn-gpx" href="https://www.westerwald.info/tosc5/unterkuenfte?limACCMARK=651a30e3-af0e-4021-8bfa-31a4e26828e6#/unterkuenfte/RPT/' + encodeURIComponent(item.feratelUuid) + (slugFb ? '/' + encodeURIComponent(slugFb) : '') + '" target="_blank" rel="noopener">🛏️ Verfügbarkeit prüfen</a>';
    }
    hatTags = true;
  }
  tagRow += '</div>';
  if (hatTags) html += tagRow;

  // FOTO-SEKTION
  if (hatBild) {
    var creditHtml = '';
    if (item._bildUrheber) {
      creditHtml = 'Foto: ' + escapeHtml(item._bildUrheber);
      if (item._bildLizenz) {
        creditHtml += ' (<a href="' + escapeHtml(item._bildLizenz) + '" target="_blank" rel="noopener">Lizenz</a>)';
      }
    }
    html += '<div id="' + fotoSecId + '" class="tour-foto-sektion" style="display:none;margin:12px 0;line-height:0;">'
      +   '<img loading="lazy" src="' + escapeHtml(item._bild) + '" alt="' + escapeHtml(item.name) + '" '
      +        'style="display:block !important;width:100% !important;max-width:100% !important;height:auto !important;max-height:none !important;border-radius:8px;">'
      +   (creditHtml ? '<div class="tour-foto-credit" style="font-size:0.85em;line-height:1.4;color:#666;margin-top:6px;text-align:left;">' + creditHtml + '</div>' : '')
      + '</div>';
  }

  if (item.description) html += dropdown('Beschreibung', txt(item.description), true);
  if (item.features && item.features.length) {
    var f = '<ul>';
    item.features.forEach(function(x) { f += '<li>' + escapeHtml(x) + '</li>'; });
    f += '</ul>';
    html += dropdown('Ausstattung', f);
  }
  // Kontakt: Adresse + Telefon + E-Mail + Web
  var kontakt = '';
  var adresse = '';
  if (item.strasse) adresse += escapeHtml(item.strasse) + '<br>';
  if (item.plz || item.ort) {
    adresse += (item.plz ? escapeHtml(item.plz) + ' ' : '') + (item.ort ? escapeHtml(item.ort) : '') + '<br>';
  }
  if (adresse) kontakt += '<p><strong>Adresse:</strong><br>' + adresse + '</p>';
  if (item.contact && item.contact.phone) kontakt += '<p><strong>Telefon:</strong> <a href="tel:' + escapeHtml(item.contact.phone.replace(/\s+/g,'')) + '">' + escapeHtml(item.contact.phone) + '</a></p>';
  if (item.contact && item.contact.email) kontakt += '<p><strong>E-Mail:</strong> <a href="mailto:' + escapeHtml(item.contact.email) + '">' + escapeHtml(item.contact.email) + '</a></p>';
  if (item.contact && item.contact.url)   kontakt += '<p><strong>Web:</strong> <a href="' + escapeHtml(item.contact.url) + '" target="_blank" rel="noopener">' + escapeHtml(item.contact.url.replace(/^https?:\/\//,'').replace(/\/$/,'')) + '</a></p>';
  if (kontakt) html += dropdown('Kontakt', kontakt);

  if (!item.description && (!item.features || !item.features.length) && !kontakt) {
    html += '<div class="hinweis">Detail-Daten zu diesem Eintrag werden noch befüllt.</div>';
  }
  html += '</div><div class="spacer"></div>';
  ziel.innerHTML = html;
}


// ════════════════════════════════════════════════════════════════
// AUSFLUGSZIELE / UNTERKÜNFTE: Liste mit Typ-Filter + Suche
// ════════════════════════════════════════════════════════════════

var GEFILTERT_STATE = { typ: {}, bezirk: {}, suche: '' };
window._aktuelleGefiltert = null;

// Heuristik PLZ -> Verwaltungsbezirk (analog zu Veranstaltungen)
function plzZuBezirk(plz) {
  if (!plz) return '';
  var p = String(plz).trim().substring(0, 2);
  var m = { '35':'Hessen', '53':'NR', '56':'WW', '57':'AK', '51':'NRW' };
  return m[p] || '';
}

function gefiltertFilterUI(l) {
  // Multi-Select-Dropdowns mit "Bestätigen"-Button.
  var typOpts = (l.filterTypen || []).filter(function(t) { return t.key !== 'alle'; });
  var bezOpts = (l.filterBezirke || []).filter(function(b) { return b.key !== 'alle'; });
  var html = '<div class="filter-leiste gefiltert-filter">';

  // Beide Dropdowns nebeneinander (Art links, Region rechts)
  if (typOpts.length || bezOpts.length) {
    html += '<div class="filter-row">';
    if (typOpts.length) {
      html += renderFilterDropdownListe(
        l.filterLabel || 'Art', typOpts, GEFILTERT_STATE.typ, 'typ', '🏷️');
    }
    if (bezOpts.length) {
      html += renderFilterDropdownListe('Region', bezOpts, GEFILTERT_STATE.bezirk, 'bezirk', '📍');
    }
    html += '</div>';
  }

  // Suche bleibt als normales Eingabefeld (kein Sinn fuer Dropdown)
  html += '<div class="filter-gruppe filter-suche">';
  html += '<input type="text" class="filter-such-input" placeholder="🔍 Suchen…" '
    + 'value="' + escapeHtml(GEFILTERT_STATE.suche) + '" '
    + 'oninput="setzeGefiltertSuche(this.value)">';
  html += '</div>';
  html += '</div>';
  return html;
}

// Dropdown fuer die Listen-Filter (gefiltertFilterUI). Eigene Variante,
// weil der State auf GEFILTERT_STATE liegt (nicht auf _listenKarteState).
function renderFilterDropdownListe(label, opts, stateObj, group, icon) {
  icon = icon || '';
  var aktivKeys = Object.keys(stateObj);
  var summary;
  if (aktivKeys.length === 0)               summary = '<em>nicht gefiltert</em>';
  else if (aktivKeys.length === opts.length) summary = 'Alle';
  else if (aktivKeys.length <= 2) {
    var names = [];
    for (var i = 0; i < opts.length; i++) if (stateObj[opts[i].key]) names.push(opts[i].label);
    summary = names.join(', ');
  } else summary = aktivKeys.length + ' gewählt';

  var ddId = 'lfd-' + group + '-' + Math.random().toString(36).slice(2, 7);
  var html = '<div class="filter-dropdown">'
    + '<button type="button" class="filter-dropdown-head" onclick="toggleFilterDropdown(\'' + ddId + '\')">'
    +   '<span class="filter-dropdown-label">' + icon + ' ' + escapeHtml(label) + '</span>'
    +   '<span class="filter-dropdown-summary">' + summary + '</span>'
    +   '<span class="filter-dropdown-arrow">▾</span>'
    + '</button>'
    + '<div class="filter-dropdown-panel" id="' + ddId + '">'
    +   '<div class="filter-dropdown-opts">';
  for (var j = 0; j < opts.length; j++) {
    var o = opts[j];
    html += '<label class="filter-dropdown-check">'
      + '<input type="checkbox"' + (stateObj[o.key] ? ' checked' : '') + ' data-dd-key="' + escapeHtml(o.key) + '"> '
      + escapeHtml(o.label) + '</label>';
  }
  html += '</div>'
    +   '<div class="filter-dropdown-bar">'
    +     '<button type="button" class="filter-dropdown-clear" onclick="filterDropdownClear(\'' + ddId + '\')">Zurücksetzen</button>'
    +     '<button type="button" class="filter-dropdown-confirm" onclick="filterDropdownConfirmListe(\'' + ddId + '\',\'' + group + '\')">Bestätigen</button>'
    +   '</div>'
    + '</div></div>';
  return html;
}

// Confirm-Handler fuer Listen-Dropdowns: schreibt in GEFILTERT_STATE und rerendert.
function filterDropdownConfirmListe(id, group) {
  var panel = document.getElementById(id);
  if (!panel) return;
  if (GEFILTERT_STATE[group]) {
    for (var k in GEFILTERT_STATE[group]) delete GEFILTERT_STATE[group][k];
    var checks = panel.querySelectorAll('input[type="checkbox"]');
    for (var i = 0; i < checks.length; i++) {
      if (checks[i].checked) GEFILTERT_STATE[group][checks[i].getAttribute('data-dd-key')] = true;
    }
  }
  panel.classList.remove('offen');
  refreshGefiltertView();
}

function setzeGefiltertFilter(group, key) {
  // Rückwärtskompatibel: alter Aufruf setzeGefiltertFilter('alle') wird zu typ='alle'
  if (arguments.length === 1) { key = group; group = 'typ'; }
  GEFILTERT_STATE[group] = key;
  refreshGefiltertView();
}
var _gefiltertSucheTimer = null;
function setzeGefiltertSuche(val) {
  GEFILTERT_STATE.suche = val || '';
  // Debounce: Re-Render erst nach kurzer Tipp-Pause (150 ms). Sonst blockiert
  // eine Live-Liste mit 1.500+ Eintraegen den Hauptthread bei jedem Buchstaben
  // und der Tipp-Flow stockt.
  if (_gefiltertSucheTimer) clearTimeout(_gefiltertSucheTimer);
  _gefiltertSucheTimer = setTimeout(function() {
    if (typeof window._poiKarteRefresh === 'function' &&
        document.querySelector('.listen-karte-map')) {
      window._poiKarteRefresh();
    } else {
      refreshGefiltertListe();
    }
  }, 150);
}

function refreshGefiltertView() {
  var ctx = window._aktuelleGefiltert;
  if (!ctx) return;
  // BEVOR das Filter-Wrap neu gebaut wird: aktuelle Cursorposition im
  // Such-Input merken, danach Fokus wiederherstellen (Belt-and-Braces,
  // falls ein anderer Codepfad doch diesen Render ausloest).
  var aktiv = document.activeElement;
  var warSearch = aktiv && aktiv.classList && aktiv.classList.contains('filter-such-input');
  var caretPos = 0;
  if (warSearch && aktiv.selectionStart != null) caretPos = aktiv.selectionStart;

  var filterWrap = document.getElementById('gefiltert-filter-wrap');
  if (filterWrap) filterWrap.innerHTML = gefiltertFilterUI(ctx.info);

  // Sind wir gerade auf der POI-Karte? Dann Marker neu zeichnen statt Liste.
  if (typeof window._poiKarteRefresh === 'function' &&
      document.querySelector('.listen-karte-map')) {
    window._poiKarteRefresh();
  } else {
    refreshGefiltertListe();
  }

  if (warSearch && filterWrap) {
    var neu = filterWrap.querySelector('.filter-such-input');
    if (neu) {
      neu.focus();
      try { neu.setSelectionRange(caretPos, caretPos); } catch (e) {}
    }
  }
}

function refreshGefiltertListe() {
  var ctx = window._aktuelleGefiltert;
  if (!ctx) return;
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

// Zentrale POI-Filter-Funktion. Wird sowohl von der Liste (baueGefiltertListe)
// als auch von der POI-Karte (renderPoiKarte) genutzt, damit Liste und Karte
// IMMER dieselbe Auswahl zeigen.
function filterPoiItems(rohdaten, l) {
  var suche = (GEFILTERT_STATE.suche || '').toLowerCase().trim();
  var typKeys = Object.keys(GEFILTERT_STATE.typ);
  var bezKeys = Object.keys(GEFILTERT_STATE.bezirk);
  var typOptsCount = (l.filterTypen || []).filter(function(t) { return t.key !== 'alle'; }).length;
  var bezOptsCount = (l.filterBezirke || []).filter(function(b) { return b.key !== 'alle'; }).length;
  var typFilterAktiv = typKeys.length > 0 && typKeys.length < typOptsCount;
  var bezFilterAktiv = bezKeys.length > 0 && bezKeys.length < bezOptsCount;

  return rohdaten.filter(function(item) {
    if (typFilterAktiv) {
      if (!GEFILTERT_STATE.typ[gefiltertItemTyp(item, l)]) return false;
    }
    if (bezFilterAktiv) {
      var bez = plzZuBezirk(item.plz);
      if (!GEFILTERT_STATE.bezirk[bez]) return false;
    }
    if (suche) {
      var blob = ((item.name || '') + ' ' + (item.town || '') + ' ' + (item.ort || '') + ' ' + (item.region || '') + ' ' + (item.topic || '') + ' ' + (item.mainTopic || '')).toLowerCase();
      if (blob.indexOf(suche) < 0) return false;
    }
    return true;
  });
}

function baueGefiltertListe(slug, l) {
  var rohdaten = window[l.datenName] || [];
  var gefiltert = filterPoiItems(rohdaten, l);

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
    // Ort + PLZ direkt aus den DataHub-Feldern. item.town ist ein Legacy-
    // Fallback aus statischen Daten und sollte sonst nicht mehr genutzt sein.
    var ort = item.ort || item.town || (item.contact && item.contact.town) || '';
    var plz = item.plz || '';
    var ortLine = '';
    if (plz && ort) ortLine = plz + ' ' + ort;
    else if (plz)   ortLine = plz;
    else if (ort)   ortLine = ort;
    var typLabel = '';
    if (l.filterTypen && l.typErkenner) {
      var tk = gefiltertItemTyp(item, l);
      for (var i = 0; i < l.filterTypen.length; i++) {
        if (l.filterTypen[i].key === tk && tk !== 'alle') { typLabel = l.filterTypen[i].label; break; }
      }
    }
    return '<button class="eintrag" onclick="navigateTo(\'detail/' + l.detailKey + '/' + slug + '_' + idx + '\')">'
      + '<div class="eintrag-text">'
        + (typLabel ? '<div class="eintrag-typ-badge">' + escapeHtml(typLabel) + '</div>' : '')
        + '<div class="eintrag-titel">' + escapeHtml(titel) + '</div>'
        + (ortLine ? '<div class="eintrag-ort">' + escapeHtml(ortLine) + '</div>' : '')
      + '</div>'
      + '<div class="eintrag-pfeil">&rsaquo;</div>'
    + '</button>';
  }).join('');

  return { html: html, gefiltertCount: gefiltert.length, gesamtCount: rohdaten.length };
}

function renderGefiltertListe(ziel, slug, l) {
  // Karten-Refresh-Callback verwerfen (Wechsel von Karte -> Liste)
  window._poiKarteRefresh = null;
  // GEFILTERT_STATE nur resetten wenn wir tatsächlich auf eine andere Liste
  // wechseln. Wechsel Liste <-> Karte (gleicher slug) erhaelt die Auswahl.
  var letzterSlug = window._aktuelleGefiltert && window._aktuelleGefiltert.slug;
  if (letzterSlug !== slug) {
    GEFILTERT_STATE = { typ: {}, bezirk: {}, suche: '' };
  }
  window._aktuelleGefiltert = { slug: slug, info: l };

  var rohdaten = window[l.datenName] || [];
  if (!rohdaten.length) {
    ziel.innerHTML =
      '<div class="sticky-region">'
      + navBar(l.zurueck, l.breadcrumb)
      + '</div>'
      + '<div class="hinweis">Daten noch nicht verfügbar.</div>'
      + '<div class="spacer"></div>';
    return;
  }
  var liste = baueGefiltertListe(slug, l);

  ziel.innerHTML =
    '<div class="sticky-region">'
      + navBar(l.zurueck, l.breadcrumb)
      + '<div id="gefiltert-filter-wrap">' + gefiltertFilterUI(l) + '</div>'
    + '</div>'
    + '<div class="listen-karte-btn-row">'
      + '<a class="listen-karte-btn" href="#karte-liste/' + escapeHtml(slug) + '">'
      + escapeHtml(l.karteButtonLabel || '🗺️ Karte mit allen Einträgen öffnen')
      + '</a>'
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
    if (istMobil && !l.mobilIframe) {
      // Mobile: schöne Karte mit "In neuem Tab öffnen"-Button.
      // Externe Web-Apps wie westerwald.info sind im iframe auf Mobile
      // schwer zu bedienen (Touch-Konflikte, scrollen, kleine Buttons).
      // Ausnahme: Wenn die Route ausdrücklich mobilIframe:true setzt,
      // wird die Seite auch auf Mobile direkt eingebettet (gleiche
      // Strategie wie Desktop: Karte mit "Seite öffnen"-Button + iframe).
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
    //   - Ausnahme mobilIframe:true: nur iframe, keine Info-Karte
    //     (Ausflugsziele, Unterkünfte, Bahn & Bus — alle Live-Apps,
    //     die ohne Vorrede direkt eingebettet werden sollen).
    var iframeId = 'iframe-' + Math.random().toString(36).slice(2);
    var hostname = iframeUrl.replace(/^https?:\/\//,'').split('/')[0];

    var infoKarteHtml = '';
    if (!l.mobilIframe) {
      infoKarteHtml =
        '<div class="iframe-info-karte">'
          + '<div class="iframe-info-text">'
            + '<strong>Inhalt von ' + escapeHtml(hostname) + '</strong>'
            + '<span class="iframe-info-hinweis">Falls die eingebettete Vorschau unten leer bleibt, kannst du die Seite hier in einem neuen Tab öffnen:</span>'
          + '</div>'
          + '<a class="btn-pdf-oeffnen-gross btn-info-karte" href="' + iframeUrl + '" target="_blank" rel="noopener">🌐 Seite öffnen</a>'
        + '</div>';
    }

    ziel.innerHTML =
      '<div class="sticky-region">'
        + navBar(l.zurueck, l.breadcrumb)
        + intro(l.titel, l.untertitel)
      + '</div>'
      + infoKarteHtml
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
  var hatInlineTrack = !!(item._track && item._track.length);

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

  // Meta-Text fuer Quelle der Tracks
  var metaQuelle;
  if (hatInlineTrack)      metaQuelle = '<p>Tour-Verlauf · Daten: DataHub RLP · Kartendaten: © OpenStreetMap-Mitwirkende</p>';
  else if (gpxLokalPfad)   metaQuelle = '<p>Tour-Verlauf · GPX aus eigenem Datenbestand · Kartendaten: © OpenStreetMap-Mitwirkende</p>';
  else if (hatGpx)         metaQuelle = '<p>Tour-Verlauf · GPX-Daten: Tourenplaner Rheinland-Pfalz · Kartendaten: © OpenStreetMap-Mitwirkende</p>';
  else                     metaQuelle = '<p>Kartendaten: © OpenStreetMap-Mitwirkende. Adress-Suche: Nominatim / OSM.</p>';

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
    + '<div class="karte-meta">' + metaQuelle + '</div>'
    + '<div class="spacer"></div>';

  ladeKartenPlugins().then(function() {
    if (hatInlineTrack) {
      // Inline-Track aus DataHub-Daten: keine HTTP-Anfrage noetig
      initWesterwaldKarte(mapId, {
        modus: 'inlineTrack',
        track: item._track,
        label: titel,
        popupHtml: popupAdresse(item)
      });
    } else if (hatGpx || hatRouteOhneGpx) {
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

  if (opts.modus === 'inlineTrack') {
    // Inline-Track aus DataHub: opts.track ist
    //   [ [[lng,lat,h], [lng,lat,h], ...], ... ]  (MULTILINESTRING als Segmente)
    // Leaflet erwartet [lat,lng] — also umdrehen.
    var alleBounds = null;
    (opts.track || []).forEach(function(seg) {
      if (!seg || !seg.length) return;
      var latlngs = seg.map(function(p) { return [p[1], p[0]]; });
      var line = L.polyline(latlngs, { color: '#0b422a', weight: 4, opacity: 0.85 }).addTo(map);
      try {
        var b = line.getBounds();
        if (b && b.isValid && b.isValid()) {
          alleBounds = alleBounds ? alleBounds.extend(b) : L.latLngBounds(b.getSouthWest(), b.getNorthEast());
        }
      } catch (e) { /* ignorieren */ }
    });
    if (ladeEl) ladeEl.style.display = 'none';
    if (alleBounds && alleBounds.isValid()) {
      map.fitBounds(alleBounds, { padding: [30, 30] });
    }
    // Standort-Banner anbieten — analog zu den anderen Karten-Modi
    if (typeof fuegeStandortBannerHinzu === 'function') {
      fuegeStandortBannerHinzu(map);
    }

  } else if (opts.modus === 'gpx') {
    // Start/Ziel-Marker werden nicht mehr separat gesetzt. Stattdessen wird
    // ausschließlich der GPX-Track gezeichnet und die Karte auf dessen Bounds
    // gefittet. Das vermeidet die Meldung "Start/Ziel konnten nicht ermittelt
    // werden" bei Touren ohne saubere Geocoding-Treffer.
    var gpxGeladen = false;

    if (opts.gpxLokalUrl && window.L && window.L.GPX) {
      try {
        new L.GPX(opts.gpxLokalUrl, {
          async: true,
          // L.GPX setzt seine eigenen Start/Ende-Marker — die blenden wir aus.
          marker_options: {
            startIconUrl: '',
            endIconUrl: '',
            shadowUrl: ''
          },
          polyline_options: { color: '#0b422a', weight: 4, opacity: 0.85 }
        })
        .on('loaded', function(e) {
          gpxGeladen = true;
          if (ladeEl) ladeEl.style.display = 'none';
          try { map.fitBounds(e.target.getBounds(), { padding: [30, 30] }); } catch (err) {}
        })
        .on('error', function(err) {
          console.warn('[Karte] GPX-Track konnte nicht geladen werden:', opts.gpxLokalUrl, err);
          if (ladeEl) ladeEl.innerHTML = 'Route konnte nicht geladen werden.';
        })
        .addTo(map);
      } catch (e) {
        console.warn('[Karte] GPX-Track Fehler:', e);
        if (ladeEl) ladeEl.innerHTML = 'Route konnte nicht geladen werden.';
      }
    } else {
      // Keine GPX-URL übergeben → Lade-Hinweis ausblenden, Karte zeigt nur
      // Landkreis-Overlay und ggf. den eigenen Standort.
      if (ladeEl) ladeEl.style.display = 'none';
    }

    // Legende oben rechts: nur die Route, keine Start/Ziel-Punkte mehr.
    if (opts.gpxLokalUrl) {
      var legende = L.control({ position: 'topright' });
      legende.onAdd = function() {
        var div = L.DomUtil.create('div', 'karte-legende');
        div.innerHTML = '<div class="legende-zeile"><span class="legende-linie"></span> Route</div>';
        L.DomEvent.disableClickPropagation(div);
        return div;
      };
      legende.addTo(map);
    }
  } else if (opts.modus === 'punkt') {
    var popupContent = opts.popupHtml || ('<strong>' + escapeHtml(opts.label) + '</strong>');
    L.marker([opts.lat, opts.lng]).addTo(map).bindPopup(popupContent).openPopup();
    map.setView([opts.lat, opts.lng], 14);
    if (ladeEl) ladeEl.style.display = 'none';
  } else {
    // modus === 'leer' – nur Landkreis-Overlay und Eigen-Standort
    // ladeEl bleibt sichtbar mit Fehlermeldung (vom Aufrufer gesetzt)
  }

  // 3. Standort-Einwilligungs-Banner als Overlay über der Karte einblenden.
  // WICHTIG: Die Geolocation-API wird AUSSCHLIESSLICH auf aktiven Klick
  // ("Ja, anzeigen") des Nutzers angefragt – keine automatische Abfrage
  // beim Karten-Aufruf. Siehe Datenschutz-Audit Mai 2026, Befund A.5.
  fuegeStandortBannerHinzu(map);
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
// Wird AUSSCHLIESSLICH aus fuegeStandortBannerHinzu() heraus
// aufgerufen, niemals automatisch beim Karten-Aufruf.
// Ruft den Callback mit (true) bei Erfolg oder (false) bei Fehler/
// Permission-Verweigerung auf.
function zeigeEigenenStandort(map, callback) {
  if (!navigator.geolocation) {
    console.warn('[Standort] Browser unterstuetzt keine Geolocation-API.');
    if (callback) callback(false, null);
    return;
  }

  // Erfolgs-Handler (einmal definiert, bei beiden Versuchen wiederverwendet)
  function erfolgHandler(pos) {
    var lat = pos.coords.latitude, lng = pos.coords.longitude;
    console.log('[Standort] Erfolg: lat=' + lat.toFixed(5) + ' lng=' + lng.toFixed(5) + ' accuracy=' + Math.round(pos.coords.accuracy) + 'm');
    // Marker für Eigen-Standort: blauer Kreis mit weißem Rand
    var marker = L.circleMarker([lat, lng], {
      radius: 8,
      fillColor: '#3388ff',
      color: '#ffffff',
      weight: 3,
      opacity: 1,
      fillOpacity: 0.9
    }).addTo(map).bindPopup('<strong>Dein Standort</strong>');
    // Genauigkeits-Radius andeuten
    var radius = null;
    if (pos.coords.accuracy && pos.coords.accuracy < 5000) {
      radius = L.circle([lat, lng], {
        radius: pos.coords.accuracy,
        color: '#3388ff',
        weight: 1,
        opacity: 0.4,
        fillColor: '#3388ff',
        fillOpacity: 0.08,
        interactive: false        // Klicks gehen durch zur Karte
      }).addTo(map);
    }
    // Karten-Ausschnitt intelligent anpassen:
    // Wenn bereits Inhalte (z. B. GPX-Track) auf der Karte sind, erweitern
    // wir den Ausschnitt so, dass BEIDE sichtbar sind – Track UND Standort.
    // Wenn die Karte leer ist, zentrieren wir auf den Standort.
    try {
      var aktuelleBounds = null;
      // Aktuelle Bounds aller Layer ermitteln
      map.eachLayer(function(layer) {
        // Tile-Layer und unseren eigenen Marker/Radius ausklammern
        if (layer === marker || layer === radius) return;
        if (layer instanceof L.TileLayer) return;
        if (typeof layer.getBounds === 'function') {
          try {
            var b = layer.getBounds();
            if (b && b.isValid && b.isValid()) {
              aktuelleBounds = aktuelleBounds ? aktuelleBounds.extend(b) : L.latLngBounds(b.getSouthWest(), b.getNorthEast());
            }
          } catch (e) { /* Layer ohne Bounds → ignorieren */ }
        }
      });

      if (aktuelleBounds && aktuelleBounds.isValid()) {
        // Standort zu den vorhandenen Bounds hinzunehmen und Karte fitten
        aktuelleBounds.extend([lat, lng]);
        map.fitBounds(aktuelleBounds, { padding: [40, 40], maxZoom: 14 });
      } else {
        // Keine vorhandenen Inhalte (z. B. Karte ohne GPX) → auf Standort zentrieren
        map.setView([lat, lng], 14);
      }
    } catch (err) {
      // Fallback: sanft auf den Standort schwenken
      map.panTo([lat, lng]);
    }
    if (callback) callback(true, null);
  }

  // Fehler-Handler mit Diagnose + Retry-Logik
  var FEHLER_NAMEN = { 1: 'PERMISSION_DENIED', 2: 'POSITION_UNAVAILABLE', 3: 'TIMEOUT' };

  function fehlerHandlerErstversuch(err) {
    var name = FEHLER_NAMEN[err.code] || ('Code ' + err.code);
    console.warn('[Standort] Erster Versuch (low accuracy) fehlgeschlagen: ' + name + (err.message ? ' — "' + err.message + '"' : ''));

    // Bei PERMISSION_DENIED: kein Retry sinnvoll, der Nutzer hat aktiv abgelehnt.
    // Bei POSITION_UNAVAILABLE oder TIMEOUT: oft VPN-/Netzwerk-Stoerung beim
    // IP-basierten Lookup. Retry mit enableHighAccuracy=true nutzt GPS/WLAN
    // und ist robuster gegen VPN-Tunnel.
    if (err.code === 1) {
      if (callback) callback(false, err.code);
      return;
    }

    console.log('[Standort] Wiederhole mit enableHighAccuracy=true ...');
    navigator.geolocation.getCurrentPosition(erfolgHandler, function(err2) {
      var name2 = FEHLER_NAMEN[err2.code] || ('Code ' + err2.code);
      console.warn('[Standort] Zweiter Versuch (high accuracy) ebenfalls fehlgeschlagen: ' + name2 + (err2.message ? ' — "' + err2.message + '"' : ''));
      if (callback) callback(false, err2.code);
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
  }

  navigator.geolocation.getCurrentPosition(erfolgHandler, fehlerHandlerErstversuch, {
    enableHighAccuracy: false,
    timeout: 8000,
    maximumAge: 60000
  });
}

// ─── STANDORT-EINWILLIGUNGS-BANNER (Variante 3: Hybrid) ────────
// Zeigt einen gut sichtbaren Banner über der Karte mit der Frage,
// ob der Nutzer seinen eigenen Standort anzeigen lassen möchte.
// Die Karte selbst rendert sofort – der Banner ist ein Overlay
// innerhalb des Karten-Containers.
//
// Bei "Ja": Banner verschwindet, Geolocation-API wird abgefragt,
//           Standort wird als blauer Marker eingezeichnet.
// Bei "Nein" oder ×: Banner verschwindet, kein Standort.
//
// Die Entscheidung wird nicht gespeichert; der Banner erscheint
// bei jedem neuen Karten-Aufruf erneut.
function fuegeStandortBannerHinzu(map, callbacks) {
  if (!navigator.geolocation) return;  // Browser ohne Geolocation → kein Banner
  callbacks = callbacks || {};

  // Karten-Container ermitteln (Leaflet legt die Karte in ein <div>)
  var container = map.getContainer();
  if (!container) return;

  // Banner-Element bauen
  var banner = document.createElement('div');
  banner.className = 'standort-banner';
  banner.setAttribute('role', 'dialog');
  banner.setAttribute('aria-label', 'Einwilligung zur Standort-Anzeige');
  banner.innerHTML =
      '<button class="standort-banner-close" type="button" aria-label="Schließen" title="Schließen">\u00D7</button>'
    + '<div class="standort-banner-icon" aria-hidden="true">\u{1F4CD}</div>'
    + '<div class="standort-banner-text">'
    +   '<strong>Standort anzeigen?</strong>'
    +   '<span>Möchtest du deinen eigenen Standort auf der Karte sehen?</span>'
    + '</div>'
    + '<div class="standort-banner-actions">'
    +   '<button class="standort-banner-btn ja" type="button">Ja, anzeigen</button>'
    +   '<button class="standort-banner-btn nein" type="button">Nein, danke</button>'
    + '</div>';

  container.appendChild(banner);

  // Klicks und Touch-Events im Banner dürfen NICHT zur Karte durchgereicht
  // werden (sonst löst der Klick gleichzeitig einen Pan/Zoom aus).
  L.DomEvent.disableClickPropagation(banner);
  L.DomEvent.disableScrollPropagation(banner);

  function bannerEntfernen() {
    if (banner && banner.parentNode) {
      banner.parentNode.removeChild(banner);
    }
  }

  function statusSpinnerZeigen() {
    banner.classList.add('laedt');
    var actions = banner.querySelector('.standort-banner-actions');
    if (actions) actions.innerHTML = '<span class="standort-banner-spinner" aria-hidden="true"></span><span>Standort wird ermittelt \u2026</span>';
  }

  function statusFehlerZeigen(fehlerCode) {
    banner.classList.remove('laedt');
    banner.classList.add('fehler');
    var textEl = banner.querySelector('.standort-banner-text');
    if (textEl) {
      var titel = '<strong>Standort nicht verfuegbar</strong>';
      var hinweis;
      if (fehlerCode === 1) {
        hinweis = '<span>Die Berechtigung wurde verweigert. In den Browser-Einstellungen freigeben, um den eigenen Standort anzuzeigen.</span>';
      } else if (fehlerCode === 2) {
        hinweis = '<span>Standort konnte nicht ermittelt werden. Moegliche Ursachen: aktives VPN, deaktivierte Standortdienste oder kein GPS-Signal.</span>';
      } else if (fehlerCode === 3) {
        hinweis = '<span>Die Standortabfrage hat zu lange gedauert. Erneut versuchen oder Verbindung pruefen.</span>';
      } else {
        hinweis = '<span>Die Standort-Abfrage wurde abgelehnt oder ist fehlgeschlagen.</span>';
      }
      textEl.innerHTML = titel + hinweis;
    }
    var actions = banner.querySelector('.standort-banner-actions');
    if (actions) actions.innerHTML = '<button class="standort-banner-btn nein" type="button">Schliessen</button>';
    var schliessenBtn = banner.querySelector('.standort-banner-btn.nein');
    if (schliessenBtn) schliessenBtn.addEventListener('click', bannerEntfernen);
    // Auto-Schließen nach 6 Sekunden (etwas länger, damit der Hinweistext gelesen werden kann)
    setTimeout(bannerEntfernen, 6000);
  }

  // Ja-Button: Standort holen
  var jaBtn = banner.querySelector('.standort-banner-btn.ja');
  if (jaBtn) {
    jaBtn.addEventListener('click', function() {
      statusSpinnerZeigen();
      zeigeEigenenStandort(map, function(erfolg, fehlerCode) {
        if (erfolg) {
          bannerEntfernen();
          // Koordinaten aus dem gerade gesetzten Marker auslesen und Callback ausloesen
          if (callbacks.onJa && window._eigenerStandortMarker) {
            var ll = window._eigenerStandortMarker.getLatLng();
            callbacks.onJa([ll.lat, ll.lng]);
          }
        } else {
          statusFehlerZeigen(fehlerCode);
          if (callbacks.onFehler) callbacks.onFehler(fehlerCode);
        }
      });
    });
  }

  // Nein-Button: einfach schließen
  var neinBtn = banner.querySelector('.standort-banner-btn.nein');
  if (neinBtn) {
    neinBtn.addEventListener('click', function() {
      bannerEntfernen();
      if (callbacks.onNein) callbacks.onNein();
    });
  }

  // ×-Button: einfach schließen
  var closeBtn = banner.querySelector('.standort-banner-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', function() {
      bannerEntfernen();
      if (callbacks.onNein) callbacks.onNein();
    });
  }
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


// ════════════════════════════════════════════════════════════════
// WANDERN: DATAHUB-DATEN → ALT-SCHEMA
// ════════════════════════════════════════════════════════════════
// Verteilt die 200 DataHub-Wandertouren (window.DATA_WANDERN_ALLE) auf die
// fuenf bekannten Tour-Reihen-Variablen plus eine sechste "Einzeltouren"-Liste.
// Die Daten werden ins OLD-Schema umgeformt, damit die existierende
// Render-Pipeline (renderEtappenListe, baueListenEintrag, renderRouteDetail,
// buildCanonicalSections) unveraendert weiter funktioniert.

function _wandern_schwToText(n) {
  if (!n || n <= 0) return '';
  if (n <= 2) return 'leicht';
  if (n === 3) return 'mittel';
  return 'schwer';
}

function _wandern_dauerToText(min) {
  if (!min || min <= 0) return '';
  var dezH = Math.round((min / 60) * 10) / 10;          // 220 min -> 3.7
  var s = String(dezH).replace('.', ',');
  if (s.indexOf(',') < 0) s += ',0';
  return s + ' h';
}

function _wandern_kmToText(km) {
  if (km == null) return '';
  return String(km).replace('.', ',') + ' km';
}

// Eine DataHub-Tour ins alte Schema mappen
function _wandern_konvertiereEine(t) {
  // Etappennummer aus dem Titel ablesen (z.B. "WesterwaldSteig 01. Etappe ...")
  var etappeMatch = (t.titel || '').match(/(\d+)\.\s*Etappe/);
  var etappeNr = etappeMatch ? parseInt(etappeMatch[1], 10) : null;

  return {
    // Anzeige-Felder (Listenebene)
    title: t.titel,
    subtitle: '',
    type: '',
    km: _wandern_kmToText(t.laengeKm),
    difficulty: _wandern_schwToText(t.schwierigkeit),
    duration: _wandern_dauerToText(t.dauerMin),
    // stats (Detail-Seiten-Grid)
    stats: {
      distanz:       _wandern_kmToText(t.laengeKm),
      duration:      _wandern_dauerToText(t.dauerMin),
      schwierigkeit: _wandern_schwToText(t.schwierigkeit),
      ascent:        t.hoehenmeterAuf ? t.hoehenmeterAuf + ' hm' : '',
      descent:       t.hoehenmeterAb  ? t.hoehenmeterAb  + ' hm' : '',
      highPoint:     t.maxHoehe ? t.maxHoehe + ' m' : '',
      lowPoint:      t.minHoehe ? t.minHoehe + ' m' : ''
    },
    // Texte (Detail-Seiten-Akkordeons)
    description:      t.beschreibung || '',
    routeDescription: t.text || '',
    publicTransport:  t.anreise || '',
    parking:          '',                 // im DataHub nicht separat gepflegt
    directions:       '',
    safetyNotes:      t.hinweise || '',
    equipment:        t.ausruestung || '',
    tips:             t.empfehlung || '',
    start:            '',
    destination:      '',
    sections:         null,

    // Verweise / Identifikation
    sourceUrl:        t.url || '',
    tourenplanerUrl:  t.url || '',
    // GPX-URL aus Tourenplaner-URL ableiten (z.B. .../tour/12345 -> download.tour.gpx?i=12345).
    // Falls das nicht klappt, faellt der Detail-Renderer auf eine clientseitig aus _track
    // generierte GPX-Datei zurueck (Blob-Download).
    gpxUrl:           gpxAusTourenplaner(t.url) || null,

    // Zusatz fuer Karte / Bild (vom Detail-Renderer evtl. ignoriert,
    // aber fuer eine spaetere Map-Verbesserung schon mitgereicht)
    _track:        t.track,
    bezirk:        t.bezirk,    // 'AK', 'NR', 'WW' oder null/undefined (vom Python-Mapper berechnet)
    _slug:         t.slug,
    _id:           t.id,
    _bild:         t.bild,
    _thumb:        t.thumb,
    _bilder:       t.bilder || [],
    _bildLizenz:   t.bildLizenz,
    _bildUrheber:  t.bildUrheber,
    _etappeNr:     etappeNr,
    _tourReihe:    t.tourReihe,
    _istRundweg:   t.istRundweg
  };
}

// Etappennummer-bewusste Sortierung
function _wandern_sortEtappenZuerst(arr) {
  arr.sort(function(a, b) {
    if (a._etappeNr != null && b._etappeNr != null) {
      return a._etappeNr - b._etappeNr;
    }
    // Eintrag MIT Etappennummer vor Eintrag OHNE
    if (a._etappeNr != null) return -1;
    if (b._etappeNr != null) return 1;
    return a.title.localeCompare(b.title, 'de');
  });
}

function _wandern_konvertiereAlle() {
  var alle = window.DATA_WANDERN_ALLE || [];
  if (!alle.length) return;

  var ww   = [];  // WesterwaldSteig
  var wt   = [];  // Waeller Touren
  var kw   = [];  // Kleine Waeller
  var wied = [];  // Wiedweg
  var dr   = [];  // Druidensteig
  var ez   = [];  // Einzeltouren (Rest)

  alle.forEach(function(t) {
    var k = _wandern_konvertiereEine(t);
    if      (t.tourReihe === 'Westerwaldsteig') ww.push(k);
    else if (t.tourReihe === 'Wäller Touren')   wt.push(k);
    else if (t.tourReihe === 'Kleine Wäller')   kw.push(k);
    else if (t.tourReihe === 'Wiedweg')         wied.push(k);
    else if (t.tourReihe === 'Druidensteig')    dr.push(k);
    else                                         ez.push(k);
  });

  // Bei Fernwanderwegen Etappenreihenfolge bevorzugen
  _wandern_sortEtappenZuerst(ww);
  _wandern_sortEtappenZuerst(wied);
  _wandern_sortEtappenZuerst(dr);
  // Bei den uebrigen alphabetisch
  [wt, kw, ez].forEach(function(arr) {
    arr.sort(function(a, b) { return a.title.localeCompare(b.title, 'de'); });
  });

  window.DATA_WANDERN_WESTERWALDSTEIG = ww;
  window.DATA_WANDERN_WAELLER_TOUREN  = wt;
  window.DATA_WANDERN_KLEINE_WAELLER  = kw;
  window.DATA_WANDERN_WIEDWEG         = wied;
  window.DATA_WANDERN_DRUIDENSTEIG    = dr;
  window.DATA_WANDERN_EINZELTOUREN    = ez;

  console.log('[Wandern DATAHUB→alt-Schema] ' + alle.length + ' Touren verteilt: '
    + 'WesterwaldSteig=' + ww.length
    + ', Wäller Touren=' + wt.length
    + ', Kleine Wäller=' + kw.length
    + ', Wiedweg=' + wied.length
    + ', Druidensteig=' + dr.length
    + ', Einzeltouren=' + ez.length);
}

// Beim DOMContentLoaded ausfuehren — zu dem Zeitpunkt sind die Datenscripts
// schon geparsed und window.DATA_WANDERN_ALLE existiert.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', _wandern_konvertiereAlle);
} else {
  _wandern_konvertiereAlle();
}


// ════════════════════════════════════════════════════════════════
// RADFAHREN: DATAHUB-DATEN → ALT-SCHEMA
// ════════════════════════════════════════════════════════════════
// Verteilt window.DATA_RAD_ALLE (Output von build_radtouren.py) auf die
// fuenf existierenden Buckets (Rundradwege, Streckenradwege, Gravelbike,
// Mountainbike, Rennrad). Verteilungslogik nach DataHub-"kategorie"-Feld
// plus istRundweg fuer generische Radtouren.
//
// Die Item-Konvertierung selbst (DataHub-Felder -> OLD-Schema) ist
// identisch zu Wandern -- _wandern_konvertiereEine() ist generisch und
// funktioniert fuer beide Tour-Typen.

function _rad_konvertiereAlle() {
  var alle = window.DATA_RAD_ALLE || [];
  if (!alle.length) return;

  var rund    = [];
  var strecke = [];
  var gravel  = [];
  var mtb     = [];

  alle.forEach(function(t) {
    var k = _wandern_konvertiereEine(t);  // generischer Tour-Mapper
    var kat = t.kategorie || '';
    if      (kat === 'Mountainbike')   mtb.push(k);
    else if (kat === 'Gravelbike')     gravel.push(k);
    else if (kat === 'Streckenradweg') strecke.push(k);
    else if (t.istRundweg)             rund.push(k);
    else                                strecke.push(k);
    // 'Rennrad' wird wie generische Radtour behandelt -> Bucket nach istRundweg
  });

  // Alphabetisch sortieren
  [rund, strecke, gravel, mtb].forEach(function(arr) {
    arr.sort(function(a, b) { return a.title.localeCompare(b.title, 'de'); });
  });

  window.DATA_RADFAHREN_RUNDRADWEGE     = rund;
  window.DATA_RADFAHREN_STRECKENRADWEGE = strecke;
  window.DATA_RADFAHREN_GRAVELBIKE      = gravel;
  window.DATA_RADFAHREN_MOUNTAINBIKE    = mtb;

  console.log('[Rad DATAHUB→alt-Schema] ' + alle.length + ' Touren verteilt: '
    + 'rund=' + rund.length
    + ', strecke=' + strecke.length
    + ', gravel=' + gravel.length
    + ', mtb=' + mtb.length);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', _rad_konvertiereAlle);
} else {
  _rad_konvertiereAlle();
}


// ─── FOTO-TOGGLE (fuer den "Foto"-Button auf Wandertour-Detailseiten) ─────
// Schaltet die Foto-Sektion (Bild + Bildnachweis) ein/aus und passt den
// Button-Text entsprechend an. Beim Aufklappen wird so gescrollt, dass das
// Foto direkt UNTER dem Sticky-Header beginnt.
//
// Hintergrund: window.scrollTo({behavior:'smooth'}) ist auf iOS Safari
// unzuverlaessig. Der robuste Weg ist scrollIntoView() PLUS dynamisch
// gesetzter scroll-margin-top, damit der Browser den Sticky-Header-Offset
// selbst beruecksichtigt. Funktioniert auf Android Chrome, iOS Safari 14+
// und Desktop. Fuer aeltere Browser bleibt der manuelle scrollTo-Fallback.
function toggleTourFoto(elemId, btn) {
  var el = document.getElementById(elemId);
  if (!el) return;
  var sichtbar = el.style.display !== 'none';
  if (sichtbar) {
    el.style.display = 'none';
    if (btn) btn.innerHTML = '📷 Foto';
    return;
  }
  el.style.display = 'block';
  if (btn) btn.innerHTML = '✖ Foto';

  function scrolleFotoSichtbar() {
    try {
      var sticky = document.querySelector('.sticky-detail');
      var headerH = sticky ? Math.round(sticky.getBoundingClientRect().height) : 0;
      var marge = 36;  // ~3 mm Atem-Marge ueber dem Foto (war 24, war zu wenig)

      // Primaerweg: scroll-margin-top setzen, dann scrollIntoView. Der Browser
      // berechnet die Zielposition selbst und beruecksichtigt dabei
      // ggf. die iOS-Adressleiste, dynamische Viewport-Hoehe usw.
      if (el.scrollIntoView) {
        el.style.scrollMarginTop = (headerH + marge) + 'px';
        try {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
          return;
        } catch (e1) {
          // Aelteres iOS unterstuetzt das options-Objekt nicht
          el.scrollIntoView(true);
          return;
        }
      }

      // Fallback fuer ganz alte Browser
      var rect = el.getBoundingClientRect();
      var aktuell = window.pageYOffset || document.documentElement.scrollTop || 0;
      var ziel = aktuell + rect.top - headerH - marge;
      if (ziel < 0) ziel = 0;
      if (window.scrollTo) window.scrollTo(0, ziel);
      else { document.documentElement.scrollTop = ziel; document.body.scrollTop = ziel; }
    } catch (e) { /* nichts tun */ }
  }

  // Erst nach dem Bildladen scrollen, sonst kennt der Browser die finale
  // Bildhoehe noch nicht und scrollt an die falsche Position.
  var img = el.querySelector('img');
  if (img && !img.complete) {
    var fired = false;
    var go = function() { if (fired) return; fired = true; setTimeout(scrolleFotoSichtbar, 30); };
    img.addEventListener('load',  go, { once: true });
    img.addEventListener('error', go, { once: true });
    // Absolute Sicherheitsleine: nach 500 ms auch ohne Load-Event scrollen
    setTimeout(go, 500);
  } else {
    setTimeout(scrolleFotoSichtbar, 50);
  }
}


// ════════════════════════════════════════════════════════════════════════
// PHASE 4: DATAHUB POI / UNTERKUNFT / GASTRONOMIE -> ALTES APP-SCHEMA
// ════════════════════════════════════════════════════════════════════════
//
// Diese Brücken-Funktionen konvertieren die vom DataHub gelieferten
// Rohdaten (window.DATA_POIS_ALLE / DATA_UNTERKUENFTE_ALLE / DATA_GASTRONOMIE_ALLE)
// in das Format, das die bestehenden Render-Funktionen erwarten:
//   - renderBadeseeDetail erwartet: name, ort, lat, lng, kurz, detail, strasse,
//     plz, tel, mail, links, plus _bild/_bildUrheber/_bildLizenz fuer Foto-Button
//   - renderUnterkunftDetail erwartet: name, categories, lat, lng, description,
//     features, contact:{phone,email,url}, plus _bild/_bildUrheber/_bildLizenz
// ════════════════════════════════════════════════════════════════════════

function _pois_konvertiereEine(p) {
  // POI aus DataHub -> Schema fuer renderBadeseeDetail
  // Wir uebernehmen die Felder fast 1:1, ergaenzen nur die Foto-Button-Felder
  return {
    id:          p.id,
    slug:        p.slug,
    name:        p.name,
    ort:         p.ort || '',
    lat:         p.lat,
    lng:         p.lng,
    kurz:        p.kurz || '',
    detail:      p.detail || '',
    strasse:     p.strasse || '',
    plz:         p.plz || '',
    tel:         p.tel || '',
    mail:        p.mail || '',
    links:       p.links || [],
    categories:  p.categories || [],
    features:    p.features || [],
    // Foto-Button-Felder (analog Wandertouren)
    _bild:        p.bild || '',
    _thumb:       p.thumb || '',
    _bilder:      p.bilder || [],
    _bildLizenz:  p.bildLizenz || '',
    _bildUrheber: p.bildUrheber || ''
  };
}

function _pois_konvertiereAlle() {
  var alle = window.DATA_POIS_ALLE || [];
  if (!alle.length) return;
  var konv = alle.map(_pois_konvertiereEine);
  konv.sort(function(a, b) { return a.name.localeCompare(b.name, 'de'); });
  window.DATA_AUSFLUGSZIELE_DH = konv;
  console.log('[POIs DATAHUB→alt-Schema] ' + konv.length
    + ' POIs (incl. Badeseen) in DATA_AUSFLUGSZIELE_DH eingespielt.');
}

function _unterkuenfte_konvertiereEine(u) {
  // Unterkunft aus DataHub -> Schema fuer renderUnterkunftDetail
  // Schema ist schon nahezu identisch, wir muessen nur Foto-Felder umbenennen
  return {
    id:          u.id,
    slug:        u.slug,
    feratelUuid: u.feratelUuid || '',
    name:        u.name,
    categories:  u.categories || [],
    features:    u.features || [],
    description: u.description || '',
    strasse:     u.strasse || '',
    plz:         u.plz || '',
    ort:         u.ort || '',
    lat:         u.lat,
    lng:         u.lng,
    contact:     u.contact || { phone: '', email: '', url: '' },
    _bild:        u.bild || '',
    _thumb:       u.thumb || '',
    _bilder:      u.bilder || [],
    _bildLizenz:  u.bildLizenz || '',
    _bildUrheber: u.bildUrheber || ''
  };
}

function _unterkuenfte_konvertiereAlle() {
  var alle = window.DATA_UNTERKUENFTE_ALLE || [];
  if (!alle.length) return;
  var konv = alle.map(_unterkuenfte_konvertiereEine);
  konv.sort(function(a, b) { return a.name.localeCompare(b.name, 'de'); });
  // Index nach dem Sortieren setzen, damit die Anfrage-Maske ueber #unterkunft-anfrage/<idx>
  // den richtigen Eintrag findet.
  for (var i = 0; i < konv.length; i++) konv[i]._globalIdx = i;
  window.DATA_UNTERKUENFTE_DH = konv;
  console.log('[Unterkuenfte DATAHUB→alt-Schema] ' + konv.length
    + ' Unterkuenfte in DATA_UNTERKUENFTE_DH eingespielt.');
}

function _gastronomie_konvertiereAlle() {
  // Gastronomie nutzt dasselbe Schema wie Unterkuenfte
  var alle = window.DATA_GASTRONOMIE_ALLE || [];
  if (!alle.length) return;
  var konv = alle.map(_unterkuenfte_konvertiereEine);
  konv.sort(function(a, b) { return a.name.localeCompare(b.name, 'de'); });
  window.DATA_GASTRONOMIE_DH = konv;
  console.log('[Gastronomie DATAHUB→alt-Schema] ' + konv.length
    + ' Gastrobetriebe in DATA_GASTRONOMIE_DH eingespielt.');
}

// Beim DOMContentLoaded ausfuehren — wie bei Wandern/Rad
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function() {
    _pois_konvertiereAlle();
    _unterkuenfte_konvertiereAlle();
    _gastronomie_konvertiereAlle();
  });
} else {
  _pois_konvertiereAlle();
  _unterkuenfte_konvertiereAlle();
  _gastronomie_konvertiereAlle();
}


// ════════════════════════════════════════════════════════════════════════
// LISTEN-KARTE: zeigt alle Eintraege einer gefilterten Liste als Marker.
// Filter: Checkboxen oben (Mehrfachauswahl).
// Marker-Popup hat Link zur Detail-Seite mit "zurueck=karte-liste/<slug>".
// ════════════════════════════════════════════════════════════════════════

// ════════════════════════════════════════════════════════════════
// TOUREN-KARTE: gemeinsamer FILTER_STATE mit der Listen-Ansicht.
// Wechsel Liste <-> Karte erhaelt die Auswahl. Filter: Schwierigkeit,
// Dauer, Länge, Region (alle Multi-Select-Dropdowns wie auf der Liste).
// ════════════════════════════════════════════════════════════════
function renderTourenKarte(ziel, slug, info, datenName, detailKey) {
  // Alten Refresh-Callback aus einer eventuell vorherigen Karten-Ansicht
  // verwerfen, damit rerenderListe() ihn nicht versehentlich noch aufruft.
  window._tourenKarteRefresh = null;

  var rohDaten = window[datenName] || [];
  if (!rohDaten.length) {
    ziel.innerHTML = navBar('liste/' + slug, info.breadcrumb + ' › <strong>Karte</strong>')
      + '<div class="hinweis">Daten noch nicht verfügbar.</div><div class="spacer"></div>';
    return;
  }

  // Normalisieren UND globalIdx merken (fuer Detail-Link aus Popup).
  // Ohne Track keine Geo-Position -> aussortieren.
  var alleNorm = [];
  var ohneGeoCount = 0;
  for (var i = 0; i < rohDaten.length; i++) {
    var n = normalisiere(rohDaten[i]);
    n._globalIdx = i;
    if (n._track && n._track.length && n._track[0] && n._track[0].length) {
      var p0 = n._track[0][0];
      if (p0 && p0.length >= 2) {
        n._lat = p0[1];
        n._lng = p0[0];
        alleNorm.push(n);
        continue;
      }
    }
    ohneGeoCount++;
  }

  // Eindeutige Karten-ID
  var mapId = 'tkarte-' + Math.random().toString(36).slice(2);

  // Filter-Leiste rendern (identisch zur Listenansicht, gleicher FILTER_STATE)
  function baueFilterHtml() {
    return '<div id="filter-leiste-wrapper">' + filterUI() + '</div>';
  }

  var trefferTxt = '0 von ' + alleNorm.length + ' Touren angezeigt';
  if (ohneGeoCount > 0) trefferTxt += ' · ' + ohneGeoCount + ' ohne Track';

  ziel.innerHTML =
    '<div class="sticky-region" style="z-index:1500;">'
      + navBar('liste/' + slug, info.breadcrumb + ' › <strong>Karte</strong>')
      + baueFilterHtml()
    + '</div>'
    + '<div id="filter-treffer" class="filter-treffer">' + trefferTxt + '</div>'
    + '<div class="listen-karte-map-wrap" style="height:60vh;min-height:320px;position:relative;margin:0 12px 12px;z-index:0;isolation:isolate;">'
      + '<div id="' + mapId + '" class="listen-karte-map" style="width:100%;height:100%;min-height:320px;border-radius:8px;overflow:hidden;"></div>'
    + '</div>'
    + '<div class="spacer"></div>';

  // Karte initialisieren
  ladeKartenPlugins().then(function() {
    if (!window.L) return;
    var map = L.map(mapId);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap-Mitwirkende', maxZoom: 19
    }).addTo(map);
    zeichneLandkreisGrenzen(map);
    var markerGroup = L.layerGroup().addTo(map);

    function refreshMarker() {
      markerGroup.clearLayers();
      // Gleiche Filter-Logik wie auf der Liste
      var gefiltert = filterAnwenden(alleNorm);
      var bounds = [];
      for (var k = 0; k < gefiltert.length; k++) {
        var n = gefiltert[k];
        if (n._lat == null || n._lng == null) continue;
        var detailUrl = '#detail-karte/' + detailKey + '/' + slug + '_' + n._globalIdx;
        var popup = '<strong>' + escapeHtml(n.titel) + '</strong>';
        if (n.km) popup += '<br><small>' + escapeHtml(n.km) + (n.dauer ? ' · ' + escapeHtml(n.dauer) : '') + '</small>';
        popup += '<br><a href="' + detailUrl + '" class="listen-karte-popup-link">Details &rsaquo;</a>';
        var m = L.marker([n._lat, n._lng]).bindPopup(popup);
        markerGroup.addLayer(m);
        bounds.push([n._lat, n._lng]);
      }

      // Treffer-Zaehler aktualisieren
      var trefferEl = document.getElementById('filter-treffer');
      if (trefferEl) {
        var t = gefiltert.length + ' von ' + alleNorm.length + ' Touren angezeigt';
        if (ohneGeoCount > 0) t += ' · ' + ohneGeoCount + ' ohne Track';
        trefferEl.textContent = t;
      }

      // Auto-Zoom nur beim ersten Treffersatz (sonst stoert das beim Filtern)
      if (bounds.length && !map._tourenBoundsGesetzt) {
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
        map._tourenBoundsGesetzt = true;
      } else if (!bounds.length && !map._tourenBoundsGesetzt) {
        map.setView([50.55, 7.65], 9);
        map._tourenBoundsGesetzt = true;
      }
    }

    // Refresh-Callback fuer den Bestaetigen-Button registrieren
    window._tourenKarteRefresh = refreshMarker;

    refreshMarker();
    // Mehrfaches invalidateSize: bei Fenster-Resizes / verzoegertem Layout
    // (Inline-Style greift erst nach naechstem Render-Tick) hilft das,
    // damit Leaflet die richtige Karten-Dimension erkennt.
    setTimeout(function() { map.invalidateSize(); }, 60);
    setTimeout(function() { map.invalidateSize(); }, 250);
    setTimeout(function() { map.invalidateSize(); }, 600);
  });
}


// ════════════════════════════════════════════════════════════════
// POI-KARTE: gemeinsamer GEFILTERT_STATE mit der Listen-Ansicht.
// 1:1 dieselben Filter (Art, Region, Suche) wie auf der Liste; Wechsel
// zwischen Liste und Karte erhaelt die Auswahl.
// ════════════════════════════════════════════════════════════════
function renderPoiKarte(ziel, slug, l) {
  // Aktive Refresh-Callbacks aus anderen Karten verwerfen
  window._tourenKarteRefresh = null;
  window._poiKarteRefresh = null;

  var rohdaten = window[l.datenName] || [];
  if (!rohdaten.length) {
    ziel.innerHTML =
      '<div class="sticky-region" style="z-index:1500;">'
      + navBar('liste/' + slug, l.breadcrumb + ' › <strong>Karte</strong>')
      + '</div>'
      + '<div class="hinweis">Daten noch nicht verfügbar.</div><div class="spacer"></div>';
    return;
  }

  // Items mit Geo-Koordinaten extrahieren (einmalig, vor jedem Filter)
  var mitGeo = [];
  var ohneGeoCount = 0;
  for (var i = 0; i < rohdaten.length; i++) {
    var it = rohdaten[i];
    var lat = it.lat, lng = it.lng;
    if (lat == null || lng == null) {
      ohneGeoCount++;
      continue;
    }
    mitGeo.push({ _orig: it, _globalIdx: i, lat: lat, lng: lng });
  }

  // Damit filterDropdownConfirmListe / setzeGefiltertSuche den richtigen
  // Kontext fuer den Karten-Refresh kennen.
  window._aktuelleGefiltert = { slug: slug, info: l };

  var mapId = 'pkarte-' + Math.random().toString(36).slice(2);

  ziel.innerHTML =
    '<div class="sticky-region">'
      + navBar('liste/' + slug, l.breadcrumb + ' › <strong>Karte</strong>')
      + '<div id="gefiltert-filter-wrap">' + gefiltertFilterUI(l) + '</div>'
    + '</div>'
    + '<div id="gefiltert-treffer" class="filter-treffer">… wird geladen …</div>'
    + '<div class="listen-karte-map-wrap" style="height:60vh;min-height:320px;position:relative;margin:0 12px 12px;z-index:0;isolation:isolate;">'
      + '<div id="' + mapId + '" class="listen-karte-map" style="width:100%;height:100%;min-height:320px;border-radius:8px;overflow:hidden;"></div>'
    + '</div>'
    + '<div class="spacer"></div>';

  ladeKartenPlugins().then(function() {
    if (!window.L) return;
    var map = L.map(mapId);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap-Mitwirkende', maxZoom: 19
    }).addTo(map);
    zeichneLandkreisGrenzen(map);
    var markerGroup = L.layerGroup().addTo(map);

    function refresh() {
      markerGroup.clearLayers();
      // Gefilterte Items (zentrale Funktion -- identisch zur Liste)
      var rohItems = window[l.datenName] || [];
      var gefiltertItems = filterPoiItems(rohItems, l);

      // Index-Lookup fuer schnellen Filter-Check
      var gefiltertSet = {};
      for (var k = 0; k < gefiltertItems.length; k++) {
        gefiltertSet[rohItems.indexOf(gefiltertItems[k])] = true;
      }

      var bounds = [];
      var gezeigt = 0;
      for (var n = 0; n < mitGeo.length; n++) {
        var e = mitGeo[n];
        if (!gefiltertSet[e._globalIdx]) continue;
        var detailUrl = '#detail-karte/' + l.detailKey + '/' + slug + '_' + e._globalIdx;
        var popup = '<strong>' + escapeHtml(e._orig.name || '') + '</strong>';
        if (e._orig.ort) popup += '<br><small>' + escapeHtml(e._orig.ort) + '</small>';
        popup += '<br><a href="' + detailUrl + '" class="listen-karte-popup-link">Details &rsaquo;</a>';
        var m = L.marker([e.lat, e.lng]).bindPopup(popup);
        markerGroup.addLayer(m);
        bounds.push([e.lat, e.lng]);
        gezeigt++;
      }

      var trefferEl = document.getElementById('gefiltert-treffer');
      if (trefferEl) {
        var t = '<strong>' + gezeigt + '</strong> von <strong>' + (mitGeo.length + ohneGeoCount) + '</strong> angezeigt';
        if (ohneGeoCount > 0) t += ' · ' + ohneGeoCount + ' ohne Geo-Daten';
        trefferEl.innerHTML = t;
      }

      if (bounds.length && !map._poiBoundsGesetzt) {
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
        map._poiBoundsGesetzt = true;
      } else if (!bounds.length && !map._poiBoundsGesetzt) {
        map.setView([50.55, 7.65], 9);
        map._poiBoundsGesetzt = true;
      }
    }

    window._poiKarteRefresh = refresh;
    refresh();
    // Mehrfaches invalidateSize: bei Fenster-Resizes / verzoegertem Layout
    // (Inline-Style greift erst nach naechstem Render-Tick) hilft das,
    // damit Leaflet die richtige Karten-Dimension erkennt.
    setTimeout(function() { map.invalidateSize(); }, 60);
    setTimeout(function() { map.invalidateSize(); }, 250);
    setTimeout(function() { map.invalidateSize(); }, 600);
  });
}


function renderListenKarte(ziel, slug) {
  // Welche Datenquelle? POI-Liste (LISTEN[slug]) oder Touren (WANDER_DATEN / RAD_DATEN)?
  var info = null;       // Listen-Konfig (mit titel, breadcrumb, filterTypen)
  var datenName = null;
  var detailKey = null;
  var modus = null;      // 'poi' | 'tour'

  if (slug.indexOf('tourismus-wandern-') === 0) {
    var subW = slug.replace('tourismus-wandern-', '');
    var winfo = WANDER_DATEN[subW];
    if (winfo) {
      modus = 'tour';
      detailKey = 'wandern';
      datenName = winfo.name;
      info = {
        titel: winfo.titel,
        breadcrumb: winfo.breadcrumb,
        untertitel: winfo.untertitel || '',
        zurueck: 'liste/' + slug,
        datenName: datenName,
        detailKey: detailKey,
        filterLabel: 'Schwierigkeit',
        // Filter-Optionen fuer Touren — wir nutzen die in der App schon bekannte normalisierte
        // Schwierigkeitsskala (siehe normalisiere() in app.js)
        filterTypen: [
          {key:'alle',   label:'Alle'},
          {key:'leicht', label:'Leicht'},
          {key:'mittel', label:'Mittel'},
          {key:'schwer', label:'Schwer'}
        ],
        filterBezirke: [
          {key:'alle',   label:'Alle'},
          {key:'AK',     label:'Kreis Altenkirchen'},
          {key:'NR',     label:'Kreis Neuwied'},
          {key:'WW',     label:'Westerwaldkreis'},
          {key:'Hessen', label:'Hessen'},
          {key:'NRW',    label:'NRW'}
        ],
        typErkenner: function(item) {
          var sw = (item.difficulty || '').toLowerCase();
          if (sw.indexOf('leicht') >= 0) return 'leicht';
          if (sw.indexOf('mittel') >= 0) return 'mittel';
          if (sw.indexOf('schwer') >= 0 || sw.indexOf('anspruchsvoll') >= 0) return 'schwer';
          return 'leicht'; // Default wenn unbekannt
        }
      };
    }
  } else if (slug.indexOf('tourismus-radfahren-') === 0) {
    var subR = slug.replace('tourismus-radfahren-', '');
    var rinfo = RAD_DATEN[subR];
    if (rinfo) {
      modus = 'tour';
      detailKey = 'rad';
      datenName = rinfo.name;
      info = {
        titel: rinfo.titel,
        breadcrumb: rinfo.breadcrumb,
        untertitel: rinfo.untertitel || '',
        zurueck: 'liste/' + slug,
        datenName: datenName,
        detailKey: detailKey,
        filterLabel: 'Schwierigkeit',
        filterTypen: [
          {key:'alle',   label:'Alle'},
          {key:'leicht', label:'Leicht'},
          {key:'mittel', label:'Mittel'},
          {key:'schwer', label:'Schwer'}
        ],
        filterBezirke: [
          {key:'alle',   label:'Alle'},
          {key:'AK',     label:'Kreis Altenkirchen'},
          {key:'NR',     label:'Kreis Neuwied'},
          {key:'WW',     label:'Westerwaldkreis'},
          {key:'Hessen', label:'Hessen'},
          {key:'NRW',    label:'NRW'}
        ],
        typErkenner: function(item) {
          var sw = (item.difficulty || '').toLowerCase();
          if (sw.indexOf('leicht') >= 0) return 'leicht';
          if (sw.indexOf('mittel') >= 0) return 'mittel';
          if (sw.indexOf('schwer') >= 0 || sw.indexOf('anspruchsvoll') >= 0) return 'schwer';
          return 'leicht';
        }
      };
    }
  } else {
    // Standard-POI-Modus
    var l = LISTEN[slug];
    if (l && l.datenName) {
      modus = 'poi';
      info = l;
      datenName = l.datenName;
      detailKey = l.detailKey;
    }
  }

  // Touren-Karte hat einen eigenen Render-Pfad: gleiche 4 Filter wie auf der
  // Liste (Schwierigkeit, Dauer, Länge, Region), gemeinsamer FILTER_STATE.
  if (modus === 'tour') {
    return renderTourenKarte(ziel, slug, info, datenName, detailKey);
  }
  // POI-Karte (Ausflugsziele/Gastro/Unterkuenfte): nutzt GEFILTERT_STATE,
  // damit Liste und Karte exakt dieselbe Auswahl zeigen.
  if (modus === 'poi') {
    return renderPoiKarte(ziel, slug, info);
  }

  if (!info || !datenName) {
    ziel.innerHTML = navBar('home','') + intro('Karte nicht verfügbar','')
      + '<div class="hinweis">Liste nicht gefunden.</div>';
    return;
  }

  var alle = window[datenName] || [];
  if (!alle.length) {
    ziel.innerHTML =
      '<div class="sticky-region" style="z-index:1500;">'
      + navBar('liste/' + slug, info.breadcrumb + ' › <strong>Karte</strong>')
      + intro(info.titel, info.untertitel || '')
      + '</div>'
      + '<div class="hinweis">Keine Daten verfügbar.</div>'
      + '<div class="spacer"></div>';
    return;
  }

  // Items "kartenfähig" machen — bei Touren Startpunkt aus _track extrahieren
  // Wir bauen eine Hilfsliste mit { item, globalIdx, lat, lng, name, ort }
  // und filtern Items ohne Geo aus
  var mitGeo = [];
  var ohneGeoCount = 0;
  for (var idx = 0; idx < alle.length; idx++) {
    var it = alle[idx];
    var lat = null, lng = null;
    if (modus === 'tour') {
      // Startpunkt aus item._track[0][0] = [lng, lat, h]
      if (it._track && it._track.length && it._track[0] && it._track[0].length) {
        var pt = it._track[0][0];
        if (pt && pt.length >= 2) { lng = pt[0]; lat = pt[1]; }
      }
    } else {
      lat = it.lat; lng = it.lng;
    }
    if (lat == null || lng == null) { ohneGeoCount++; continue; }
    mitGeo.push({
      _orig: it,
      _globalIdx: idx,
      lat: lat,
      lng: lng,
      name: it.name || it.title || '',
      ort: it.ort || (it._etappeNr ? 'Etappe ' + it._etappeNr : ''),
      plz: it.plz || ''
    });
  }

  // Filter-State pro Slug merken (bleibt erhalten beim Hin- und Herwechseln
  // zwischen Karte und Detail-Seite). Wenn der User aus der Listen-Ansicht
  // kommt und dort Filter aktiv hatte, uebernehmen wir die fuer die Karte.
  window._listenKarteState = window._listenKarteState || {};
  var state = window._listenKarteState[slug];
  // Listen-Filter (GEFILTERT_STATE) hat aktive Werte? -> als Karte-State uebernehmen
  var listeHatFilter = (Object.keys(GEFILTERT_STATE.typ    || {}).length > 0)
                    || (Object.keys(GEFILTERT_STATE.bezirk || {}).length > 0);
  if (!state || listeHatFilter) {
    state = window._listenKarteState[slug] = {
      typ:    Object.assign({}, GEFILTERT_STATE.typ    || {}),
      bezirk: Object.assign({}, GEFILTERT_STATE.bezirk || {}),
      standortGefragt: false,
      eigenerStandort: null
    };
  }

  // Eindeutige ID fuer das Karten-Element (wird in initListenKarte gesucht).
  var mapId = 'lkarte-' + Math.random().toString(36).slice(2);

  // Filter-Sektion: Dropdowns mit "Bestätigen"-Button pro Gruppe.
  // INITIAL alle Checkboxen leer (oder restored aus State).
  var typOpts = (info.filterTypen || []).filter(function(t) { return t.key !== 'alle'; });
  var bezOpts = (info.filterBezirke || []).filter(function(b) { return b.key !== 'alle'; });

  var html =
    '<div class="sticky-region">'
    + navBar('liste/' + slug, info.breadcrumb + ' › <strong>Karte</strong>')
    + intro(info.titel, '')
    + '</div>'
    + '<div class="listen-karte-wrap">'
    + '<div class="listen-karte-filter">';

  if (typOpts.length) {
    html += renderFilterDropdown(
      info.filterLabel || 'Art',
      typOpts, state.typ, 'typ', slug, '🏷️');
  }
  if (bezOpts.length && modus === 'poi') {
    html += renderFilterDropdown('Region', bezOpts, state.bezirk, 'bezirk', slug, '📍');
  }
  html += '<div class="lk-zaehler-row">'
    + '<small id="' + mapId + '-zaehler">'
    + mitGeo.length + ' Einträge mit Standort'
    + (ohneGeoCount > 0 ? ' (' + ohneGeoCount + ' ohne Geo-Daten)' : '')
    + '</small></div>';
  html += '</div>';   // /listen-karte-filter

  html += '<div class="listen-karte-map-wrap" style="height:60vh;min-height:320px;position:relative;margin:0 12px 12px;z-index:0;isolation:isolate;">'
    + '<div id="' + mapId + '" class="listen-karte-map" style="width:100%;height:100%;min-height:320px;border-radius:8px;overflow:hidden;"></div>'
    + '</div>'
    + '</div>';   // /listen-karte-wrap

  ziel.innerHTML = html;

  // Karte initialisieren
  ladeKartenPlugins().then(function() {
    initListenKarte(mapId, slug, info, mitGeo, modus, state);
  });
}


// ──────────────────────────────────────────────────────────────────────
// FILTER-DROPDOWN: Wiederverwendbare Komponente
// Klick auf Header oeffnet ein Panel mit Checkboxen + Bestaetigen-Button.
// "Bestaetigen" wendet die Auswahl an und schliesst das Panel.
// Mehrere aktive Werte: Header zeigt sie kommagetrennt (oder "N gewählt").
// ──────────────────────────────────────────────────────────────────────
function renderFilterDropdown(label, opts, stateObj, group, slug, icon) {
  icon = icon || '';
  // Zaehlbare Zusammenfassung fuer den Dropdown-Header
  var aktivKeys = Object.keys(stateObj);
  var summary;
  if (aktivKeys.length === 0) {
    summary = '<em>nicht gefiltert</em>';
  } else if (aktivKeys.length === opts.length) {
    summary = 'Alle';
  } else if (aktivKeys.length <= 2) {
    // Bei 1-2 Eintraegen Namen anzeigen
    var names = [];
    for (var i = 0; i < opts.length; i++) {
      if (stateObj[opts[i].key]) names.push(opts[i].label);
    }
    summary = names.join(', ');
  } else {
    summary = aktivKeys.length + ' gewählt';
  }

  var dropdownId = 'fd-' + group + '-' + Math.random().toString(36).slice(2, 7);
  var html = '<div class="filter-dropdown" data-filter-dropdown="' + dropdownId + '">'
    + '<button type="button" class="filter-dropdown-head" onclick="toggleFilterDropdown(\'' + dropdownId + '\')">'
    +   '<span class="filter-dropdown-label">' + icon + ' ' + escapeHtml(label) + '</span>'
    +   '<span class="filter-dropdown-summary">' + summary + '</span>'
    +   '<span class="filter-dropdown-arrow">▾</span>'
    + '</button>'
    + '<div class="filter-dropdown-panel" id="' + dropdownId + '">'
    +   '<div class="filter-dropdown-opts">';
  for (var j = 0; j < opts.length; j++) {
    var o = opts[j];
    var checked = stateObj[o.key] ? ' checked' : '';
    html += '<label class="filter-dropdown-check">'
      + '<input type="checkbox"' + checked + ' data-dd-key="' + escapeHtml(o.key) + '"> '
      + escapeHtml(o.label) + '</label>';
  }
  html += '</div>'
    +   '<div class="filter-dropdown-bar">'
    +     '<button type="button" class="filter-dropdown-clear" onclick="filterDropdownClear(\'' + dropdownId + '\')">Zurücksetzen</button>'
    +     '<button type="button" class="filter-dropdown-confirm" onclick="filterDropdownConfirm(\'' + dropdownId + '\',\'' + group + '\',\'' + escapeHtml(slug) + '\')">Bestätigen</button>'
    +   '</div>'
    + '</div></div>';
  return html;
}

function toggleFilterDropdown(id) {
  // Andere offene Dropdowns schliessen
  var alle = document.querySelectorAll('.filter-dropdown-panel.offen');
  for (var i = 0; i < alle.length; i++) {
    if (alle[i].id !== id) alle[i].classList.remove('offen');
  }
  var panel = document.getElementById(id);
  if (panel) panel.classList.toggle('offen');
}

function filterDropdownClear(id) {
  var panel = document.getElementById(id);
  if (!panel) return;
  var checks = panel.querySelectorAll('input[type="checkbox"]');
  for (var i = 0; i < checks.length; i++) checks[i].checked = false;
}

function filterDropdownConfirm(id, group, slug) {
  var panel = document.getElementById(id);
  if (!panel) return;
  // State updaten (Listen-Karte): _listenKarteState[slug][group] = {key: true, ...}
  var lkState = window._listenKarteState && window._listenKarteState[slug];
  if (lkState && lkState[group]) {
    // alte Werte clearen
    for (var k in lkState[group]) delete lkState[group][k];
    var checks = panel.querySelectorAll('input[type="checkbox"]');
    for (var i = 0; i < checks.length; i++) {
      if (checks[i].checked) {
        lkState[group][checks[i].getAttribute('data-dd-key')] = true;
      }
    }
  }
  // Panel schliessen
  panel.classList.remove('offen');
  // Refresh ausloesen via globalen Callback (siehe initListenKarte)
  if (typeof window._listenKarteRefresh === 'function') {
    window._listenKarteRefresh();
  }
  // Summary im Header aktualisieren: am einfachsten den Renderer komplett
  // neu aufrufen geht hier nicht. Stattdessen Summary in-place updaten.
  _updateFilterDropdownSummary(id, group, slug);
}

// Aktualisiert den Summary-Text im Dropdown-Header nach Bestaetigen.
function _updateFilterDropdownSummary(id, group, slug) {
  var panel = document.getElementById(id);
  if (!panel) return;
  var head = panel.parentNode.querySelector('.filter-dropdown-summary');
  if (!head) return;
  var checked = panel.querySelectorAll('input[type="checkbox"]:checked');
  var total = panel.querySelectorAll('input[type="checkbox"]').length;
  if (checked.length === 0) {
    head.innerHTML = '<em>nicht gefiltert</em>';
  } else if (checked.length === total) {
    head.textContent = 'Alle';
  } else if (checked.length <= 2) {
    var labels = [];
    for (var i = 0; i < checked.length; i++) {
      var lab = checked[i].parentNode.textContent.trim();
      labels.push(lab);
    }
    head.textContent = labels.join(', ');
  } else {
    head.textContent = checked.length + ' gewählt';
  }
}


// Zeichnet die drei Westerwald-Landkreise (AK, NR, WW) als hellgrüne Flächen
// mit dunklerer Outline auf die uebergebene Leaflet-Karte. Die Daten liegen
// in window.LANDKREISE_WESTERWALD (geladen aus landkreise-westerwald.js).
// Falls die Daten fehlen, geschieht nichts (kein Fehler).
function zeichneLandkreisGrenzen(map) {
  if (!window.L || !window.LANDKREISE_WESTERWALD) return;
  try {
    L.geoJSON(window.LANDKREISE_WESTERWALD, {
      style: {
        color:       '#1d6b3e',    // dunkelgruene Outline
        weight:      2,
        opacity:     0.85,
        fillColor:   '#7ec887',    // hellgruene Fuellung
        fillOpacity: 0.15
      },
      interactive: false   // Klicks gehen durch auf die Marker
    }).addTo(map);
  } catch (e) {
    console.warn('[Landkreis-Grenzen] konnten nicht gezeichnet werden:', e);
  }
}


function initListenKarte(mapId, slug, info, mitGeo, modus, state) {
  if (!window.L) return;
  var map = L.map(mapId);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap-Mitwirkende',
    maxZoom: 19
  }).addTo(map);

  // Verwaltungsgrenzen AK/NR/WW als hellgruene Flaeche einzeichnen
  zeichneLandkreisGrenzen(map);

  var markerGroup = L.layerGroup().addTo(map);

  function refreshMarker() {
    markerGroup.clearLayers();
    var aktivTyp = state.typ;
    var aktivBez = state.bezirk;
    var hatTypOpts = !!(info.filterTypen && info.filterTypen.length);
    var hatBezOpts = !!(info.filterBezirke && info.filterBezirke.length);

    // Anzahl waehlbarer Optionen pro Gruppe (ohne pseudo-Key 'alle')
    var typOptsCount = 0, bezOptsCount = 0;
    if (hatTypOpts) {
      for (var ti = 0; ti < info.filterTypen.length; ti++) {
        if (info.filterTypen[ti].key !== 'alle') typOptsCount++;
      }
    }
    if (hatBezOpts) {
      for (var bi = 0; bi < info.filterBezirke.length; bi++) {
        if (info.filterBezirke[bi].key !== 'alle') bezOptsCount++;
      }
    }

    var typAktivCount = Object.keys(aktivTyp).length;
    var bezAktivCount = Object.keys(aktivBez).length;
    // Filter ist nur "echt aktiv" wenn 1..(n-1) Checkboxen gesetzt sind --
    // wenn ALLE gesetzt sind, soll das wie "kein Filter" wirken (also auch
    // Items ohne zugeordneten Typ/Bezirk werden gezeigt). Sonst kann die
    // Summe auf der Karte nie die Liste erreichen.
    var typFilterAktiv = typAktivCount > 0 && typAktivCount < typOptsCount;
    var bezFilterAktiv = bezAktivCount > 0 && bezAktivCount < bezOptsCount;
    // Wenigstens EINE Checkbox aktiv? (Sonst leere Karte)
    var irgendeinFilterGesetzt = typAktivCount > 0 || bezAktivCount > 0;

    var zaehlEl = document.getElementById(mapId + '-zaehler');

    if (!irgendeinFilterGesetzt) {
      if (zaehlEl) zaehlEl.textContent = '0 Einträge angezeigt – bitte Filter aktivieren';
      if (!map._listenKarteBoundsGesetzt) {
        map.setView([50.55, 7.65], 9);
        map._listenKarteBoundsGesetzt = true;
      }
      return;
    }

    var bounds = [];
    var gezeigt = 0;
    for (var n = 0; n < mitGeo.length; n++) {
      var e = mitGeo[n];
      var it = e._orig;
      if (typFilterAktiv && info.typErkenner) {
        var tk = info.typErkenner(it);
        if (!aktivTyp[tk]) continue;
      }
      if (bezFilterAktiv) {
        var bk = plzZuBezirk(e.plz);
        if (!aktivBez[bk]) continue;
      }
      var detailUrl = '#detail-karte/' + info.detailKey + '/' + slug + '_' + e._globalIdx;
      var popup = '<strong>' + escapeHtml(e.name) + '</strong>';
      if (e.ort) popup += '<br><small>' + escapeHtml(e.ort) + '</small>';
      popup += '<br><a href="' + detailUrl + '" class="listen-karte-popup-link">Details &rsaquo;</a>';
      var m = L.marker([e.lat, e.lng]).bindPopup(popup);
      markerGroup.addLayer(m);
      bounds.push([e.lat, e.lng]);
      gezeigt++;
    }

    if (bounds.length && !map._listenKarteBoundsGesetzt) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
      map._listenKarteBoundsGesetzt = true;
    }
    if (zaehlEl) {
      // Praeziser Zaehler: zeigt was sichtbar ist UND was wegen fehlender
      // Geo-Koordinaten gar nicht erst auf die Karte konnte.
      var gesamt = mitGeo.length + ohneGeoCount;
      var txt = gezeigt + ' von ' + gesamt + ' angezeigt';
      if (ohneGeoCount > 0) txt += ' · ' + ohneGeoCount + ' ohne Geo-Daten (nicht kartierbar)';
      zaehlEl.textContent = txt;
    }
  }

  // Refresh als globalen Callback hinterlegen, damit der Dropdown-Bestaetigen-Button
  // ihn aufrufen kann (siehe filterDropdownConfirm()).
  window._listenKarteRefresh = refreshMarker;

  refreshMarker();
  // Layout-Race-Condition: Karte braucht eine Pause, bis das Wrap-Element seine
  // Hoehe hat, bevor sie sich selbst layoutet.
  setTimeout(function() { map.invalidateSize(); }, 60);
  setTimeout(function() { map.invalidateSize(); }, 250);
  setTimeout(function() { map.invalidateSize(); }, 600);

  // STANDORT-HANDLING ----------------------------------------------------
  if (state.eigenerStandort) {
    // Bei Wiederbesuch: Standort schon bekannt → Marker direkt setzen, ohne Banner
    setzeListenKarteStandortMarker(map, state.eigenerStandort[0], state.eigenerStandort[1]);
  } else if (!state.standortGefragt) {
    // Erster Besuch: Banner anzeigen (wie bei Wanderkarten-Etappen)
    fuegeStandortBannerHinzu(map, {
      onJa: function(coords) {
        state.standortGefragt = true;
        state.eigenerStandort = coords;
      },
      onNein: function() {
        state.standortGefragt = true;
        // eigenerStandort bleibt null -> bei naechstem Aufruf wird NICHT erneut gefragt
      },
      onFehler: function() {
        state.standortGefragt = true;
      }
    });
  }
  // Wenn state.standortGefragt === true und kein eigenerStandort → Nutzer hat "Nein" gesagt: nichts tun
}


// Setzt einen blauen Standort-Marker auf die Karte (ohne Geolocation-Abfrage,
// fuer den Fall dass die Koordinaten schon bekannt sind).
function setzeListenKarteStandortMarker(map, lat, lng) {
  if (!window.L) return;
  var standortIcon = L.divIcon({
    className: 'eigener-standort-icon',
    html: '<div style="width:18px;height:18px;background:#2196f3;border:3px solid #fff;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,0.4);"></div>',
    iconSize: [18, 18],
    iconAnchor: [9, 9]
  });
  L.marker([lat, lng], { icon: standortIcon })
    .addTo(map)
    .bindPopup('<strong>📍 Mein Standort</strong>');
}


// ════════════════════════════════════════════════════════════════════════
// VERANSTALTUNGEN-KARTE: alle Termine als Marker, mit Multi-Select-Filtern
// (Datum, Region, Art). Initial alles deaktiviert -> keine Marker.
// Filter-State persistiert in window._listenKarteState['veranstaltungen-alle'].
// ════════════════════════════════════════════════════════════════════════

function renderVeranstaltungenKarte(ziel) {
  // Karten-Refresh-Callbacks anderer Karten aufraeumen
  window._tourenKarteRefresh = null;
  window._poiKarteRefresh = null;
  window._termineKarteRefresh = null;

  var alle = window.DATA_VERANSTALTUNGEN_ALLE || [];
  if (!alle.length) {
    ziel.innerHTML =
      '<div class="sticky-region" style="z-index:1500;">'
      + navBar('liste/veranstaltungen-alle', 'Veranstaltungen › <strong>Karte</strong>')
      + '</div>'
      + '<div class="hinweis">Keine Veranstaltungen verfügbar.</div>'
      + '<div class="spacer"></div>';
    return;
  }

  // Items mit Geo-Koordinaten extrahieren
  var mitGeo = [];
  var ohneGeoCount = 0;
  for (var idx = 0; idx < alle.length; idx++) {
    var ev = alle[idx];
    var lat = ev.lat ? parseFloat(ev.lat) : null;
    var lng = ev.lng ? parseFloat(ev.lng) : null;
    if (isNaN(lat) || isNaN(lng) || lat == null || lng == null) {
      ohneGeoCount++;
      continue;
    }
    mitGeo.push({ _orig: ev, _globalIdx: idx, lat: lat, lng: lng });
  }

  // Damit filterDropdownConfirmTermine + setzeTermineSuche + termineEigenAnwenden
  // den Karten-Refresh ausloesen koennen.
  window._aktuelleTermine = { slug: 'veranstaltungen-alle', info: {datenName:'DATA_VERANSTALTUNGEN_ALLE'} };

  var mapId = 'vkarte-' + Math.random().toString(36).slice(2);

  ziel.innerHTML =
    '<div class="sticky-region">'
      + navBar('liste/veranstaltungen-alle', 'Veranstaltungen › <strong>Karte</strong>')
      + '<div id="termine-filter-wrap">' + termineFilterUI() + '</div>'
    + '</div>'
    + '<div id="termine-treffer" class="filter-treffer">… wird geladen …</div>'
    + '<div class="listen-karte-map-wrap" style="height:60vh;min-height:320px;position:relative;margin:0 12px 12px;z-index:0;isolation:isolate;">'
      + '<div id="' + mapId + '" class="listen-karte-map" style="width:100%;height:100%;min-height:320px;border-radius:8px;overflow:hidden;"></div>'
    + '</div>'
    + '<div class="spacer"></div>';

  ladeKartenPlugins().then(function() {
    if (!window.L) return;
    var map = L.map(mapId);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap-Mitwirkende', maxZoom: 19
    }).addTo(map);
    zeichneLandkreisGrenzen(map);
    var markerGroup = L.layerGroup().addTo(map);

    function refresh() {
      markerGroup.clearLayers();
      // Gleiche Filter-Logik wie auf der Liste
      var rohItems = window.DATA_VERANSTALTUNGEN_ALLE || [];
      var gefiltertItems = termineFilterAnwenden(rohItems);
      var gefiltertSet = {};
      for (var k = 0; k < gefiltertItems.length; k++) {
        gefiltertSet[rohItems.indexOf(gefiltertItems[k])] = true;
      }

      var bounds = [];
      var gezeigt = 0;
      for (var n = 0; n < mitGeo.length; n++) {
        var e = mitGeo[n];
        if (!gefiltertSet[e._globalIdx]) continue;
        var detailUrl = '#detail-karte/event/veranstaltungen-alle_' + e._globalIdx;
        var popup = '<strong>' + escapeHtml(e._orig.titel || '') + '</strong>';
        if (e._orig.datum) popup += '<br><small>' + escapeHtml(e._orig.datum) + (e._orig.zeit ? ' · ' + escapeHtml(e._orig.zeit) : '') + '</small>';
        if (e._orig.ort) popup += '<br><small>📍 ' + escapeHtml(e._orig.ort) + '</small>';
        popup += '<br><a href="' + detailUrl + '" class="listen-karte-popup-link">Details &rsaquo;</a>';
        var m = L.marker([e.lat, e.lng]).bindPopup(popup);
        markerGroup.addLayer(m);
        bounds.push([e.lat, e.lng]);
        gezeigt++;
      }

      var trefferEl = document.getElementById('termine-treffer');
      if (trefferEl) {
        var t = '<strong>' + gezeigt + '</strong> von <strong>' + (mitGeo.length + ohneGeoCount) + '</strong> angezeigt';
        if (ohneGeoCount > 0) t += ' · ' + ohneGeoCount + ' ohne Geo-Daten';
        trefferEl.innerHTML = t;
      }

      if (bounds.length && !map._vBoundsGesetzt) {
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
        map._vBoundsGesetzt = true;
      } else if (!bounds.length && !map._vBoundsGesetzt) {
        map.setView([50.55, 7.65], 9);
        map._vBoundsGesetzt = true;
      }
    }

    window._termineKarteRefresh = refresh;
    refresh();
    // Mehrfaches invalidateSize: bei Fenster-Resizes / verzoegertem Layout
    // (Inline-Style greift erst nach naechstem Render-Tick) hilft das,
    // damit Leaflet die richtige Karten-Dimension erkennt.
    setTimeout(function() { map.invalidateSize(); }, 60);
    setTimeout(function() { map.invalidateSize(); }, 250);
    setTimeout(function() { map.invalidateSize(); }, 600);
  });
}


// ════════════════════════════════════════════════════════════════════════
// UNTERKUNFT-BUCHUNG (iFrame zu westerwald.info/tosc5)
// Oeffnet die TOSC5-Buchungsseite einer Unterkunft direkt in der App.
// Manche Browser blockieren TOSC5 in iFrames (X-Frame-Options/CSP) -- in
// dem Fall sieht der Nutzer den Fallback-Link.
// ════════════════════════════════════════════════════════════════════════
function renderUnterkunftBuchung(ziel, feratelUuid, slug) {
  if (!feratelUuid) {
    ziel.innerHTML = navBar('home', '<strong>Verfügbarkeit</strong>')
      + '<div class="hinweis">Keine Buchungs-ID hinterlegt.</div>';
    return;
  }
  var tosc5Url = 'https://www.westerwald.info/tosc5/unterkuenfte'
    + '?limACCMARK=651a30e3-af0e-4021-8bfa-31a4e26828e6'
    + '#/unterkuenfte/RPT/' + encodeURIComponent(feratelUuid)
    + (slug ? '/' + encodeURIComponent(slug) : '')
    + '?useDetailSearch=false';

  ziel.innerHTML =
    navBar('back', 'Verfügbarkeit')
    + '<div class="buchung-iframe-wrap">'
    +   '<iframe class="buchung-iframe" src="' + escapeHtml(tosc5Url) + '" '
    +     'title="Verfügbarkeit prüfen" '
    +     'allow="payment" '
    +     'referrerpolicy="no-referrer-when-downgrade"></iframe>'
    +   '<a class="buchung-neuer-tab" href="' + escapeHtml(tosc5Url) + '" '
    +     'target="_blank" rel="noopener" '
    +     'title="Im neuen Tab öffnen – dort hast Du den vollen Bildschirm">↗ Vollbild</a>'
    + '</div>';
}


// ════════════════════════════════════════════════════════════════════════
// SLIDESHOW: Modal-Overlay mit Vor/Zurück, Counter, Caption, ESC schliesst.
// Wird ueberall benutzt wo ein Item mehrere Bilder hat (Unterkuenfte,
// Ausflugsziele, Wandern/Rad-Etappen, Veranstaltungen).
// Bilder kommen aus item._bilder = [{url, autor, lizenz, caption}, ...]
// ════════════════════════════════════════════════════════════════════════
function oeffneSlideshow(bilder, startIdx) {
  if (!bilder || !bilder.length) return;
  startIdx = (typeof startIdx === 'number' && startIdx >= 0 && startIdx < bilder.length) ? startIdx : 0;
  window._slideshowState = { bilder: bilder, idx: startIdx };

  // Falls noch eine Slideshow offen ist: erst schliessen
  var alt = document.getElementById('slideshow-overlay');
  if (alt) alt.parentNode.removeChild(alt);

  var ov = document.createElement('div');
  ov.id = 'slideshow-overlay';
  ov.className = 'slideshow-overlay';
  ov.innerHTML =
    '<div class="slideshow-top-bar">'
    +   '<div class="slideshow-counter" id="slideshow-counter"></div>'
    +   '<button type="button" class="slideshow-close" onclick="schliesseSlideshow()" aria-label="Schließen">×</button>'
    + '</div>'
    + '<div class="slideshow-bild-wrap">'
    +   '<button type="button" class="slideshow-nav slideshow-prev" onclick="slideshowPrev()" aria-label="Vorheriges Bild">‹</button>'
    +   '<img class="slideshow-bild" id="slideshow-bild" alt="">'
    +   '<button type="button" class="slideshow-nav slideshow-next" onclick="slideshowNext()" aria-label="Nächstes Bild">›</button>'
    + '</div>'
    + '<div class="slideshow-caption" id="slideshow-caption"></div>';
  document.body.appendChild(ov);
  document.body.classList.add('slideshow-aktiv');   // verhindert Body-Scroll

  // Klick auf Hintergrund (nicht auf Bild/Buttons) schliesst
  ov.addEventListener('click', function(e) {
    if (e.target === ov || e.target.classList.contains('slideshow-bild-wrap')) {
      schliesseSlideshow();
    }
  });
  // ESC / Pfeiltasten
  document.addEventListener('keydown', _slideshowKeyHandler);
  // Touch-Swipe (links/rechts) fuer Mobile
  var touchStartX = 0;
  ov.addEventListener('touchstart', function(e) {
    touchStartX = e.changedTouches[0].clientX;
  });
  ov.addEventListener('touchend', function(e) {
    var dx = e.changedTouches[0].clientX - touchStartX;
    if (Math.abs(dx) > 40) {
      if (dx < 0) slideshowNext(); else slideshowPrev();
    }
  });

  zeichneSlideshowBild();
}

function zeichneSlideshowBild() {
  var s = window._slideshowState;
  if (!s) return;
  var b = s.bilder[s.idx];
  var imgEl = document.getElementById('slideshow-bild');
  var capEl = document.getElementById('slideshow-caption');
  var counterEl = document.getElementById('slideshow-counter');
  if (imgEl) {
    imgEl.src = b.url || '';
    imgEl.alt = b.caption || '';
  }
  if (counterEl) counterEl.textContent = (s.idx + 1) + ' / ' + s.bilder.length;
  if (capEl) {
    var parts = [];
    if (b.caption) parts.push(escapeHtml(b.caption));
    if (b.autor || b.lizenz) {
      var credit = [];
      if (b.autor)  credit.push('© ' + escapeHtml(b.autor));
      if (b.lizenz) credit.push(escapeHtml(b.lizenz));
      parts.push('<span class="slideshow-credit">' + credit.join(' · ') + '</span>');
    }
    capEl.innerHTML = parts.join(' — ') || '&nbsp;';
  }
  // Pfeile ausblenden falls nur 1 Bild
  var navs = document.querySelectorAll('.slideshow-nav');
  for (var i = 0; i < navs.length; i++) navs[i].style.display = s.bilder.length > 1 ? '' : 'none';
}

function slideshowNext() {
  var s = window._slideshowState; if (!s) return;
  s.idx = (s.idx + 1) % s.bilder.length;
  zeichneSlideshowBild();
}
function slideshowPrev() {
  var s = window._slideshowState; if (!s) return;
  s.idx = (s.idx - 1 + s.bilder.length) % s.bilder.length;
  zeichneSlideshowBild();
}
function schliesseSlideshow() {
  var ov = document.getElementById('slideshow-overlay');
  if (ov) ov.parentNode.removeChild(ov);
  document.body.classList.remove('slideshow-aktiv');
  document.removeEventListener('keydown', _slideshowKeyHandler);
  window._slideshowState = null;
}
function _slideshowKeyHandler(e) {
  if (e.key === 'Escape')     schliesseSlideshow();
  else if (e.key === 'ArrowRight') slideshowNext();
  else if (e.key === 'ArrowLeft')  slideshowPrev();
}

// Trigger-Helper fuer den onclick im Foto-Button: liest die aktuell
// gerenderte Bilder-Liste aus window._aktiveBilder (wird beim Render des
// Detail-Eintrags gesetzt). So muss der Button nicht das ganze Array
// inline als JSON tragen.
function oeffneAktiveSlideshow() {
  oeffneSlideshow(window._aktiveBilder || [], 0);
}


// ════════════════════════════════════════════════════════════════════════
// VERFUEGBARKEITS-ANFRAGE: Eigene Eingabe-Maske statt iFrame.
// Drei Wege zur Anfrage je nach verfuegbaren Kontaktdaten:
//   1. E-Mail (mailto:)  - Vermieter bekommt die Anfrage direkt
//   2. Telefon (tel:)    - native Anruf-App des Geraets
//   3. Online-Buchung    - TOSC5 mit best-effort URL-Parametern fuer Datum
// ════════════════════════════════════════════════════════════════════════
function renderUnterkunftAnfrage(ziel, idx) {
  var alle = window.DATA_UNTERKUENFTE_DH || [];
  var item = (idx >= 0 && idx < alle.length) ? alle[idx] : null;
  if (!item) {
    ziel.innerHTML = navBar('home', '<strong>Verfügbarkeit</strong>')
      + '<div class="hinweis">Unterkunft nicht gefunden.</div>';
    return;
  }

  function isoDate(d) {
    var pad = function(n) { return String(n).padStart(2,'0'); };
    return d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate());
  }
  var heute = new Date();
  var morgen = new Date(heute.getTime() + 24*60*60*1000);
  var inEinerWoche = new Date(heute.getTime() + 8*24*60*60*1000);
  var defaultAn = isoDate(morgen);
  var defaultAb = isoDate(inEinerWoche);
  var minDate = isoDate(heute);

  // Kontaktdaten extrahieren
  var email = (item.contact && item.contact.email) || '';
  var phone = (item.contact && item.contact.phone) || '';
  var webseite = (item.contact && item.contact.url) || '';
  var telLink = phone.replace(/[^\d+]/g, '');

  // State im Window halten (fuer die Button-Handler)
  window._aktivesAnfrageItem = { idx: idx, item: item };

  var hatTosc5 = !!item.feratelUuid;
  var initialUrl = hatTosc5 ? baueTosc5Url(item, defaultAn, defaultAb, 2, 0) : '';

  var html =
    navBar('detail/unterkunft/tourismus-unterkuenfte_' + idx, 'Verfügbarkeit prüfen')

    // 1) EINGABE-LEISTE
    + '<div class="anfrage-bar">'
    +   '<div class="anfrage-bar-row">'
    +     '<div class="anfrage-bar-feld">'
    +       '<label for="anf-an">Anreise</label>'
    +       '<input type="date" id="anf-an" value="' + defaultAn + '" min="' + minDate + '">'
    +     '</div>'
    +     '<div class="anfrage-bar-feld">'
    +       '<label for="anf-ab">Abreise</label>'
    +       '<input type="date" id="anf-ab" value="' + defaultAb + '" min="' + minDate + '">'
    +     '</div>'
    +   '</div>'
    +   '<div class="anfrage-bar-row anfrage-bar-row-pers">'
    +     '<div class="anfrage-bar-feld">'
    +       '<label for="anf-erw">Erw.</label>'
    +       '<input type="number" id="anf-erw" value="2" min="1" max="20" inputmode="numeric">'
    +     '</div>'
    +     '<div class="anfrage-bar-feld">'
    +       '<label for="anf-kin">Kinder</label>'
    +       '<input type="number" id="anf-kin" value="0" min="0" max="10" inputmode="numeric">'
    +     '</div>'
    +   '</div>'
    + '</div>'

    // 2) AKTIONS-BUTTONS (funktionieren GARANTIERT, unabhängig von TOSC5)
    + '<div class="anfrage-aktionen-bar">';
  if (email) {
    html += '<button type="button" class="anf-aktion anf-aktion-mail" onclick="anfrageMailSenden()">'
      + '📧 <span>Per E-Mail anfragen</span></button>';
  }
  if (telLink) {
    html += '<a href="tel:' + escapeHtml(telLink) + '" class="anf-aktion anf-aktion-tel">'
      + '📞 <span>Anrufen</span></a>';
  }
  html += '<button type="button" class="anf-aktion anf-aktion-copy" onclick="anfrageDatenKopieren()">'
    + '📋 <span>Daten kopieren</span></button>';
  html += '</div>';

  // 3) Erklärung wenn iFrame da
  if (hatTosc5) {
    html += '<div class="anfrage-hinweis-bar">'
      +   '<span class="anfrage-hinweis-icon">ℹ️</span>'
      +   'Auf <strong>westerwald.info</strong> unten musst Du Datum und Personen leider erneut eingeben — wir können das Datenfeld dort aus Sicherheitsgründen nicht direkt befüllen. '
      +   'Tipp: <strong>Daten kopieren</strong> oben drücken und in die TOSC5-Felder unten paste-en.'
      + '</div>'
      + '<div class="buchung-iframe-wrap">'
      +   '<iframe id="tosc5-frame" class="buchung-iframe" src="' + escapeHtml(initialUrl) + '" '
      +     'title="Verfügbarkeit prüfen" allow="payment" '
      +     'referrerpolicy="no-referrer-when-downgrade"></iframe>'
      +   '<a class="buchung-neuer-tab" href="' + escapeHtml(initialUrl) + '" '
      +     'target="_blank" rel="noopener" id="anfrage-tab-btn" title="Im neuen Tab öffnen">↗ Vollbild</a>'
      + '</div>';
  }

  // Wenn weder Email noch Tel noch TOSC5 da
  if (!email && !telLink && !hatTosc5) {
    html += '<div class="hinweis">Für diese Unterkunft sind keine Kontaktdaten hinterlegt. '
      + (webseite ? 'Bitte besuche die <a href="' + escapeHtml(webseite) + '" target="_blank" rel="noopener">Webseite</a>.' : 'Bitte kontaktiere den Anbieter direkt.') + '</div>';
  }

  ziel.innerHTML = html;
}

// Liest die Werte aus dem Eingabe-Bar und gibt ein normiertes Objekt zurueck.
function _liesAnfrageBar() {
  var anEl = document.getElementById('anf-an');
  var abEl = document.getElementById('anf-ab');
  var erwEl = document.getElementById('anf-erw');
  var kinEl = document.getElementById('anf-kin');
  if (!anEl || !abEl) return null;
  var an = anEl.value, ab = abEl.value;
  if (an && ab && an >= ab) {
    alert('Bitte ein Abreise-Datum NACH der Anreise wählen.');
    return null;
  }
  if (!an || !ab) {
    alert('Bitte Anreise- und Abreise-Datum angeben.');
    return null;
  }
  function isoToDe(iso) {
    var p = iso.split('-');
    return p[2] + '.' + p[1] + '.' + p[0];
  }
  return {
    anIso: an, abIso: ab,
    anDe: isoToDe(an), abDe: isoToDe(ab),
    erw: parseInt((erwEl && erwEl.value) || '2', 10),
    kin: parseInt((kinEl && kinEl.value) || '0', 10)
  };
}

function baueTosc5Url(item, anIso, abIso, erw, kin) {
  var slug = item.slug || '';
  return 'https://www.westerwald.info/tosc5/unterkuenfte'
    + '?limACCMARK=651a30e3-af0e-4021-8bfa-31a4e26828e6'
    + '#/unterkuenfte/RPT/' + encodeURIComponent(item.feratelUuid)
    + (slug ? '/' + encodeURIComponent(slug) : '')
    + '?useDetailSearch=false';
}

// Sendet eine fertig formulierte E-Mail an den Vermieter.
function anfrageMailSenden() {
  var ctx = window._aktivesAnfrageItem;
  if (!ctx || !ctx.item) return;
  var item = ctx.item;
  if (!item.contact || !item.contact.email) {
    alert('Keine E-Mail-Adresse hinterlegt für diese Unterkunft.');
    return;
  }
  var w = _liesAnfrageBar(); if (!w) return;
  var personen = w.erw + ' Erwachsene' + (w.kin > 0 ? ' + ' + w.kin + ' Kind(er)' : '');
  var subject = 'Verfügbarkeits-Anfrage ' + item.name + ' (' + w.anDe + ' – ' + w.abDe + ')';
  var body = 'Hallo,\n\n'
    + 'ich interessiere mich für eine Unterkunft bei Ihnen und möchte folgenden Zeitraum anfragen:\n\n'
    + '  Anreise:    ' + w.anDe + '\n'
    + '  Abreise:    ' + w.abDe + '\n'
    + '  Personen:   ' + personen + '\n\n'
    + 'Bitte teilen Sie mir mit, ob in diesem Zeitraum eine Unterkunft verfügbar ist und welche Konditionen gelten.\n\n'
    + 'Vielen Dank und freundliche Grüße\n';
  var mailtoUrl = 'mailto:' + encodeURIComponent(item.contact.email)
    + '?subject=' + encodeURIComponent(subject)
    + '&body=' + encodeURIComponent(body);
  window.location.href = mailtoUrl;
}

// Kopiert die formulierte Anfrage in die Zwischenablage. Nutzer kann sie
// dann ins TOSC5 oder in eine eigene Mail paste-en. Funktioniert auch dort
// wo mailto: nicht zuverlaessig ist (z.B. wenn kein Mail-Programm registriert).
function anfrageDatenKopieren() {
  var w = _liesAnfrageBar(); if (!w) return;
  var personen = w.erw + ' Erwachsene' + (w.kin > 0 ? ' + ' + w.kin + ' Kind(er)' : '');
  var text = 'Anreise: ' + w.anDe + '\n'
    + 'Abreise: ' + w.abDe + '\n'
    + 'Personen: ' + personen;
  // Modern Clipboard API mit Fallback fuer aeltere Browser
  var fertig = function() {
    var btn = document.querySelector('.anf-aktion-copy span');
    if (btn) {
      var old = btn.textContent;
      btn.textContent = '✓ Kopiert!';
      setTimeout(function() { btn.textContent = old; }, 1500);
    }
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(fertig).catch(function() {
      _kopiereFallback(text); fertig();
    });
  } else {
    _kopiereFallback(text); fertig();
  }
}
function _kopiereFallback(text) {
  var ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.left = '-1000px';
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); } catch (e) {}
  document.body.removeChild(ta);
}
