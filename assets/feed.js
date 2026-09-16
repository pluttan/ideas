'use strict';

// ==========================
// ===     Настройки      ===
// ==========================

const BATCH = 12;          // слайдов за одну дорисовку
const AHEAD = 8;           // всегда держим столько готовых слайдов впереди
const KEEP_BEHIND = 6;     // столько позади оставляем, остальное снимаем
const MAX_ALIVE = 40;      // потолок живых слайдов в документе

// пары оттенков подложки — видны только там, где кадра нет
const TINTS = [
  ['rgba(203,166,247,.30)', 'rgba(137,180,250,.22)'],
  ['rgba(137,180,250,.28)', 'rgba(148,226,213,.20)'],
  ['rgba(166,227,161,.24)', 'rgba(249,226,175,.18)'],
  ['rgba(250,179,135,.26)', 'rgba(243,139,168,.20)'],
  ['rgba(243,139,168,.26)', 'rgba(203,166,247,.20)'],
  ['rgba(148,226,213,.26)', 'rgba(116,199,236,.20)'],
  ['rgba(249,226,175,.24)', 'rgba(250,179,135,.20)'],
  ['rgba(116,199,236,.26)', 'rgba(203,166,247,.18)'],
];

const state = { all: [], view: [], built: 0, section: null, current: 0, sound: false };

const $ = s => document.querySelector(s);
const feed = $('#feed');

// ==========================
// ===      Загрузка      ===
// ==========================

fetch('data/ideas.json')
  .then(r => r.json())
  .then(data => {
    state.sections = data.sections;
    state.all = data.ideas.map((it, i) => ({ ...it, i }));
    state.section = new URLSearchParams(location.hash.slice(1)).get('r');
    buildSheet();
    apply();
  })
  .catch(() => {
    feed.innerHTML = '<section class="slide"><div class="body"><h2>Лента не загрузилась</h2>'
      + '<p>Обнови страницу — данные не доехали.</p></div></section>';
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
  const pool = state.section ? state.all.filter(it => it.section === state.section) : state.all;
  state.view = shuffled(pool);
  state.built = 0;
  state.current = 0;
  for (const el of feed.children) stopPlayer(el);
  feed.textContent = '';
  grow(BATCH);
  feed.scrollTo({ top: 0 });
  if (feed.firstElementChild) activate(feed.firstElementChild);
  $('#pick').textContent = state.section || 'Все разделы';
  updatePos();
  const p = new URLSearchParams();
  if (state.section) p.set('r', state.section);
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

function slide(it, pos) {
  const el = document.createElement('section');
  el.className = 'slide';
  el.dataset.idx = it.i;
  el.dataset.pos = pos;
  const tint = TINTS[(state.sections.indexOf(it.section) + 8) % TINTS.length];
  el.style.setProperty('--tint1', tint[0]);
  el.style.setProperty('--tint2', tint[1]);

  if (it.video) {
    const v = document.createElement('video');
    v.src = it.video;
    v.muted = true;
    v.loop = true;
    v.playsInline = true;
    v.preload = 'metadata';
    el.append(v);
  } else if (it.yt) {
    el.dataset.yt = it.yt;
    const img = document.createElement('img');
    img.className = 'poster';
    img.src = 'https://i.ytimg.com/vi/' + it.yt + '/hqdefault.jpg';
    img.alt = '';
    img.decoding = 'async';
    img.fetchPriority = pos - state.current < 4 ? 'high' : 'auto';
    el.append(img);
    const box = document.createElement('div');
    box.className = 'player';
    el.append(box);
  }

  if (it.diff !== null && it.diff !== undefined) {
    const g = document.createElement('div');
    const cls = it.diff <= 2 ? 'g-easy' : it.diff <= 5 ? 'g-mid' : it.diff <= 8 ? 'g-hard' : 'g-crazy';
    const word = it.diff <= 2 ? 'просто' : it.diff <= 5 ? 'средне' : it.diff <= 8 ? 'сложно' : 'жесть';
    g.className = 'gauge ' + cls;
    g.innerHTML = `<b>${it.diff}</b><i><u style="width:${it.diff * 10}%"></u></i><span>${word}</span>`;
    el.append(g);
  }

  const body = document.createElement('div');
  body.className = 'body';

  const pill = document.createElement('span');
  pill.className = 'pill';
  pill.textContent = it.section;
  body.append(pill);

  const h = document.createElement('h2');
  h.textContent = it.title;
  body.append(h);

  if (it.desc) {
    const p = document.createElement('p');
    p.textContent = it.desc;
    body.append(p);
    const more = document.createElement('button');
    more.type = 'button';
    more.className = 'more';
    more.textContent = 'Читать целиком';
    more.hidden = true;
    more.addEventListener('click', () => {
      el.classList.toggle('open');
      more.textContent = el.classList.contains('open') ? 'Свернуть' : 'Читать целиком';
    });
    body.append(more);
    requestAnimationFrame(() => { more.hidden = p.scrollHeight <= p.clientHeight + 4; });
  }

  const row = document.createElement('div');
  row.className = 'row';
  for (const t of (it.tags || []).slice(0, 3)) {
    const s = document.createElement('span');
    s.className = 'tag';
    s.textContent = t;
    row.append(s);
  }
  if (it.link) {
    const a = document.createElement('a');
    a.className = 'go';
    a.href = it.link;
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = 'Посмотреть';
    row.append(a);
  }
  body.append(row);

  el.append(body);
  return el;
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
  el._wantPlay = !!playNow;
  el._player = new YT.Player(host, {
    videoId: id,
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
        // плеер первую секунду показывает название и кнопки — держим кадр, пока они не уйдут
        el._t = setTimeout(() => el.classList.add('playing'), 1100);
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
  $('#pos').textContent = `${Math.min(state.current + 1, state.view.length)} / ${state.view.length}`;
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
  const box = $('#sheet-list');
  const counts = new Map();
  for (const it of state.all) counts.set(it.section, (counts.get(it.section) || 0) + 1);

  const mk = (name, label, n) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('aria-pressed', String(state.section === name));
    b.innerHTML = `${label}<span class="num">${n}</span>`;
    b.addEventListener('click', () => {
      state.section = name;
      for (const other of box.querySelectorAll('button')) other.setAttribute('aria-pressed', 'false');
      b.setAttribute('aria-pressed', 'true');
      closeSheet();
      apply();
    });
    return b;
  };

  box.append(mk(null, 'Все разделы', state.all.length));
  for (const s of state.sections) if (counts.get(s)) box.append(mk(s, s, counts.get(s)));
}

function openSheet() { $('#sheet').hidden = false; }
function closeSheet() { $('#sheet').hidden = true; }

$('#sound').addEventListener('click', () => {
  state.sound = !state.sound;
  $('#sound').setAttribute('aria-pressed', String(state.sound));
  $('#sound').textContent = state.sound ? 'Звук вкл' : 'Звук выкл';
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
