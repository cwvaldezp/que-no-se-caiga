(function () {
  var $ = function (id) { return document.getElementById(id); };

  // gender: chico/chica · case: upper/lower/cursive (ABC, abc o cursiva) · write: guided/free
  // voice: on/off (la voz que habla) · sfx: on/off (los efectos de sonido)
  // levels: on (se abren categorías al ganar) / off (todas) · help: off/free/sum10/sum99 (la ayuda 💡)
  var settings = { gender: 'chico', case: 'upper', write: 'guided', voice: 'on', sfx: 'on', levels: 'on', help: 'sum99' };
  Object.keys(settings).forEach(function (k) {
    try { settings[k] = localStorage.getItem(k) || settings[k]; } catch (e) { /* sin almacenamiento */ }
  });

  // Selfie para la cara (data URL, sólo en este aparato).
  var photo = null;
  try { photo = localStorage.getItem('photo'); } catch (e) { /* sin almacenamiento */ }

  // Estrellas ganadas por categoría ({ animal: 3, … }), para ir abriendo categorías.
  var stars = {};
  try { stars = JSON.parse(localStorage.getItem('stars')) || {}; } catch (e) { /* sin almacenamiento */ }

  var state = null;     // partida actual
  var tracer = null;    // pizarra activa
  var recent = [];      // palabras usadas hace poco en modo "Yo adivino"

  /* ---------- Sonido y voz ---------- */
  var audio = null;
  function tone(freqs, dur) {
    if (settings.sfx === 'off') return;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      freqs.forEach(function (f, i) {
        var o = audio.createOscillator(), g = audio.createGain(), t = audio.currentTime + i * dur;
        o.type = 'triangle';
        o.frequency.value = f;
        g.gain.setValueAtTime(0.2, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + dur);
        o.connect(g).connect(audio.destination);
        o.start(t);
        o.stop(t + dur);
      });
    } catch (e) { /* sin audio */ }
  }
  var sfx = {
    good: function () { tone([660, 880], 0.12); },
    bad: function () { tone([300, 220], 0.18); },
    stroke: function () { tone([990], 0.08); },
    win: function () { tone([523, 659, 784, 1047], 0.14); },
    lose: function () { tone([440, 330, 220], 0.2); }
  };

  /*
   * Voz. say() recibe partes: claves de PHRASES ('escribe'), una letra {l: 'B'},
   * una palabra {w: 'GATO'}, una pista {cat: 'animal'} o un texto libre {t: '…'}
   * (el texto libre sólo se dice con la voz del navegador: no tiene grabación).
   * Si el navegador tiene voz en español se usa esa; si no (por ejemplo la app de
   * Claude en Android) se tocan las grabaciones de js/voice-clips.js.
   */
  var player = new Audio(), clipQueue = [], ttsBroken = false;
  // ttsFails: veces seguidas que la voz del navegador no arrancó (en iPad a veces tarda; recién
  // con varias seguidas pasamos a las grabaciones). utterance se guarda para que Safari no la
  // pierda antes de terminar. voiceTurn cambia al callar, para que no hable una frase vieja.
  var ttsFails = 0, utterance = null, voiceTurn = 0;
  player.onended = function () { playNextClip(); };

  function partText(p) {
    if (typeof p === 'string') return window.PHRASES[p];
    if (p.l) return letterName(p.l);
    if (p.w) return p.w.toLowerCase();
    if (p.t) return p.t;
    return window.CATEGORIES[p.cat].say;
  }
  function partClip(p) {
    if (p.t) return null;
    var key = typeof p === 'string' ? p : p.l ? 'L_' + p.l : p.w ? 'W_' + p.w : 'cat_' + p.cat;
    return (window.VOICE_CLIPS || {})[key];
  }
  function spanishVoice() {
    try {
      if (ttsBroken || !window.speechSynthesis) return null;
      return speechSynthesis.getVoices().filter(function (v) { return /^es/i.test(v.lang); })[0] || null;
    } catch (e) { return null; }
  }

  // Habla sólo si la voz está encendida.
  function say() {
    if (settings.voice === 'off') return;
    speak(Array.prototype.slice.call(arguments));
  }

  // Habla siempre: cuando el niño toca "Escuchar" o la pista, aunque la voz esté apagada.
  function sayAlways() {
    speak(Array.prototype.slice.call(arguments));
  }

  function speak(parts) {
    stopVoice();
    var voice = spanishVoice();
    if (voice) speakTTS(parts, voice);
    else playClips(parts);
  }

  function stopVoice() {
    clipQueue = [];
    voiceTurn++;
    try { player.pause(); } catch (e) { /* nada sonando */ }
    try { if (window.speechSynthesis) speechSynthesis.cancel(); } catch (e) { /* sin voz */ }
  }

  function speakTTS(parts, voice) {
    try {
      var u = new SpeechSynthesisUtterance(parts.map(partText).join(' '));
      u.lang = voice.lang;
      u.voice = voice;
      u.rate = 0.9;
      var started = false, turn = voiceTurn;
      u.onstart = function () { started = true; ttsFails = 0; };
      // Si la voz del navegador no arranca, esta vez usamos las grabaciones; si falla varias
      // veces seguidas, desde ahora.
      var fallback = function () {
        if (started || turn !== voiceTurn) return;
        started = true;
        if (++ttsFails >= 3) ttsBroken = true;
        try { speechSynthesis.cancel(); } catch (e) { /* sin voz */ }
        playClips(parts);
      };
      u.onerror = function (e) { if (e.error !== 'interrupted' && e.error !== 'canceled') fallback(); };
      utterance = u;
      // Safari a veces ignora una frase pedida justo después de callar la anterior: esperamos un poco.
      setTimeout(function () {
        if (turn !== voiceTurn) return;
        try { speechSynthesis.resume(); } catch (e) { /* sin voz */ }
        speechSynthesis.speak(u);
        setTimeout(fallback, 2500);
      }, 80);
    } catch (e) {
      ttsBroken = true;
      playClips(parts);
    }
  }

  function playClips(parts) {
    clipQueue = parts.map(partClip).filter(Boolean);
    playNextClip();
  }
  function playNextClip() {
    var src = clipQueue.shift();
    if (!src) return;
    player.muted = false;
    player.src = src;
    var p = player.play();
    if (p && p.catch) p.catch(function () { /* el navegador no dejó sonar */ });
  }

  // Algunos teléfonos sólo dejan sonar audio si el primer play() ocurre al tocar la pantalla.
  document.addEventListener('pointerdown', function unlock() {
    document.removeEventListener('pointerdown', unlock);
    if (spanishVoice() || player.src || !window.VOICE_CLIPS) return;
    var src = window.VOICE_CLIPS.excelente;
    player.muted = true;
    player.src = src;
    var p = player.play();
    if (p && p.then) p.then(function () { if (player.src === src) { player.pause(); player.muted = false; } }).catch(function () {});
  });

  function letterName(l) { return 'la ' + window.LETTER_NAMES[l]; }
  function isLower() { return settings.case !== 'upper'; }
  function isCursive() { return settings.case === 'cursive'; }

  // Muestra una letra: como texto (ABC, abc) o dibujada con sus trazos (cursiva, no hay fuente fiable).
  function letterHTML(l) {
    if (!isCursive()) return escapeHTML(disp(l));
    var paths = window.CURSIVE_LETTERS[l].map(function (st) {
      if (st.length === 1) return '<circle cx="' + st[0][0] + '" cy="' + st[0][1] + '" r="4" fill="currentColor"/>';
      return '<polyline points="' + st.map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' ') + '"/>';
    }).join('');
    return '<svg class="cursive-letter" viewBox="8 0 84 115" aria-label="' + disp(l) + '">' +
      '<g fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round" stroke-linejoin="round">' + paths + '</g></svg>';
  }
  // Cómo se muestra una letra o palabra según mayúsculas/minúsculas.
  function disp(text) { return isLower() ? text.toLowerCase() : text; }
  function escapeHTML(t) { return String(t).replace(/[&<>"]/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; }); }
  // La imagen secreta: un emoji o un dibujo hecho por el niño.
  function picHTML(w) { return w.image ? '<img alt="Dibujo" src="' + w.image + '">' : escapeHTML(w.emoji); }

  /* ---------- Navegación ---------- */
  function show(id) {
    document.querySelectorAll('.screen').forEach(function (s) { s.classList.toggle('active', s.id === id); });
    document.querySelectorAll('.overlay').forEach(function (o) { o.classList.remove('active'); });
    if (id === 'home') renderHome();
  }
  function openOverlay(id) { $(id).classList.add('active'); }
  function closeOverlay(id) { $(id).classList.remove('active'); }

  document.querySelectorAll('[data-go]').forEach(function (b) {
    b.addEventListener('click', function () {
      closeTracer();
      show(b.getAttribute('data-go'));
    });
  });

  /* ---------- Inicio ---------- */
  function renderHome() {
    $('home-figure').innerHTML = window.figureSVG(window.MAX_ERRORS, settings.gender, false, photo);
    $('btn-photo').textContent = photo ? '📷 Cambiar foto' : '📷 Foto';
    $('btn-photo').classList.toggle('selected', !!photo);
    $('btn-photo-remove').hidden = !photo;
    document.querySelectorAll('.chip[data-setting]').forEach(function (c) {
      c.classList.toggle('selected', settings[c.getAttribute('data-setting')] === c.getAttribute('data-value'));
    });
    document.body.classList.toggle('lower-case', isLower());
    document.body.classList.toggle('cursive', isCursive());
    renderSound();
    renderLevels();
  }

  /* ---------- Niveles: categorías que se abren al ganar ---------- */
  function openCats() {
    return settings.levels === 'on' ? window.Progress.unlocked(stars) : window.UNLOCK_ORDER;
  }
  // La última categoría abierta (la que hay que completar para abrir otra), o null si ya están todas.
  function currentCat() {
    var open = window.Progress.unlocked(stars);
    return open.length < window.UNLOCK_ORDER.length ? open[open.length - 1] : null;
  }
  function starsText(cat) {
    var n = Math.min(stars[cat] || 0, window.STARS_TO_UNLOCK);
    return new Array(n + 1).join('⭐') + new Array(window.STARS_TO_UNLOCK - n + 1).join('☆');
  }

  function renderLevels() {
    var box = $('levels-progress');
    box.hidden = settings.levels !== 'on';
    var open = window.Progress.unlocked(stars), cur = currentCat(), C = window.CATEGORIES;
    var html = open.map(function (k) {
      return '<span class="lvl' + (k === cur ? ' current' : '') + '">' + C[k].icon + (k === cur ? ' ' + starsText(k) : '') + '</span>';
    }).join('');
    var locked = window.UNLOCK_ORDER.length - open.length;
    html += locked ? '<span class="lvl locked">🔒' + (locked > 1 ? ' +' + (locked - 1) : '') + '</span>' : '<span class="lvl">🏆</span>';
    box.innerHTML = html + '<button id="btn-levels-reset" class="lvl-reset" aria-label="Empezar los niveles de cero">↺</button>';
  }
  $('levels-progress').addEventListener('click', function (e) {
    if (!e.target.closest('#btn-levels-reset')) return;
    if (!confirm('¿Borrar las estrellas y volver a empezar sólo con ' + window.CATEGORIES[window.UNLOCK_ORDER[0]].name + '?')) return;
    stars = {};
    try { localStorage.removeItem('stars'); } catch (err) { /* sin almacenamiento */ }
    renderLevels();
  });

  // Una estrella para la categoría de la palabra completada. Devuelve el mensaje para la pantalla final.
  function addStar(cat) {
    if (!cat || window.UNLOCK_ORDER.indexOf(cat) === -1) return '';
    var before = window.Progress.unlocked(stars).length;
    stars[cat] = (stars[cat] || 0) + 1;
    try { localStorage.setItem('stars', JSON.stringify(stars)); } catch (e) { /* sin almacenamiento */ }
    if (settings.levels !== 'on') return '⭐ ¡Ganaste una estrella!';
    var open = window.Progress.unlocked(stars);
    if (open.length > before) {
      var c = window.CATEGORIES[open[open.length - 1]];
      return '🔓 ¡Abriste una categoría nueva: ' + c.icon + ' ' + c.name + '!';
    }
    var cur = currentCat();
    if (cat === cur) return starsText(cur) + ' ¡Sigue así para abrir otra categoría!';
    return '⭐ ¡Ganaste una estrella!';
  }

  /* ---------- Selfie ---------- */
  // Se elige o se toma una foto, se encuadra la cara arrastrando y acercando, y se guarda
  // como un cuadrado chico (para que quepa en el almacenamiento del navegador).
  var shot = { img: null, zoom: 1, x: 0, y: 0, drag: null };
  var pc = $('photo-canvas'), pctx = pc.getContext('2d');

  $('btn-photo').addEventListener('click', function () { $('photo-input').click(); });
  $('btn-photo-again').addEventListener('click', function () { $('photo-input').click(); });
  $('btn-photo-remove').addEventListener('click', function () {
    photo = null;
    try { localStorage.removeItem('photo'); } catch (e) { /* sin almacenamiento */ }
    renderHome();
  });

  $('photo-input').addEventListener('change', function () {
    var file = this.files && this.files[0];
    this.value = '';
    if (!file) return;
    var img = new Image();
    img.onload = function () {
      shot.img = img;
      shot.zoom = 1;
      $('photo-zoom').value = 1;
      // Empezamos centrados, un poco hacia arriba (en las selfies la cara suele estar arriba).
      shot.x = 0;
      shot.y = Math.max(0, img.height - img.width) * -0.25 / Math.max(img.width, img.height);
      openOverlay('photo');
      requestAnimationFrame(function () {
        var dpr = window.devicePixelRatio || 1;
        pc.width = pc.clientWidth * dpr;
        pc.height = pc.clientHeight * dpr;
        drawShot(pctx, pc.width, true);
      });
    };
    img.src = URL.createObjectURL(file);
  });

  // Dibuja la foto en un cuadrado de lado `size`. x/y es el corrimiento en fracciones del lado.
  function drawShot(ctx, size, guide) {
    var img = shot.img, base = size / Math.min(img.width, img.height), sc = base * shot.zoom;
    var w = img.width * sc, h = img.height * sc;
    ctx.fillStyle = '#222';
    ctx.fillRect(0, 0, size, size);
    ctx.drawImage(img, (size - w) / 2 + shot.x * size, (size - h) / 2 + shot.y * size, w, h);
    if (!guide) return;
    // Oscurecemos lo que queda fuera del círculo.
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.beginPath();
    ctx.rect(0, 0, size, size);
    ctx.arc(size / 2, size / 2, size * 0.42, 0, Math.PI * 2, true);
    ctx.fill('evenodd');
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = size * 0.012;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size * 0.42, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  pc.addEventListener('pointerdown', function (e) {
    e.preventDefault();
    try { pc.setPointerCapture(e.pointerId); } catch (err) { /* sin captura */ }
    shot.drag = [e.clientX, e.clientY, shot.x, shot.y];
  });
  pc.addEventListener('pointermove', function (e) {
    if (!shot.drag) return;
    var w = pc.clientWidth;
    shot.x = shot.drag[2] + (e.clientX - shot.drag[0]) / w;
    shot.y = shot.drag[3] + (e.clientY - shot.drag[1]) / w;
    drawShot(pctx, pc.width, true);
  });
  ['pointerup', 'pointercancel'].forEach(function (ev) {
    pc.addEventListener(ev, function () { shot.drag = null; });
  });
  $('photo-zoom').addEventListener('input', function () {
    shot.zoom = parseFloat(this.value);
    drawShot(pctx, pc.width, true);
  });

  $('btn-photo-ok').addEventListener('click', function () {
    // Guardamos sólo el círculo, ampliado a todo el cuadrado.
    var full = document.createElement('canvas'), size = 400;
    full.width = full.height = size;
    drawShot(full.getContext('2d'), size, false);
    var out = document.createElement('canvas'), r = size * 0.42;
    out.width = out.height = 160;
    out.getContext('2d').drawImage(full, size / 2 - r, size / 2 - r, r * 2, r * 2, 0, 0, 160, 160);
    photo = out.toDataURL('image/jpeg', 0.85);
    try { localStorage.setItem('photo', photo); } catch (e) { /* sin almacenamiento: dura sólo esta vez */ }
    closeOverlay('photo');
    renderHome();
  });

  /* ---------- Voz y sonidos encendidos/apagados ---------- */
  function saveSetting(key, value) {
    settings[key] = value;
    try { localStorage.setItem(key, value); } catch (e) { /* sin almacenamiento */ }
  }
  function renderSound() {
    document.querySelectorAll('[data-toggle]').forEach(function (b) {
      var on = settings[b.getAttribute('data-toggle')] === 'on';
      b.classList.toggle('selected', on);
      b.setAttribute('aria-pressed', on);
      b.querySelector('.state').textContent = on ? 'Sí' : 'No';
    });
    var any = settings.voice === 'on' || settings.sfx === 'on';
    $('btn-mute').textContent = any ? '🔊' : '🔇';
    $('btn-mute').setAttribute('aria-label', any ? 'Quitar sonido' : 'Poner sonido');
  }
  document.querySelectorAll('[data-toggle]').forEach(function (b) {
    b.addEventListener('click', function () {
      var key = b.getAttribute('data-toggle');
      saveSetting(key, settings[key] === 'on' ? 'off' : 'on');
      if (settings[key] === 'off' && key === 'voice') stopVoice();
      renderSound();
    });
  });
  // Botón rápido en el juego: apaga o enciende todo de una vez.
  $('btn-mute').addEventListener('click', function () {
    var value = settings.voice === 'on' || settings.sfx === 'on' ? 'off' : 'on';
    saveSetting('voice', value);
    saveSetting('sfx', value);
    if (value === 'off') stopVoice();
    renderSound();
  });
  document.querySelectorAll('.chip[data-setting]').forEach(function (c) {
    c.addEventListener('click', function () {
      var key = c.getAttribute('data-setting');
      settings[key] = c.getAttribute('data-value');
      try { localStorage.setItem(key, settings[key]); } catch (e) { /* sin almacenamiento */ }
      renderHome();
    });
  });

  $('btn-mode-pick').addEventListener('click', function () {
    renderPick();
    show('pick');
    say('elige');
  });
  $('btn-mode-guess').addEventListener('click', function () { startGame(randomWord(), 'guess'); });

  /* ---------- Elegir imagen ---------- */
  var grid = $('pick-grid');
  var own = document.createElement('button');
  own.className = 'draw-own';
  own.innerHTML = '<span class="emoji">✏️</span><span class="name">DIBUJAR</span>';
  own.addEventListener('click', openDraw);
  // Imágenes agrupadas por categoría, con un título por grupo. Sólo las categorías abiertas.
  function renderPick() {
    grid.innerHTML = '';
    grid.appendChild(own);
    var open = openCats();
    Object.keys(window.CATEGORIES).forEach(function (k) {
      var c = window.CATEGORIES[k], words = window.WORDS.filter(function (w) { return w.cat === k; });
      if (!words.length || open.indexOf(k) === -1) return;
      var h = document.createElement('h3');
      h.className = 'pick-group';
      h.textContent = c.icon + ' ' + c.name;
      grid.appendChild(h);
      words.forEach(function (w) {
        var b = document.createElement('button');
        b.innerHTML = '<span class="emoji">' + w.emoji + '</span><span class="name">' + disp(w.word) + '</span>';
        b.addEventListener('click', function () { startGame(w, 'pick'); });
        grid.appendChild(b);
      });
    });
    var cur = settings.levels === 'on' && currentCat();
    if (cur) {
      var lock = document.createElement('p');
      lock.className = 'pick-locked';
      lock.textContent = '🔒 Gana ' + starsText(cur) + ' en ' + window.CATEGORIES[cur].name + ' para abrir otra categoría';
      grid.appendChild(lock);
    }
  }

  // Palabra al azar de las categorías abiertas. La mitad de las veces, de la última que se abrió,
  // para que se practique la nueva.
  function randomWord() {
    var open = openCats(), cur = settings.levels === 'on' && currentCat();
    var cats = cur && open.length > 1 && Math.random() < 0.5 ? [cur] : open;
    var pool = window.WORDS.filter(function (w) { return cats.indexOf(w.cat) !== -1; });
    var options = pool.filter(function (w) { return recent.indexOf(w.word) === -1; });
    if (!options.length) options = pool;
    var w = options[Math.floor(Math.random() * options.length)];
    recent.push(w.word);
    if (recent.length > 10) recent.shift();
    return w;
  }

  /* ---------- Partida ---------- */
  // mode 'pick': el niño eligió la imagen y otro adivina.
  // mode 'guess': el juego eligió la imagen y el niño adivina.
  function startGame(w, mode) {
    state = { word: w.word, pic: picHTML(w), cat: w.cat, drawn: !!w.image, mode: mode, letters: w.word.split(''), found: {}, used: {}, errors: 0, over: false };
    show('game');

    var peek = $('btn-peek');
    $('peek-emoji').innerHTML = state.pic;
    peek.classList.toggle('hidden', mode !== 'pick');
    $('game-hint').textContent = mode === 'pick'
      ? 'El otro jugador dice una letra y tú la tocas 👇'
      : '¿Qué letra crees que tiene? Tócala 👇';

    $('slots').innerHTML = state.letters.map(function (_, i) { return '<div class="slot" data-i="' + i + '"></div>'; }).join('');
    $('misses').innerHTML = '';

    var kb = $('keyboard');
    kb.innerHTML = '';
    window.ALPHABET.forEach(function (l) {
      var b = document.createElement('button');
      b.textContent = l;
      b.setAttribute('data-letter', l);
      b.addEventListener('click', function () { onLetter(l); });
      kb.appendChild(b);
    });
    renderFigure(false);
    // Pista: qué tipo de cosa es (animal, fruta…), para el que adivina.
    var cat = window.CATEGORIES[w.cat], pill = $('hint-cat');
    pill.hidden = !cat;
    if (cat) pill.innerHTML = '<span class="cat-label">Pista:</span> ' + cat.icon + ' ' + cat.label;
    // Ayuda 💡 para el que adivina: con una suma (o directo) se ve la imagen y su palabra.
    $('btn-help').hidden = mode !== 'guess' || settings.help === 'off';
    var intro = mode === 'pick' ? 'empieza_juego' : 'adivina';
    if (cat) say(intro, { cat: w.cat });
    else say(intro);
  }

  $('hint-cat').addEventListener('click', function () {
    if (state && state.cat) sayAlways({ cat: state.cat });
  });

  /* ---------- Ayuda: resolver una suma en columnas para ver la imagen ---------- */
  // Se resuelve como en el cuaderno, de derecha a izquierda: el niño escribe la suma de cada
  // columna (por ejemplo 10) y el juego la acomoda: abajo el 0 y el 1 que se lleva arriba, en verde.
  // id cambia con cada suma nueva, para que los pasos pendientes de una suma cerrada no sigan.
  var help = { id: 0, sum: null, steps: null, step: 0, typed: '', busy: false };

  $('btn-help').addEventListener('click', function () {
    if (!state || state.over) return;
    if (settings.help === 'free') { showHelpPic(); return; }
    help.sum = window.Progress.makeSum(settings.help);
    help.steps = window.Progress.sumSteps(help.sum.a, help.sum.b);
    help.id++;
    help.step = 0;
    help.busy = false;
    renderSumGrid();
    $('sum-feedback').textContent = '';
    $('help-sum').hidden = false;
    $('help-show').hidden = true;
    $('btn-help-close').textContent = '⬅️ Volver';
    openOverlay('help');
    showSumStep(true);
  });

  // Lo que se dice en voz alta (el niño todavía no lee): "3 + 7" se dice "3 más 7".
  function spoken(text) { return text.replace(/\+/g, 'más').replace(/=/g, 'es'); }
  // La pregunta de la suma y, si hay más de una columna, qué sumar ahora.
  function sumSpeech(first) {
    var st = help.steps.steps[help.step];
    var q = '¿Cuánto es ' + help.sum.a + ' más ' + help.sum.b + '?';
    if (help.steps.steps.length === 1) return q;
    return (first ? q + ' ' : '') + spoken(st.msg);
  }
  $('btn-sum-say').addEventListener('click', function () {
    if (!help.steps) return;
    var total = help.sum.a + help.sum.b;
    if (help.step >= help.steps.steps.length) sayAlways({ t: help.sum.a + ' más ' + help.sum.b + ' es ' + total });
    else sayAlways({ t: sumSpeech(true) });
  });

  // Cuadrícula: fila de lo que se lleva, los dos números, la raya y el resultado.
  // Columnas de izquierda (centenas) a derecha (unidades), con el signo + adelante.
  function renderSumGrid() {
    var sp = help.steps, n = sp.cols, html = '';
    var carries = sp.steps.map(function (st) { return st.carryTo; });
    var row = function (first, cell) {
      html += '<div class="sum-sign">' + first + '</div>';
      for (var i = n - 1; i >= 0; i--) html += cell(i);
    };
    row('', function (i) {
      return carries.indexOf(i) !== -1 ? '<div class="sum-box carry" data-cell="c' + i + '"></div>' : '<div></div>';
    });
    // Cada número de un color: el de arriba azul y el de abajo rojo.
    row('', function (i) { return '<div class="sum-digit num-a">' + (sp.a[i] === null ? '' : sp.a[i]) + '</div>'; });
    row('+', function (i) { return '<div class="sum-digit num-b">' + (sp.b[i] === null ? '' : sp.b[i]) + '</div>'; });
    // La casilla de una columna sin números (cuando el total pasa de 99) aparece recién al llenarla.
    row('', function (i) {
      var later = sp.a[i] === null && sp.b[i] === null ? ' later' : '';
      return '<div class="sum-box result' + later + '" data-cell="r' + i + '"></div>';
    });
    var grid = $('sum-grid');
    grid.style.gridTemplateColumns = '40px repeat(' + n + ', 64px)';
    grid.innerHTML = html;
  }

  function sumCell(id) { return $('sum-grid').querySelector('[data-cell="' + id + '"]'); }

  function showSumStep(first) {
    var st = help.steps.steps[help.step];
    help.typed = '';
    $('sum-grid').querySelectorAll('.sum-box').forEach(function (b) { b.classList.remove('active'); });
    sumCell('r' + st.col).classList.add('active');
    renderTyped();
    $('sum-msg').textContent = st.msg;
    say({ t: sumSpeech(first) });
  }

  // Lo que el niño va escribiendo se ve en la casilla activa (puede tener dos cifras, como 10).
  function renderTyped() {
    var cell = sumCell('r' + help.steps.steps[help.step].col);
    cell.textContent = help.typed;
    cell.classList.toggle('two', help.typed.length === 2);
    cell.classList.toggle('three', help.typed.length > 2);
  }

  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', '✅'].forEach(function (k) {
    var b = document.createElement('button');
    b.textContent = k;
    if (k === '✅') b.className = 'ok';
    b.addEventListener('click', function () { onNumKey(k); });
    $('numpad').appendChild(b);
  });

  function onNumKey(k) {
    if (!help.steps || help.busy || help.step >= help.steps.steps.length) return;
    var st = help.steps.steps[help.step], fb = $('sum-feedback');
    if (k === '⌫') help.typed = help.typed.slice(0, -1);
    else if (k !== '✅') { if (help.typed.length < maxTyped()) help.typed += k; }
    else if (help.typed) {
      var n = parseInt(help.typed, 10);
      if (n === st.sum) { placeColumn(st); return; }
      if (help.step === 0 && n === help.sum.a + help.sum.b) { placeTotal(); return; }
      sfx.bad();
      help.typed = '';
      fb.style.color = 'var(--primary)';
      fb.textContent = '¡Casi! Cuenta otra vez 🤔';
      say('casi');
      var cell = sumCell('r' + st.col);
      [cell, fb].forEach(function (el) {
        el.classList.remove('shake');
        void el.offsetWidth;
        el.classList.add('shake');
      });
    }
    renderTyped();
  }

  // En el primer paso se puede escribir el total de una vez (si lo sabe de memoria, como 20 + 21 = 41).
  function maxTyped() {
    return help.step === 0 ? Math.max(2, String(help.sum.a + help.sum.b).length) : 2;
  }

  // Lo sumó de memoria: se llena todo el resultado (y lo que se lleva) y se pasa a la imagen.
  function placeTotal() {
    help.busy = true;
    var total = String(help.sum.a + help.sum.b), id = ++help.id, fb = $('sum-feedback');
    $('sum-grid').querySelectorAll('.sum-box').forEach(function (b) { b.classList.remove('active', 'two', 'three', 'later'); });
    for (var i = 0; i < total.length; i++) {
      var cell = sumCell('r' + i);
      cell.textContent = total[total.length - 1 - i];
      cell.classList.add('done');
    }
    help.steps.steps.forEach(function (st) {
      if (st.carryTo === null) return;
      var c = sumCell('c' + st.carryTo);
      c.textContent = Math.floor(st.sum / 10);
      c.classList.add('done');
    });
    help.step = help.steps.steps.length;
    sfx.win();
    fb.style.color = 'var(--yes)';
    fb.textContent = '¡Muy bien, lo sumaste de memoria! ' + help.sum.a + ' + ' + help.sum.b + ' = ' + total + ' 🎉';
    $('sum-msg').textContent = '';
    say({ t: 'Muy bien, lo sumaste de memoria. ' + help.sum.a + ' más ' + help.sum.b + ' es ' + total });
    setTimeout(function () { if (help.id === id && $('help').classList.contains('active')) showHelpPic(); }, 3800);
  }

  // Suma correcta: abajo va la última cifra y lo que se lleva arriba de la columna siguiente
  // (en la última columna se escribe el número entero, abriendo la casilla de la izquierda).
  function placeColumn(st) {
    help.busy = true;
    var cell = sumCell('r' + st.col), fb = $('sum-feedback');
    cell.classList.remove('active', 'two', 'three');
    cell.textContent = st.sum % 10;
    cell.classList.add('done');
    if (st.carryTo !== null) {
      var c = sumCell('c' + st.carryTo);
      c.textContent = Math.floor(st.sum / 10);
      c.classList.add('done');
    } else if (st.sum >= 10) {
      var left = sumCell('r' + (st.col + 1));
      left.classList.remove('later');
      left.textContent = Math.floor(st.sum / 10);
      left.classList.add('done');
    }
    fb.style.color = 'var(--yes)';
    fb.textContent = '¡' + st.say + '! ' + (st.carryTo !== null ? '☝️' : '✅');
    say({ t: st.say });
    help.step++;
    var finished = help.step >= help.steps.steps.length, id = help.id;
    var current = function () { return help.id === id && $('help').classList.contains('active'); };
    if (finished) sfx.win(); else sfx.good();
    setTimeout(function () {
      if (!current()) return;
      if (finished) {
        fb.textContent = '¡Muy bien! ' + help.sum.a + ' + ' + help.sum.b + ' = ' + (help.sum.a + help.sum.b) + ' 🎉';
        $('sum-msg').textContent = '';
        say({ t: spoken(fb.textContent.replace(' 🎉', '')) });
        setTimeout(function () { if (current()) showHelpPic(); }, 3000);
        return;
      }
      help.busy = false;
      fb.textContent = '';
      showSumStep();
    }, 2800);
  }

  // La imagen secreta con su palabra letra por letra, para que la mire y la siga escribiendo.
  function showHelpPic() {
    $('help-pic').innerHTML = state.pic;
    $('help-word').innerHTML = state.letters.map(function (l) { return '<span>' + letterHTML(l) + '</span>'; }).join('');
    $('help-sum').hidden = true;
    $('help-show').hidden = false;
    $('btn-help-close').textContent = '👍 ¡A seguir!';
    openOverlay('help');
    sayAlways({ w: state.word });
  }
  $('btn-help-say').addEventListener('click', function () { if (state) sayAlways({ w: state.word }); });
  $('btn-help-close').addEventListener('click', function () { closeOverlay('help'); });

  function renderFigure(fallen) {
    $('figure').innerHTML = window.figureSVG(state.errors, settings.gender, fallen, photo);
    var left = window.MAX_ERRORS - state.errors;
    $('lives').textContent = '❤️ ' + left;
  }

  // Mantener presionado para ver la imagen secreta.
  (function () {
    var peek = $('btn-peek');
    var on = function (e) { e.preventDefault(); peek.classList.add('showing'); };
    var off = function () { peek.classList.remove('showing'); };
    peek.addEventListener('pointerdown', on);
    peek.addEventListener('pointerup', off);
    peek.addEventListener('pointerleave', off);
    peek.addEventListener('pointercancel', off);
  })();

  function onLetter(l) {
    if (!state || state.over || state.used[l]) return;
    if (state.mode === 'pick') askChild(l);
    else resolveLetter(l);
  }

  /* El niño decide si la letra está en su palabra. */
  function askChild(l) {
    $('ask-emoji').innerHTML = state.pic;
    $('ask-letter').innerHTML = letterHTML(l);
    $('ask-question').textContent = '¿Tu palabra tiene la letra ' + disp(l) + '?';
    $('ask-feedback').textContent = '';
    $('btn-yes').disabled = $('btn-no').disabled = false;
    openOverlay('ask');
    say('tiene', { l: l });

    var answer = function (saysYes) {
      $('btn-yes').disabled = $('btn-no').disabled = true;
      var really = state.letters.indexOf(l) !== -1;
      var fb = $('ask-feedback');
      if (saysYes === really) {
        fb.style.color = 'var(--yes)';
        fb.textContent = really ? '¡Muy bien! Ahora escríbela ✏️' : '¡Correcto! No está, pero igual escríbela ✏️';
        setTimeout(function () { closeOverlay('ask'); resolveLetter(l); }, 900);
      } else {
        // Corrección suave: le ayudamos a revisar su palabra.
        fb.style.color = 'var(--primary)';
        fb.textContent = really ? '¡Mira bien! 👀 Sí está en tu palabra' : 'Mmm… 🤔 Tu palabra no tiene la ' + disp(l);
        say(really ? 'mira_si' : 'mira_no');
        setTimeout(function () { closeOverlay('ask'); resolveLetter(l); }, 2400);
      }
    };
    $('btn-yes').onclick = function () { answer(true); };
    $('btn-no').onclick = function () { answer(false); };
  }

  // Toda letra se escribe a mano, esté o no en la palabra, para practicarlas todas.
  function resolveLetter(l) {
    state.used[l] = true;
    var key = document.querySelector('[data-letter="' + l + '"]');
    key.disabled = true;
    var found = state.letters.indexOf(l) !== -1;
    key.classList.add(found ? 'good' : 'bad');
    (found ? sfx.good : sfx.bad)();
    openTracer(l, found);
  }

  // Letra que no estaba: va abajo con una X roja y se dibuja una parte más.
  function placeMiss(l, img) {
    var m = document.createElement('div');
    m.className = 'miss';
    m.innerHTML = '<img alt="' + disp(l) + '" src="' + img + '">';
    $('misses').appendChild(m);
    state.errors++;
    sfx.bad();
    renderFigure(false);
    if (state.errors >= window.MAX_ERRORS) lose();
  }

  /* ---------- Escribir la letra ---------- */
  function openTracer(l, found) {
    var free = settings.write === 'free';
    openOverlay('trace');
    $('trace-model').innerHTML = letterHTML(l);
    var name = 'la ' + disp(l);
    var intro = found ? '' : window.PHRASES.no_esta + ' ';
    var spoken = (found ? [] : ['no_esta']).concat(['escribe', { l: l }]);
    if (free) {
      setTraceMsg(intro + 'Escribe ' + name + ' y toca Listo ✅');
      say.apply(null, spoken);
    } else {
      setTraceMsg(intro + 'Escribe ' + name + '. Empieza en el punto verde 🟢');
      say.apply(null, spoken.concat(['punto_verde']));
    }

    var canvas = $('trace-canvas');
    var total = window.letterSet(settings.case)[l].length;
    // Esperamos a que la ventana tenga tamaño antes de crear la pizarra.
    requestAnimationFrame(function () {
      tracer = new window.Tracer(canvas, l, {
        style: settings.case,
        free: free,
        onStroke: function (n) {
          sfx.stroke();
          setTraceMsg('¡Bien! Ahora el trazo ' + (n + 1) + ' de ' + total + ' 🟢');
        },
        onRetry: function (why) {
          setTraceMsg({
            start: 'Empieza en el punto verde 🟢 Inténtalo otra vez',
            short: '¡Casi! Llega hasta la flecha ➡️ Inténtalo otra vez',
            scribble: '¡Sin garabatos! Hazlo una sola vez, despacito 🐢'
          }[why] || '¡Casi! Sigue el dedito 👆 y vuelve a intentarlo');
          say('casi');
          shakeCanvas();
        },
        onDone: function (img) {
          sfx.win();
          setTraceMsg('¡Excelente! 🌟');
          say('excelente');
          setTimeout(function () {
            closeTracer();
            if (found) placeLetter(l, img);
            else placeMiss(l, img);
          }, 1100);
        }
      });
      updateTraceButtons();
    });
    updateTraceButtons(free);
  }

  // En modo libre se ven "Ayuda" y "Listo"; con caminito no hacen falta.
  function updateTraceButtons(free) {
    if (free === undefined) free = !!(tracer && tracer.free);
    $('btn-trace-help').hidden = !free;
    $('btn-trace-done').hidden = !free;
  }

  function shakeCanvas() {
    var canvas = $('trace-canvas');
    canvas.classList.remove('shake');
    void canvas.offsetWidth;
    canvas.classList.add('shake');
  }

  function showTraceGuide(msg) {
    tracer.showGuide();
    updateTraceButtons();
    setTraceMsg(msg);
    say('te_ayudo');
  }

  $('btn-trace-done').addEventListener('click', function () {
    if (!tracer || !tracer.free || tracer.finished) return;
    if (!tracer.pending.length) {
      setTraceMsg('Primero escribe la letra con tu dedo ✏️');
      return;
    }
    if (!tracer.checkFree()) {
      shakeCanvas();
      showTraceGuide(tracer.lastProblem === 'scribble'
        ? '¡Eso parece un garabato! 🙂 Vamos con el caminito: empieza en el punto verde 🟢'
        : '¡Casi! Ahora con el caminito: empieza en el punto verde 🟢');
    }
  });
  $('btn-trace-help').addEventListener('click', function () {
    if (tracer && tracer.free) showTraceGuide('Sigue el dedito 👆 Empieza en el punto verde 🟢');
  });

  function setTraceMsg(t) { $('trace-msg').textContent = t; }

  function closeTracer() {
    if (tracer) { tracer.destroy(); tracer = null; }
    closeOverlay('trace');
  }

  $('btn-trace-reset').addEventListener('click', function () {
    if (!tracer) return;
    tracer.reset();
    setTraceMsg(tracer.free ? 'Escribe la letra y toca Listo ✅' : 'Empieza en el punto verde 🟢');
  });
  $('btn-trace-say').addEventListener('click', function () {
    if (tracer) sayAlways('escribe', { l: tracer.letter });
  });

  function placeLetter(l, img) {
    state.letters.forEach(function (c, i) {
      if (c !== l) return;
      state.found[i] = true;
      var slot = document.querySelector('.slot[data-i="' + i + '"]');
      slot.innerHTML = '<img alt="' + disp(l) + '" src="' + img + '">';
    });
    if (Object.keys(state.found).length === state.letters.length) win();
  }

  /* ---------- Fin de partida ---------- */
  function win() {
    state.over = true;
    sfx.win();
    confetti();
    var pick = state.mode === 'pick';
    state.unlockMsg = state.drawn ? '' : addStar(state.cat);
    showEnd(state.pic, pick ? '¡Adivinaron tu palabra! 🎉' : '¡Ganaste! 🎉',
      pick ? '¡Y tú escribiste todas las letras!' : '¡Lo hiciste muy bien!');
    say(pick ? 'adivinaron' : 'ganaste_es', { w: state.word });
  }

  function lose() {
    state.over = true;
    renderFigure(true);
    sfx.lose();
    // Mostramos las letras que faltaban.
    state.letters.forEach(function (c, i) {
      if (state.found[i]) return;
      var slot = document.querySelector('.slot[data-i="' + i + '"]');
      slot.classList.add('reveal');
      slot.innerHTML = '<span>' + letterHTML(c) + '</span>';
    });
    var pick = state.mode === 'pick';
    setTimeout(function () {
      if (pick) confetti();
      showEnd(pick ? '🏆' : '💦', pick ? '¡Ganaste tú! 🏆' : '¡Se cayó al agua! 💦',
        pick ? 'No adivinaron tu palabra secreta:' : 'La palabra era:');
      if (pick) say('ganaste_no'); else say('cayo', { w: state.word });
    }, 1800);
  }

  function showEnd(pic, title, text) {
    $('end-emoji').innerHTML = pic;
    $('end-title').textContent = title;
    $('end-text').textContent = text;
    $('end-word').innerHTML = state.pic + ' ' + escapeHTML(disp(state.word));
    $('end-unlock').textContent = state.unlockMsg || '';
    openOverlay('end');
  }

  $('btn-again').addEventListener('click', function () {
    if (state && state.mode === 'guess') startGame(randomWord(), 'guess');
    else show('pick');
  });

  /* ---------- Dibujar la imagen secreta ---------- */
  var COLORS = ['#2d2a4a', '#e74c3c', '#ff9f43', '#f1c40f', '#2ecc71', '#3498db', '#9b59b6', '#8d6e63', '#ff6fa8'];
  var draw = { color: COLORS[0], lines: [], current: null };
  var dc = $('draw-canvas'), dctx = dc.getContext('2d');

  COLORS.forEach(function (c, i) {
    var b = document.createElement('button');
    b.style.background = c;
    b.setAttribute('aria-label', 'Color ' + (i + 1));
    if (i === 0) b.classList.add('selected');
    b.addEventListener('click', function () {
      draw.color = c;
      $('palette').querySelectorAll('button').forEach(function (x) { x.classList.toggle('selected', x === b); });
    });
    $('palette').appendChild(b);
  });

  function openDraw() {
    draw.lines = [];
    show('draw');
    say('dibuja');
    requestAnimationFrame(sizeDraw);
  }

  function sizeDraw() {
    var dpr = window.devicePixelRatio || 1;
    dc.width = dc.clientWidth * dpr;
    dc.height = dc.clientHeight * dpr;
    dctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    renderDraw(dctx, 1);
  }
  window.addEventListener('resize', function () { if ($('draw').classList.contains('active')) sizeDraw(); });

  // Los trazos se guardan en proporción al ancho para poder redibujarlos a cualquier tamaño.
  function renderDraw(ctx, k) {
    var w = dc.clientWidth * k;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, dc.clientHeight * k);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    draw.lines.forEach(function (ln) {
      ctx.strokeStyle = ln.color;
      ctx.lineWidth = 0.025 * w;
      ctx.beginPath();
      ctx.moveTo(ln.pts[0][0] * w, ln.pts[0][1] * w);
      ln.pts.forEach(function (p) { ctx.lineTo(p[0] * w, p[1] * w); });
      if (ln.pts.length === 1) ctx.lineTo(ln.pts[0][0] * w + 0.1, ln.pts[0][1] * w);
      ctx.stroke();
    });
  }

  function drawPoint(e) {
    var r = dc.getBoundingClientRect();
    return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.width];
  }
  dc.addEventListener('pointerdown', function (e) {
    e.preventDefault();
    try { dc.setPointerCapture(e.pointerId); } catch (err) { /* sin captura */ }
    draw.current = { color: draw.color, pts: [drawPoint(e)] };
    draw.lines.push(draw.current);
    renderDraw(dctx, 1);
  });
  dc.addEventListener('pointermove', function (e) {
    if (!draw.current) return;
    draw.current.pts.push(drawPoint(e));
    renderDraw(dctx, 1);
  });
  ['pointerup', 'pointercancel'].forEach(function (ev) {
    dc.addEventListener(ev, function () { draw.current = null; });
  });

  $('btn-draw-clear').addEventListener('click', function () {
    draw.lines = [];
    renderDraw(dctx, 1);
  });

  $('btn-draw-next').addEventListener('click', function () {
    if (!draw.lines.length) { say('primero_dibuja'); return; }
    draw.image = exportDrawing();
    $('word-drawing').src = draw.image;
    $('word-input').value = '';
    draw.cat = null;
    $('word-cats').querySelectorAll('.chip').forEach(function (x) { x.classList.remove('selected'); });
    $('word-error').textContent = '';
    openOverlay('word');
    say('que_dibujaste');
    setTimeout(function () { $('word-input').focus(); }, 100);
  });

  // Imagen del dibujo recortada a lo que se dibujó, para que se vea grande.
  function exportDrawing() {
    var full = document.createElement('canvas'), k = 600 / dc.clientWidth;
    full.width = 600;
    full.height = Math.round(dc.clientHeight * k);
    renderDraw(full.getContext('2d'), k);
    var xs = [], ys = [];
    draw.lines.forEach(function (ln) { ln.pts.forEach(function (p) { xs.push(p[0] * 600); ys.push(p[1] * 600); }); });
    var m = 0.04 * 600; // margen: medio grosor del trazo y un poco de aire
    var x0 = Math.max(0, Math.min.apply(null, xs) - m), y0 = Math.max(0, Math.min.apply(null, ys) - m);
    var x1 = Math.min(full.width, Math.max.apply(null, xs) + m), y1 = Math.min(full.height, Math.max.apply(null, ys) + m);
    var side = Math.max(x1 - x0, y1 - y0, 60);
    var out = document.createElement('canvas');
    out.width = out.height = 300;
    var ctx = out.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, 300, 300);
    // Centrado en un cuadrado.
    var sc = 300 / side;
    ctx.drawImage(full, x0, y0, x1 - x0, y1 - y0,
      (300 - (x1 - x0) * sc) / 2, (300 - (y1 - y0) * sc) / 2, (x1 - x0) * sc, (y1 - y0) * sc);
    return out.toDataURL('image/png');
  }

  // Categorías para el dibujo propio (opcional).
  Object.keys(window.CATEGORIES).forEach(function (k) {
    var c = window.CATEGORIES[k], b = document.createElement('button');
    b.className = 'chip';
    b.setAttribute('data-cat', k);
    b.textContent = c.icon + ' ' + c.name;
    b.addEventListener('click', function () {
      draw.cat = draw.cat === k ? null : k;
      $('word-cats').querySelectorAll('.chip').forEach(function (x) {
        x.classList.toggle('selected', x.getAttribute('data-cat') === draw.cat);
      });
    });
    $('word-cats').appendChild(b);
  });

  $('btn-word-back').addEventListener('click', function () { closeOverlay('word'); });

  // Mayúsculas, sin tildes ni espacios (la Ñ se respeta).
  function normalizeWord(t) {
    return t.toUpperCase().replace(/Ñ/g, '\u0001').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/\u0001/g, 'Ñ').replace(/[^A-ZÑ]/g, '');
  }

  function acceptWord() {
    var word = normalizeWord($('word-input').value);
    if (word.length < 2) {
      $('word-error').style.color = 'var(--no)';
      $('word-error').textContent = 'Escribe una palabra de al menos 2 letras';
      return;
    }
    $('word-input').blur();
    startGame({ word: word, image: draw.image, cat: draw.cat }, 'pick');
  }
  $('btn-word-ok').addEventListener('click', acceptWord);
  $('word-input').addEventListener('keydown', function (e) { if (e.key === 'Enter') acceptWord(); });

  function confetti() {
    var box = $('confetti'), colors = ['#ff7a45', '#4fc3f7', '#2ecc71', '#ffd84d', '#ff6fa8', '#9b59b6'];
    for (var i = 0; i < 70; i++) {
      var c = document.createElement('i');
      c.style.left = Math.random() * 100 + 'vw';
      c.style.background = colors[i % colors.length];
      c.style.animationDuration = 1.8 + Math.random() * 1.8 + 's';
      c.style.animationDelay = Math.random() * 0.6 + 's';
      box.appendChild(c);
    }
    setTimeout(function () { box.innerHTML = ''; }, 4500);
  }

  /* ---------- Arranque ---------- */
  renderHome();
  if (window.speechSynthesis) speechSynthesis.getVoices();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(function () { /* sin modo offline */ });
  }
})();
