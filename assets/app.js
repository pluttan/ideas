'use strict';

// ==========================
// ===      Settings      ===
// ==========================

const PAGE = 36;               // tiles per render pass
const ICONS = 'assets/icons.svg';
const DIFF_RANGES = [
  { key: 'easy',  label: 'Просто', test: d => d !== null && d <= 2 },
  { key: 'mid',   label: 'Средне', test: d => d >= 3 && d <= 5 },
  { key: 'hard',  label: 'Сложно', test: d => d >= 6 && d <= 8 },
  { key: 'crazy', label: 'Жесть',  test: d => d >= 9 },
];
const SORTS = [
  { key: 'default', label: 'По разделам' },
  { key: 'new',     label: 'Сначала новые' },
  { key: 'easy',    label: 'Сначала простые' },
  { key: 'hard',    label: 'Сначала сложные' },
  { key: 'az',      label: 'По алфавиту' },
];
// picks stack with every other filter: each one narrows the list further
const PICKS = [
  { key: 'fav',   label: 'Избранное', icon: 'star', test: it => it.fav },
  { key: 'video', label: 'С видео',   icon: 'play', test: it => Boolean(it.video || it.yt) },
];
// youtube stills: sd is sharp enough for a tile, hq always exists as the fallback
const YT_SIZES = ['sddefault', 'hqdefault'];

const state = {
  all: [],
  view: [],
  shown: 0,
  q: '',
  section: null,
  diff: null,
  sort: 'default',
  picks: new Set(),
};

const $ = sel => document.querySelector(sel);
const grid = $('#grid');

const icon = (id, cls = 'i') =>
  `<svg class="${cls}" aria-hidden="true"><use href="${ICONS}#${id}"/></svg>`;

// ==========================
// ===      Loading       ===
// ==========================

skeleton();

fetch('data/ideas.json')
  .then(r => r.json())
  .then(data => {
    state.all = data.ideas.map((it, i) => ({
      ...it, i, hay: (it.title + ' ' + it.desc + ' ' + (it.tags || []).join(' ')).toLowerCase(),
    }));
    buildSections(data.sections);
    buildControls();
    readHash();
    apply();
  })
  .catch(() => {
    grid.textContent = '';
    $('#empty').hidden = false;
    $('#empty .empty-title').textContent = 'Каталог не загрузился';
    $('#empty p:last-child').textContent = 'Обнови страницу: данные не доехали.';
  });

function skeleton() {
  const ghost = '<article class="tile ghost"><div class="thumb"></div><i></i><i></i><i></i></article>';
  grid.innerHTML = ghost.repeat(8);
}

// ==========================
// ===      Filters       ===
// ==========================

function buildSections(sections) {
  const box = $('#sections');
  const counts = new Map();
  for (const it of state.all) counts.set(it.section, (counts.get(it.section) || 0) + 1);

  const mk = (name, label, n) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'tab';
    b.dataset.section = name || '';
    b.innerHTML = `${label}<span class="n">${n}</span>`;
    b.addEventListener('click', () => {
      state.section = state.section === name ? null : name;
      sync();
      apply();
    });
    return b;
  };

  box.append(mk(null, 'Все', state.all.length));
  for (const s of sections) if (counts.get(s)) box.append(mk(s, s, counts.get(s)));
}

function buildControls() {
  const pbox = $('#picks');
  for (const pk of PICKS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'toggle';
    b.dataset.pick = pk.key;
    b.innerHTML = `${icon(pk.icon)}${pk.label}<span class="n">${state.all.filter(pk.test).length}</span>`;
    b.addEventListener('click', () => {
      state.picks.has(pk.key) ? state.picks.delete(pk.key) : state.picks.add(pk.key);
      sync();
      apply();
    });
    pbox.append(b);
  }

  const dbox = $('#difficulty');
  const any = document.createElement('button');
  any.type = 'button';
  any.dataset.diff = '';
  any.textContent = 'Любая';
  dbox.append(any);
  for (const r of DIFF_RANGES) {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.diff = r.key;
    b.textContent = r.label;
    dbox.append(b);
  }
  dbox.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    state.diff = b.dataset.diff || null;
    sync();
    apply();
  });

  const sel = $('#sort');
  for (const s of SORTS) sel.add(new Option(s.label, s.key));
  sel.addEventListener('change', () => { state.sort = sel.value; apply(); });
}

// reflect state on every control in one place, so no control can drift out of sync
function sync() {
  for (const b of document.querySelectorAll('#sections .tab')) {
    b.setAttribute('aria-pressed', String((b.dataset.section || null) === state.section));
  }
  for (const b of document.querySelectorAll('#picks .toggle')) {
    b.setAttribute('aria-pressed', String(state.picks.has(b.dataset.pick)));
  }
  for (const b of document.querySelectorAll('#difficulty button')) {
    b.setAttribute('aria-pressed', String((b.dataset.diff || null) === state.diff));
  }
  $('#sort').value = state.sort;
  $('#q').value = state.q;
}

// ==========================
// ===      Rendering     ===
// ==========================

function apply() {
  const words = state.q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const range = DIFF_RANGES.find(r => r.key === state.diff);
  const picks = PICKS.filter(pk => state.picks.has(pk.key));

  state.view = state.all.filter(it => {
    if (state.section && it.section !== state.section) return false;
    if (range && !range.test(it.diff ?? null)) return false;
    for (const pk of picks) if (!pk.test(it)) return false;
    for (const w of words) if (!it.hay.includes(w)) return false;
    return true;
  });

  const by = {
    easy: (a, b) => (a.diff ?? 99) - (b.diff ?? 99),
    hard: (a, b) => (b.diff ?? -1) - (a.diff ?? -1),
    az: (a, b) => a.title.localeCompare(b.title, 'ru'),
    // undated ideas sink to the bottom instead of floating above everything
    new: (a, b) => (b.date || '').localeCompare(a.date || '') || a.i - b.i,
    default: (a, b) => a.i - b.i,
  }[state.sort] || ((a, b) => a.i - b.i);
  state.view.sort(by);

  grid.textContent = '';
  grid.removeAttribute('aria-busy');
  state.shown = 0;
  renderMore();

  const n = state.view.length;
  $('#empty').hidden = n > 0;
  $('#counter').innerHTML = `<b>${n}</b> ${plural(n, 'идея', 'идеи', 'идей')}`
    + (n !== state.all.length ? ` из ${state.all.length}` : '');
  $('#reset').hidden = !(state.q || state.section || state.diff || state.picks.size || state.sort !== 'default');
  $('#clear-q').hidden = !state.q;
  writeHash();
}

function renderMore() {
  const slice = state.view.slice(state.shown, state.shown + PAGE);
  if (!slice.length) return;
  const frag = document.createDocumentFragment();
  slice.forEach((it, k) => frag.append(tile(it, k)));
  grid.append(frag);
  state.shown += slice.length;
}

function tile(it, k) {
  const el = document.createElement('article');
  el.className = 'tile';
  el.id = 'i' + it.i;
  el.style.setProperty('--k', k);

  el.append(thumb(it));

  const meta = document.createElement('div');
  meta.className = 'meta';
  meta.innerHTML = (it.fav ? `<span class="fav" title="Избранное">${icon('star-fill')}</span>` : '')
    + `<span class="sec">${esc(it.section)}</span>`
    + (it.diff != null ? `<span class="diff" title="Насколько сложно повторить дома: 0 проще всего, 10 сложнее всего">сложность <b>${it.diff}</b>/10</span>` : '');
  el.append(meta);

  const h = document.createElement('h2');
  h.innerHTML = it.link
    ? `<a href="${esc(it.link)}" target="_blank" rel="noopener">${highlight(it.title)}</a>`
    : highlight(it.title);
  el.append(h);

  if (it.desc) {
    const p = document.createElement('p');
    p.className = 'desc';
    p.innerHTML = highlight(it.desc);
    p.addEventListener('click', () => el.classList.toggle('open'));
    el.append(p);
  }
  if (it.also && it.also.length) {
    // other takes on the same idea that were folded into this card
    const more = document.createElement('p');
    more.className = 'also';
    more.innerHTML = 'Ещё примеры: ' + it.also.map((a, k) =>
      `<a href="${esc(a.link || a.video || a.image)}" target="_blank" rel="noopener">${k + 2}</a>`).join(' ');
    el.append(more);
  }
  return el;
}

// the picture decides what pressing it does: play a clip, open the video, or nothing
function thumb(it) {
  const still = it.poster || it.image;
  if (it.video) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'thumb';
    b.setAttribute('aria-label', 'Смотреть ролик: ' + it.title);
    b.innerHTML = still ? `<img src="${esc(still)}" alt="" loading="lazy" decoding="async">` : '';
    b.addEventListener('click', () => {
      const v = document.createElement('video');
      v.src = it.video;
      if (still) v.poster = still;
      v.controls = true;
      v.autoplay = true;
      v.playsInline = true;
      const box = document.createElement('div');
      box.className = 'thumb bare';
      box.append(v);
      b.replaceWith(box);
    }, { once: true });
    return b;
  }
  if (it.yt) {
    const a = document.createElement('a');
    a.className = 'thumb';
    a.href = it.link;
    a.target = '_blank';
    a.rel = 'noopener';
    a.setAttribute('aria-label', 'Открыть видео: ' + it.title);
    const img = new Image();
    img.alt = '';
    img.loading = 'lazy';
    img.decoding = 'async';
    ytStill(img, it.yt);
    a.append(img);
    return a;
  }
  const d = document.createElement('div');
  d.className = still ? 'thumb bare' : 'thumb empty';
  d.innerHTML = still ? `<img src="${esc(still)}" alt="" loading="lazy" decoding="async">` : 'без кадра';
  return d;
}

function el(it) { return document.getElementById('i' + it.i); }

// a still that fails to load leaves the plain frame instead of a broken-image glyph
grid.addEventListener('error', e => {
  if (e.target.tagName === 'IMG' && !e.target.dataset.yt) e.target.remove();
}, true);

function ytStill(img, id) {
  img.dataset.yt = id;   // has its own fallback chain, the generic handler must not remove it
  let step = 0;
  const next = () => {
    if (step < YT_SIZES.length) img.src = `https://i.ytimg.com/vi/${id}/${YT_SIZES[step++]}.jpg`;
  };
  img.addEventListener('error', next);
  // a missing size comes back as a 120px grey stub rather than an error
  img.addEventListener('load', () => { if (img.naturalWidth <= 120) next(); });
  next();
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function highlight(text) {
  const safe = esc(text);
  const words = state.q.trim().split(/\s+/).filter(w => w.length > 1)
    .map(w => esc(w).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
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
// ===       Events       ===
// ==========================

let timer = null;
$('#q').addEventListener('input', e => {
  clearTimeout(timer);
  const v = e.target.value;
  timer = setTimeout(() => { state.q = v; apply(); }, 130);
});

$('#clear-q').addEventListener('click', () => {
  state.q = '';
  sync();
  apply();
  $('#q').focus();
});

$('#reset').addEventListener('click', () => {
  Object.assign(state, { q: '', section: null, diff: null, sort: 'default' });
  state.picks.clear();
  sync();
  apply();
});

$('#lucky').addEventListener('click', () => {
  if (!state.view.length) return;
  const idx = Math.floor(Math.random() * state.view.length);
  while (state.shown <= idx) renderMore();
  const node = el(state.view[idx]);
  if (!node) return;
  node.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  node.classList.add('flash');
  setTimeout(() => node.classList.remove('flash'), 1800);
});

new IntersectionObserver(entries => {
  if (entries.some(e => e.isIntersecting)) renderMore();
}, { rootMargin: '800px' }).observe($('#sentinel'));

document.addEventListener('keydown', e => {
  if (e.key === '/' && document.activeElement !== $('#q')) {
    e.preventDefault();
    $('#q').focus();
  }
  if (e.key === 'Escape' && document.activeElement === $('#q')) $('#q').blur();
});

// ==========================
// ===   State in the URL ===
// ==========================

function writeHash() {
  const p = new URLSearchParams();
  if (state.q) p.set('q', state.q);
  if (state.section) p.set('r', state.section);
  if (state.diff) p.set('d', state.diff);
  if (state.picks.size) p.set('p', [...state.picks].join(','));
  if (state.sort !== 'default') p.set('s', state.sort);
  const h = p.toString();
  history.replaceState(null, '', h ? '#' + h : location.pathname);
}

function readHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  const known = new Set(PICKS.map(pk => pk.key));
  state.q = p.get('q') || '';
  state.section = p.get('r');
  state.diff = DIFF_RANGES.some(r => r.key === p.get('d')) ? p.get('d') : null;
  state.sort = SORTS.some(s => s.key === p.get('s')) ? p.get('s') : 'default';
  state.picks = new Set((p.get('p') || '').split(',').filter(k => known.has(k)));
  sync();
}
