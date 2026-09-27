'use strict';

// ==========================
// ===     Настройки      ===
// ==========================

const BATCH = 12;          // слайдов за одну дорисовку
const AHEAD = 8;           // всегда держим столько готовых слайдов впереди
const KEEP_BEHIND = 6;     // столько позади оставляем, остальное снимаем
const MAX_ALIVE = 40;      // потолок живых слайдов в документе

const state = { all: [], view: [], built: 0, section: null, fav: true, current: 0, sound: false };

const $ = s => document.querySelector(s);
const ICONS = 'assets/icons.svg';
const icon = id => `<svg class="i" aria-hidden="true"><use href="${ICONS}#${id}"/></svg>`;
const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const blank = (title, text) =>
  `<section class="slide blank"><div class="cap"><h2>${title}</h2><p>${text}</p></div></section>`;
const feed = $('#feed');

// ==========================
// ===      Загрузка      ===
// ==========================

fetch('data/ideas.json')
  .then(r => r.json())
  .then(data => {
    state.sections = data.sections;
    state.all = data.ideas.map((it, i) => ({ ...it, i }));
    const h = new URLSearchParams(location.hash.slice(1));
    state.section = h.get('r');
    // the feed opens on favourites; only an explicit f=0 shows everything
    state.fav = h.get('f') !== '0';
    buildSheet();
    apply();
  })
  .catch(() => {
    feed.innerHTML = blank('Лента не загрузилась', 'Обнови страницу: данные не доехали.');
  });

// тасуем, чтобы каждый заход давал другой порядок
function shuffled(list) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function apply() {
  const pool = state.all.filter(it =>
    (!state.section || it.section === state.section) && (!state.fav || it.fav));
  state.view = shuffled(pool);
  state.built = 0;
  state.current = 0;
  for (const el of feed.children) stopPlayer(el);
  feed.textContent = '';
  grow(BATCH);
  feed.scrollTo({ top: 0 });
  if (feed.firstElementChild) activate(feed.firstElementChild);
  else feed.innerHTML = blank('Здесь пусто',
    'В этом разделе нет избранных идей. Выбери другой раздел или сними «Только избранное».');
  $('#pick-label').textContent = state.section || (state.fav ? 'Избранное' : 'Все разделы');
  $('#pick').classList.toggle('fav', state.fav);
  updatePos();
  const p = new URLSearchParams();
  if (state.section) p.set('r', state.section);
  if (!state.fav) p.set('f', '0');
  history.replaceState(null, '', p.toString() ? '#' + p : location.pathname);
}

// ==========================
// ===   Кольцевой буфер  ===
// ==========================

// дорисовываем вперёд; позади оставляем немного и снимаем остальное,
// поправляя прокрутку на снятую высоту — иначе лента дёрнется под пальцем
function grow(n) {
  const frag = document.createDocumentFragment();
  let added = 0;
  while (added < n && state.built < state.view.length) {
    frag.append(slide(state.view[state.built], state.built));
    state.built++;
    added++;
  }
  if (!added) return;
  feed.append(frag);
}

function prune() {
  const kids = feed.children;
  if (kids.length <= MAX_ALIVE) return;
  const firstPos = +kids[0].dataset.pos;
  const dropCount = Math.min(state.current - KEEP_BEHIND - firstPos, kids.length - MAX_ALIVE + BATCH);
  if (dropCount <= 0) return;
  const h = feed.clientHeight;
  const top = feed.scrollTop;
  for (let i = 0; i < dropCount; i++) {
    const el = kids[0];
    stopPlayer(el);
    el.remove();
  }
  // абсолютное значение, а не сдвиг: браузер мог уже подвинуть прокрутку сам
  feed.scrollTop = Math.max(0, top - dropCount * h);
}

function ensureAhead() {
  const lastPos = state.built - 1;
  if (lastPos - state.current < AHEAD) grow(BATCH);
}

// ==========================
// ===       Слайд        ===
// ==========================

// кадр на весь экран: сначала просим самый крупный, при неудаче спускаемся ниже.
// на отсутствующий размер ютуб отвечает либо ошибкой, либо заглушкой 120 пикселей шириной
const POSTER_SIZES = ['maxresdefault', 'sddefault', 'hqdefault'];

function poster(img, id) {
  let step = 0;
  const next = () => {
    if (step >= POSTER_SIZES.length) return;
    // only maxres is true 16:9; the smaller sizes carry black bars baked into a 4:3 frame
    img.classList.toggle('lb', step > 0);
    img.src = 'https://i.ytimg.com/vi/' + id + '/' + POSTER_SIZES[step++] + '.jpg';
  };
  img.addEventListener('error', next);
  img.addEventListener('load', () => { if (img.naturalWidth <= 120) next(); });
  next();
}

// ==========================
// ===    Media fitting   ===
// ==========================

// How far the media's shape may differ from the screen's before we stop filling
// the screen with it: a landscape clip on a phone is shown whole over a blurred copy.
const FIT_LIMIT = 1.25;
// The youtube player is rendered large and scaled down: its title bar and logo are
// sized in fixed pixels, so at 1280 wide they shrink to a thin rim that this extra
// zoom pushes off the edge, without waiting for them to fade.
const YT_W = 1280, YT_H = 720, YT_TRIM = 1.2;   // title bar is ~8% of 720, 1.2 trims 8.3% per edge

function setAspect(el, ar) {
  if (!ar || !isFinite(ar)) return;
  el.dataset.ar = ar;
  el.style.setProperty('--ar', ar);
  fit(el);
}

function fit(el) {
  const ar = +el.dataset.ar;
  if (!ar) return;
  const sar = (feed.clientWidth || innerWidth) / (feed.clientHeight || innerHeight);
  el.classList.toggle('fit', Math.max(ar / sar, sar / ar) > FIT_LIMIT);
  sizePlayer(el);
}

function sizePlayer(el) {
  const box = el.querySelector('.player');
  if (!box || !box.clientWidth) return;
  const tall = +el.dataset.ar < 1;
  const iw = tall ? YT_H : YT_W, ih = tall ? YT_W : YT_H;
  box.style.setProperty('--iw', iw + 'px');
  box.style.setProperty('--ih', ih + 'px');
  box.style.setProperty('--k', Math.max(box.clientWidth / iw, box.clientHeight / ih) * YT_TRIM);
}

addEventListener('resize', () => { for (const el of feed.children) fit(el); });

function backdrop(src) {
  const img = document.createElement('img');
  img.className = 'bg';
  img.alt = '';
  img.decoding = 'async';
  img.src = src;
  return img;
}

function slide(it, pos) {
  const el = document.createElement('section');
  el.className = 'slide';
  el.dataset.idx = it.i;
  el.dataset.pos = pos;

  if (it.video) {
    const v = document.createElement('video');
    v.src = it.video;
    if (it.poster) {
      v.poster = it.poster;
      // the poster has the clip's shape and arrives long before the clip's metadata
      const bg = backdrop(it.poster);
      bg.addEventListener('load', () => setAspect(el, bg.naturalWidth / bg.naturalHeight), { once: true });
      el.append(bg);
    }
    v.addEventListener('loadedmetadata', () => setAspect(el, v.videoWidth / v.videoHeight), { once: true });
    v.muted = true;
    v.loop = true;
    v.playsInline = true;
    v.preload = 'metadata';
    el.append(v);
  } else if (it.image) {
    const img = still(it.image);
    img.addEventListener('load', () => setAspect(el, img.naturalWidth / img.naturalHeight), { once: true });
    el.append(backdrop(it.image), img);
  } else if (it.yt) {
    setAspect(el, /shorts\//.test(it.link) ? 9 / 16 : 16 / 9);
    el.append(backdrop(`https://i.ytimg.com/vi/${it.yt}/hqdefault.jpg`));
    el.dataset.yt = it.yt;
    const box = document.createElement('div');
    box.className = 'player';
    el.append(box);
    const img = still('');
    img.fetchPriority = pos - state.current < 4 ? 'high' : 'auto';
    poster(img, it.yt);
    el.append(img);
  }

  const cap = document.createElement('div');
  cap.className = 'cap';
  cap.innerHTML = `<div class="meta">${it.fav ? icon('star-fill') : ''}<span>${esc(it.section)}</span></div>`
    + `<h2>${esc(it.title)}</h2>`
    + (it.desc ? `<p>${esc(it.desc)}</p>` : '');
  const p = cap.querySelector('p');
  if (p) p.addEventListener('click', () => el.classList.toggle('open'));
  el.append(cap);

  const rail = document.createElement('div');
  rail.className = 'rail';
  if (it.diff != null) {
    rail.insertAdjacentHTML('beforeend',
      `<div class="act" title="Насколько сложно повторить дома: 0 проще всего, 10 сложнее всего">`
      + `<span class="diff">${it.diff}<small>/10</small></span>сложность</div>`);
  }
  if (it.link) {
    rail.insertAdjacentHTML('beforeend',
      `<a class="act" href="${esc(it.link)}" target="_blank" rel="noopener">`
      + `<span class="round">${icon('out')}</span>Источник</a>`);
  }
  el.append(rail);
  return el;
}

function still(src) {
  const img = document.createElement('img');
  img.className = 'still';
  img.alt = '';
  img.decoding = 'async';
  if (src) img.src = src;
  return img;
}

// ==========================
// ===       Плеер        ===
// ==========================

let ytReady = false;
const pending = [];
window.onYouTubeIframeAPIReady = () => {
  ytReady = true;
  while (pending.length) startPlayer(pending.shift(), false);
};

// сосед заряжается заранее и ждёт на паузе — при свайпе ролик стартует сразу
function startPlayer(el, playNow) {
  const id = el && el.dataset.yt;
  const box = el && el.querySelector('.player');
  if (!id || !box) return;
  if (el._player) {
    if (playNow && el._player.playVideo) el._player.playVideo();
    return;
  }
  if (!ytReady) {
    if (!pending.includes(el)) pending.push(el);
    return;
  }
  const host = document.createElement('div');
  box.append(host);
  sizePlayer(el);
  el._wantPlay = !!playNow;
  const tall = +el.dataset.ar < 1;
  el._player = new YT.Player(host, {
    videoId: id,
    width: tall ? YT_H : YT_W,
    height: tall ? YT_W : YT_H,
    playerVars: {
      autoplay: playNow ? 1 : 0, controls: 0, loop: 1, playlist: id,
      mute: state.sound ? 0 : 1, modestbranding: 1, rel: 0,
      playsinline: 1, iv_load_policy: 3, disablekb: 1,
    },
    events: {
      onReady: e => {
        state.sound ? e.target.unMute() : e.target.mute();
        if (el._wantPlay) e.target.playVideo();
      },
      onStateChange: e => {
        if (e.data !== YT.PlayerState.PLAYING) return;
        clearTimeout(el._t);
        // chrome is already trimmed off; the short delay only skips the first black frame
        el._t = setTimeout(() => el.classList.add('playing'), 200);
      },
      onError: () => el.classList.remove('playing'),
    },
  });
}

function stopPlayer(el) {
  clearTimeout(el._t);
  if (el._player) {
    try { el._player.destroy(); } catch (_) {}
    el._player = null;
  }
  const box = el.querySelector('.player');
  if (box) box.textContent = '';
  el.classList.remove('playing');
  el._wantPlay = false;
}

// ==========================
// ===   Активный слайд   ===
// ==========================

// активный слайд считаем прямо из прокрутки: наблюдатель при быстром листании
// пропускает кадры, и лента застревала без дозагрузки
function activate(el) {
  for (const other of feed.children) {
    if (other === el) continue;
    const v = other.querySelector('video');
    if (v) v.pause();
    const far = Math.abs(+other.dataset.pos - state.current) > 1;
    if (far) stopPlayer(other);
    else if (other._player && other._player.pauseVideo) other._player.pauseVideo();
  }
  const v = el.querySelector('video');
  if (v) { v.muted = !state.sound; v.play().catch(() => {}); }
  startPlayer(el, true);
  const next = el.nextElementSibling;
  if (next) {
    startPlayer(next, false);              // сосед заряжен и ждёт на паузе
    const nv = next.querySelector('video');
    if (nv) nv.preload = 'auto';
  }
}

function onScroll() {
  const kids = feed.children;
  if (!kids.length) return;
  const h = feed.clientHeight || 1;
  const idx = Math.max(0, Math.min(kids.length - 1, Math.round(feed.scrollTop / h)));
  const el = kids[idx];
  const pos = +el.dataset.pos;
  if (pos !== state.current) {
    state.current = pos;
    updatePos();
    activate(el);
  }
  ensureAhead();
  prune();
}

let inScroll = false;
feed.addEventListener('scroll', () => {
  if (inScroll) return;                    // prune двигает прокрутку и снова зовёт обработчик
  inScroll = true;
  try { onScroll(); } finally { inScroll = false; }
}, { passive: true });

// страховка: если браузер придержал событие прокрутки (фон, слабое устройство),
// раз в треть секунды сверяемся с реальным положением ленты
setInterval(() => {
  if (inScroll) return;
  inScroll = true;
  try { onScroll(); } finally { inScroll = false; }
}, 300);


function updatePos() {
  const n = state.view.length;
  // the empty-state slide has no position, so guard against NaN
  $('#pos').textContent = n ? `${Math.min((state.current || 0) + 1, n)} / ${n}` : '0 / 0';
}

feed.addEventListener('scroll', () => {
  const hint = $('#hint');
  if (feed.scrollTop > 40 && !hint.classList.contains('gone')) hint.classList.add('gone');
}, { passive: true });

setTimeout(() => $('#hint').classList.add('gone'), 5000);

// ==========================
// ===      Шторка        ===
// ==========================

function buildSheet() {
  const favBtn = $('#fav-toggle');
  $('#fav-count').textContent = state.all.filter(it => it.fav).length;
  favBtn.setAttribute('aria-pressed', String(state.fav));
  // favourites stack with the section choice, so the switch does not close the sheet
  favBtn.addEventListener('click', () => {
    state.fav = !state.fav;
    favBtn.setAttribute('aria-pressed', String(state.fav));
    apply();
  });

  const box = $('#sheet-list');
  const counts = new Map();
  for (const it of state.all) counts.set(it.section, (counts.get(it.section) || 0) + 1);

  const mk = (name, label, n) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'row';
    b.setAttribute('aria-pressed', String(state.section === name));
    b.innerHTML = `<span>${esc(label)}</span><span class="n">${n}</span>`;
    b.addEventListener('click', () => {
      state.section = name;
      for (const other of box.querySelectorAll('.row')) other.setAttribute('aria-pressed', 'false');
      b.setAttribute('aria-pressed', 'true');
      closeSheet();
      apply();
    });
    return b;
  };

  box.append(mk(null, 'Все разделы', state.all.length));
  for (const sec of state.sections) if (counts.get(sec)) box.append(mk(sec, sec, counts.get(sec)));
}

function openSheet() { $('#sheet').hidden = false; }
function closeSheet() { $('#sheet').hidden = true; }

$('#sound').addEventListener('click', () => {
  state.sound = !state.sound;
  $('#sound').setAttribute('aria-pressed', String(state.sound));
  $('#sound-icon').setAttribute('href', `${ICONS}#${state.sound ? 'sound' : 'mute'}`);
  for (const el of feed.children) {
    const v = el.querySelector('video');
    const active = +el.dataset.pos === state.current;
    if (v) { v.muted = !(state.sound && active); if (active) v.play().catch(() => {}); }
    if (el._player && el._player.unMute) {
      (state.sound && active) ? el._player.unMute() : el._player.mute();
    }
  }
});

$('#pick').addEventListener('click', openSheet);
$('#sheet').addEventListener('click', e => { if (e.target.id === 'sheet') closeSheet(); });

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeSheet();
  if (e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === ' ') {
    e.preventDefault();
    feed.scrollBy({ top: feed.clientHeight, behavior: 'smooth' });
  }
  if (e.key === 'ArrowUp' || e.key === 'PageUp') {
    e.preventDefault();
    feed.scrollBy({ top: -feed.clientHeight, behavior: 'smooth' });
  }
});
