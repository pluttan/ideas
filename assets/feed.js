'use strict';

// ==========================
// ===     Настройки      ===
// ==========================

const BATCH = 10;              // слайдов за одну дорисовку
const NEAR_END = 4;            // за сколько слайдов до конца дорисовывать

// пары оттенков подложки: раздел всегда выглядит одинаково, но лента не монотонная
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

const state = { all: [], view: [], shown: 0, section: null, current: 0 };

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

// тасуем, чтобы каждый заход давал другой порядок — в этом весь смысл ленты
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
  state.shown = 0;
  state.current = 0;
  feed.textContent = '';
  render();
  feed.scrollTo({ top: 0 });
  $('#pick').textContent = state.section || 'Все разделы';
  updatePos();
  const p = new URLSearchParams();
  if (state.section) p.set('r', state.section);
  history.replaceState(null, '', p.toString() ? '#' + p : location.pathname);
}

// ==========================
// ===      Отрисовка     ===
// ==========================

function render() {
  const slice = state.view.slice(state.shown, state.shown + BATCH);
  if (!slice.length) return;
  const frag = document.createDocumentFragment();
  for (const it of slice) frag.append(slide(it));
  feed.append(frag);
  state.shown += slice.length;
  for (const el of feed.querySelectorAll('.slide:not([data-watched])')) {
    el.dataset.watched = '1';
    io.observe(el);
  }
}

function slide(it) {
  const el = document.createElement('section');
  el.className = 'slide';
  el.dataset.idx = it.i;
  const tint = TINTS[(state.sections.indexOf(it.section) + 8) % TINTS.length];
  el.style.setProperty('--tint1', tint[0]);
  el.style.setProperty('--tint2', tint[1]);

  if (it.video) {
    const v = document.createElement('video');
    v.src = it.video;
    v.muted = true;
    v.loop = true;
    v.playsInline = true;
    v.preload = 'none';
    el.append(v);
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
// ===   Активный слайд   ===
// ==========================

const io = new IntersectionObserver(entries => {
  for (const e of entries) {
    const v = e.target.querySelector('video');
    if (e.isIntersecting && e.intersectionRatio > 0.6) {
      state.current = [...feed.children].indexOf(e.target);
      updatePos();
      if (v) { v.preload = 'auto'; v.play().catch(() => {}); }
      if (state.shown - state.current <= NEAR_END) render();
    } else if (v) {
      v.pause();
    }
  }
}, { root: feed, threshold: [0, 0.6, 1] });

function updatePos() {
  $('#pos').textContent = `${Math.min(state.current + 1, state.view.length)} / ${state.view.length}`;
}

feed.addEventListener('scroll', () => {
  const hint = $('#hint');
  if (feed.scrollTop > 40 && !hint.classList.contains('gone')) hint.classList.add('gone');
}, { passive: true });

// подсказка нужна один раз — дальше она только мешает меткам
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
