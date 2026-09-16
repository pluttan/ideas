'use strict';

// ==========================
// ===   Состояние UI     ===
// ==========================

const PAGE = 48;               // карточек за один проход отрисовки
const DIFF_RANGES = [
  { key: 'easy',  label: 'Просто',  hint: '0–2', test: d => d !== null && d <= 2 },
  { key: 'mid',   label: 'Средне',  hint: '3–5', test: d => d >= 3 && d <= 5 },
  { key: 'hard',  label: 'Сложно',  hint: '6–8', test: d => d >= 6 && d <= 8 },
  { key: 'crazy', label: 'Жесть',   hint: '9–10', test: d => d >= 9 },
];
const SORTS = [
  { key: 'default', label: 'По разделам' },
  { key: 'easy',    label: 'Сначала простые' },
  { key: 'hard',    label: 'Сначала сложные' },
  { key: 'az',      label: 'По алфавиту' },
];

const state = {
  all: [],
  view: [],
  shown: 0,
  q: '',
  section: null,
  diff: null,
  sort: 'default',
};

const $ = sel => document.querySelector(sel);
const grid = $('#grid');

// ==========================
// ===      Загрузка      ===
// ==========================

fetch('data/ideas.json')
  .then(r => r.json())
  .then(data => {
    state.all = data.ideas.map((it, i) => ({ ...it, i, hay: (it.title + ' ' + it.desc + ' ' + (it.tags || []).join(' ')).toLowerCase() }));
    buildSections(data.sections);
    buildChips();
    readHash();
    apply();
  })
  .catch(() => {
    $('#empty').hidden = false;
    $('#empty').querySelector('.empty-title').textContent = 'Каталог не загрузился';
  });

// ==========================
// ===      Фильтры       ===
// ==========================

function buildSections(sections) {
  const box = $('#sections');
  const counts = new Map();
  for (const it of state.all) counts.set(it.section, (counts.get(it.section) || 0) + 1);

  const mk = (name, label) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.setAttribute('aria-pressed', String(state.section === name));
    b.dataset.section = name === null ? '' : name;
    b.innerHTML = label + `<span class="num">${name === null ? state.all.length : (counts.get(name) || 0)}</span>`;
    b.addEventListener('click', () => {
      state.section = state.section === name ? null : name;
      syncPressed(box, 'section');
      apply();
    });
    return b;
  };

  box.append(mk(null, 'Все идеи'));
  for (const s of sections) if (counts.get(s)) box.append(mk(s, s));
}

function buildChips() {
  const dbox = $('#difficulty');
  for (const r of DIFF_RANGES) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.dataset.diff = r.key;
    b.setAttribute('aria-pressed', 'false');
    b.innerHTML = `${r.label}<span class="num">${r.hint}</span>`;
    b.addEventListener('click', () => {
      state.diff = state.diff === r.key ? null : r.key;
      syncPressed(dbox, 'diff');
      apply();
    });
    dbox.append(b);
  }

  const sbox = $('#sort');
  for (const s of SORTS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.dataset.sort = s.key;
    b.setAttribute('aria-pressed', String(state.sort === s.key));
    b.textContent = s.label;
    b.addEventListener('click', () => {
      state.sort = s.key;
      syncPressed(sbox, 'sort');
      apply();
    });
    sbox.append(b);
  }
}

function syncPressed(box, kind) {
  for (const b of box.querySelectorAll('.chip')) {
    const v = kind === 'section' ? (b.dataset.section || null) : b.dataset[kind];
    const on = kind === 'sort' ? state.sort === v : state[kind] === v;
    b.setAttribute('aria-pressed', String(on));
  }
}

// ==========================
// ===      Отрисовка     ===
// ==========================

function apply() {
  const q = state.q.trim().toLowerCase();
  const words = q ? q.split(/\s+/) : [];
  const range = DIFF_RANGES.find(r => r.key === state.diff);

  state.view = state.all.filter(it => {
    if (state.section && it.section !== state.section) return false;
    if (range && !range.test(it.diff === undefined ? null : it.diff)) return false;
    for (const w of words) if (!it.hay.includes(w)) return false;
    return true;
  });

  const by = {
    easy: (a, b) => (a.diff ?? 99) - (b.diff ?? 99),
    hard: (a, b) => (b.diff ?? -1) - (a.diff ?? -1),
    az: (a, b) => a.title.localeCompare(b.title, 'ru'),
    default: (a, b) => a.i - b.i,
  }[state.sort];
  state.view.sort(by);

  grid.textContent = '';
  state.shown = 0;
  renderMore();

  $('#empty').hidden = state.view.length > 0;
  $('#counter').innerHTML = `<b>${state.view.length}</b> ${plural(state.view.length, 'идея', 'идеи', 'идей')}`
    + (state.view.length !== state.all.length ? ` из ${state.all.length}` : '');
  $('#reset').hidden = !(state.q || state.section || state.diff || state.sort !== 'default');
  $('#clear-q').hidden = !state.q;
  writeHash();
}

function renderMore() {
  const slice = state.view.slice(state.shown, state.shown + PAGE);
  if (!slice.length) return;
  const frag = document.createDocumentFragment();
  const fresh = [];
  for (const it of slice) {
    const el = card(it);
    fresh.push(el);
    frag.append(el);
  }
  grid.append(frag);
  state.shown += slice.length;
  // обрезку видно только после вставки в документ
  for (const el of fresh) {
    const p = el.querySelector('p');
    if (p && p.scrollHeight > p.clientHeight + 4) el.classList.add('clamped');
  }
}

grid.addEventListener('click', e => {
  if (e.target.closest('a, video')) return;
  const el = e.target.closest('.card.clamped');
  if (el) el.classList.toggle('open');
});

function card(it) {
  const el = document.createElement('article');
  el.className = 'card';
  el.id = 'i' + it.i;

  const top = document.createElement('div');
  top.className = 'card-top';

  const h = document.createElement('h2');
  h.innerHTML = highlight(it.title);
  top.append(h);
  if (it.diff !== null && it.diff !== undefined) top.append(diffBadge(it.diff));
  el.append(top);

  if (it.desc) {
    const p = document.createElement('p');
    p.innerHTML = highlight(it.desc);
    el.append(p);
  }

  if (it.video) {
    const v = document.createElement('video');
    v.src = it.video;
    v.controls = true;
    v.preload = 'metadata';   // первый кадр вместо чёрного прямоугольника
    v.playsInline = true;
    el.append(v);
  } else if (it.image) {
    const img = document.createElement('img');
    img.className = 'shot';
    img.src = it.image;
    img.alt = '';
    img.loading = 'lazy';
    img.decoding = 'async';
    el.append(img);
  }

  const foot = document.createElement('div');
  foot.className = 'card-foot';
  const tag = document.createElement('span');
  tag.className = 'tag';
  tag.textContent = it.section;
  foot.append(tag);
  for (const t of (it.tags || []).slice(0, 2)) {
    const s = document.createElement('span');
    s.className = 'tag';
    s.textContent = t;
    foot.append(s);
  }
  if (it.link) {
    const a = document.createElement('a');
    a.className = 'src';
    a.href = it.link;
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = 'Посмотреть →';
    foot.append(a);
  }
  el.append(foot);
  return el;
}

function diffBadge(d) {
  const box = document.createElement('div');
  const cls = d <= 2 ? 'd-easy' : d <= 5 ? 'd-mid' : d <= 8 ? 'd-hard' : 'd-crazy';
  const word = d <= 2 ? 'просто' : d <= 5 ? 'средне' : d <= 8 ? 'сложно' : 'жесть';
  box.className = 'diff ' + cls;
  box.title = `Сложность повторения: ${d} из 10`;
  box.innerHTML = `<span class="diff-num">${d}</span>`
    + `<span class="diff-bar"><i style="width:${d * 10}%"></i></span>`
    + `<span class="diff-word">${word}</span>`;
  return box;
}

function highlight(text) {
  const safe = text.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const q = state.q.trim();
  if (!q) return safe;
  const words = q.split(/\s+/).filter(w => w.length > 1)
    .map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (!words.length) return safe;
  return safe.replace(new RegExp('(' + words.join('|') + ')', 'gi'), '<mark>$1</mark>');
}

function plural(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
}

// ==========================
// ===      События       ===
// ==========================

let timer = null;
$('#q').addEventListener('input', e => {
  clearTimeout(timer);
  const v = e.target.value;
  timer = setTimeout(() => { state.q = v; apply(); }, 130);
});

$('#clear-q').addEventListener('click', () => {
  $('#q').value = '';
  state.q = '';
  apply();
  $('#q').focus();
});

$('#reset').addEventListener('click', () => {
  state.q = ''; state.section = null; state.diff = null; state.sort = 'default';
  $('#q').value = '';
  syncPressed($('#sections'), 'section');
  syncPressed($('#difficulty'), 'diff');
  syncPressed($('#sort'), 'sort');
  apply();
});

$('#lucky').addEventListener('click', () => {
  if (!state.view.length) return;
  const pick = state.view[Math.floor(Math.random() * state.view.length)];
  const idx = state.view.indexOf(pick);
  while (state.shown <= idx) renderMore();
  const el = document.getElementById('i' + pick.i);
  if (!el) return;
  el.scrollIntoView({ block: 'center' });
  el.classList.add('flash');
  setTimeout(() => el.classList.remove('flash'), 1600);
});

new IntersectionObserver(entries => {
  if (entries.some(e => e.isIntersecting)) renderMore();
}, { rootMargin: '600px' }).observe($('#sentinel'));

document.addEventListener('keydown', e => {
  if (e.key === '/' && document.activeElement !== $('#q')) {
    e.preventDefault();
    $('#q').focus();
  }
  if (e.key === 'Escape' && document.activeElement === $('#q')) $('#q').blur();
});

// ==========================
// ===  Состояние в URL   ===
// ==========================

function writeHash() {
  const p = new URLSearchParams();
  if (state.q) p.set('q', state.q);
  if (state.section) p.set('r', state.section);
  if (state.diff) p.set('d', state.diff);
  if (state.sort !== 'default') p.set('s', state.sort);
  const h = p.toString();
  history.replaceState(null, '', h ? '#' + h : location.pathname);
}

function readHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  state.q = p.get('q') || '';
  state.section = p.get('r');
  state.diff = p.get('d');
  state.sort = p.get('s') || 'default';
  $('#q').value = state.q;
  syncPressed($('#sections'), 'section');
  syncPressed($('#difficulty'), 'diff');
  syncPressed($('#sort'), 'sort');
}
