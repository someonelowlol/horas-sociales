// Fresh-user / demo state for dashboards (student + teacher).
// Activated by ?demo=1, ?new=1, or the stored horasocial_new_user /
// horasocial_demo flags. Renders zero counters, empty lists with a
// "sin registros" note, and a welcome banner. Defensive by design:
// every lookup is guarded so missing nodes never throw.
(function () {
  'use strict';

  var NEW_KEY = 'horasocial_new_user';
  var DEMO_KEY = 'horasocial_demo';

  function readFlag(key) {
    try { return window.localStorage.getItem(key) === '1'; } catch (err) { return false; }
  }

  function writeFlag(key, value) {
    try {
      if (value) window.localStorage.setItem(key, '1');
      else window.localStorage.removeItem(key);
    } catch (err) {}
  }

  var params = new URLSearchParams(window.location.search || '');
  var isDemo = params.get('demo') === '1' || readFlag(DEMO_KEY);
  var isNew = params.get('new') === '1' || readFlag(NEW_KEY);
  if (params.get('demo') === '1') writeFlag(DEMO_KEY, true);
  if (params.get('new') === '1') writeFlag(NEW_KEY, true);
  if (!isDemo && !isNew) return;

  function setText(node, text) {
    if (node) node.textContent = text;
  }

  function emptyNote() {
    var note = document.createElement('div');
    note.className = 'hs-empty-note';
    note.textContent = 'Sin registros todavía';
    return note;
  }

  function showWelcomeBanner() {
    var host = document.querySelector('.wrap') || document.body;
    if (!host || document.querySelector('.hs-welcome-banner')) return;
    var banner = document.createElement('div');
    banner.className = 'hs-welcome-banner';
    banner.setAttribute('role', 'status');
    var title = isDemo ? '¡Bienvenido a la demo!' : '¡Bienvenido a Horasocial Pro!';
    var body = isDemo
      ? 'Estás explorando con una cuenta nueva: 0 horas y listas vacías.'
      : 'Tu cuenta es nueva: tienes 0 horas y ningún registro todavía. Explorá las actividades disponibles para empezar.';
    var text = document.createElement('div');
    var heading = document.createElement('b');
    heading.textContent = title;
    var sub = document.createElement('span');
    sub.textContent = ' ' + body;
    text.appendChild(heading);
    text.appendChild(sub);
    var close = document.createElement('button');
    close.type = 'button';
    close.className = 'hs-welcome-close';
    close.textContent = 'Entendido';
    close.addEventListener('click', function () { banner.remove(); });
    banner.appendChild(text);
    banner.appendChild(close);
    host.insertBefore(banner, host.firstChild);
  }

  // Student dashboard: zero the progress ring, counters and lists.
  function applyStudentFreshState() {
    var ringValue = document.querySelector('#ring b span');
    setText(ringValue, '0');
    var ring = document.getElementById('ring');
    if (ring) ring.style.setProperty('--p', '0%');

    var metaLabel = document.querySelector('#btnHistory b');
    setText(metaLabel, '0 h hechas · 80 h faltan');
    var historyBtn = document.getElementById('btnHistory');
    if (historyBtn) historyBtn.disabled = true;

    document.querySelectorAll('.stats .stat b').forEach(function (node) {
      node.textContent = '0';
    });

    var timeline = document.getElementById('tl');
    if (timeline) {
      timeline.innerHTML = '';
      timeline.appendChild(emptyNote());
    }
    setText(document.getElementById('histTotal'), '0 h');

    // Pending activities are personal data: replace rows with one note.
    var pendItems = document.querySelectorAll('.pend-item');
    if (pendItems.length) {
      var card = pendItems[0].closest('.card');
      pendItems.forEach(function (item) { item.remove(); });
      if (card) card.appendChild(emptyNote());
    }

    // Pending section counter back to zero.
    document.querySelectorAll('.sec-head').forEach(function (head) {
      var title = head.querySelector('h3');
      var count = head.querySelector('span:last-child');
      if (title && count && /pendiente/i.test(title.textContent)) count.textContent = '0';
    });
  }

  // Teacher dashboard: zero stats, brigades and quick-access counters.
  function applyTeacherFreshState() {
    document.querySelectorAll('.stats .stat b').forEach(function (node) {
      node.textContent = '0';
    });
    setText(document.getElementById('pendSmall'), '0 pendientes hoy');
    setText(document.getElementById('repSmall'), '0 reportes nuevos');

    var brigades = document.querySelector('.brigades');
    if (brigades) {
      brigades.innerHTML = '';
      brigades.appendChild(emptyNote());
    }

    document.querySelectorAll('.sec-head').forEach(function (head) {
      var title = head.querySelector('h3');
      var count = head.querySelector('span:last-child');
      if (title && count && /brigada/i.test(title.textContent)) count.textContent = '0 activas';
    });

    var bars = document.querySelectorAll('.bar-fill');
    bars.forEach(function (bar) { bar.style.width = '0%'; });
    document.querySelectorAll('.bar-row b').forEach(function (node) {
      if (/%/.test(node.textContent)) node.textContent = '0%';
    });
  }

  function clearDemoOnLogout() {
    var logout = document.getElementById('btnLogout');
    if (logout) logout.addEventListener('click', function () { writeFlag(DEMO_KEY, false); });
  }

  document.addEventListener('DOMContentLoaded', function () {
    showWelcomeBanner();
    // Both shells share .wrap; pick the renderer by signature nodes.
    if (document.getElementById('ring')) applyStudentFreshState();
    if (document.querySelector('.brigades')) applyTeacherFreshState();
    clearDemoOnLogout();
  });
})();
