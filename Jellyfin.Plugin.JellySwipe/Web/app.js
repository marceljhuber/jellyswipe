// JellySwipe client — vanilla JS, no build step.
const $ = (sel, root = document) => root.querySelector(sel);
const app = $('#app');
const overlayRoot = $('#overlay-root');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const store = {
  get(k, d = null) { try { return JSON.parse(localStorage.getItem(`js.${k}`)) ?? d; } catch { return d; } },
  set(k, v) { try { v == null ? localStorage.removeItem(`js.${k}`) : localStorage.setItem(`js.${k}`, JSON.stringify(v)); } catch { /* private mode */ } },
};
const vibrate = (p) => { try { navigator.vibrate?.(p); } catch { /* unsupported */ } };

// ---------- Icons ----------
const I = {
  flame: '<svg viewBox="0 0 24 24"><defs><linearGradient id="fg" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#fd267a"/><stop offset="1" stop-color="#ff7854"/></linearGradient></defs><path fill="url(#fg)" d="M8.2 9.1c.1 1.8.9 3.1 2.1 3.5-.5-3.6 1.2-7.1 4.6-9.3-.3 2.5.6 4.4 2.2 6.1 1.5 1.6 2.6 3.4 2.6 5.9 0 4.2-3.4 7.2-7.7 7.2S4.3 19.6 4.3 15.5c0-2.8 1.5-5 3.9-6.4Z"/></svg>',
  nope: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M14.83 12l6.58-6.59a2 2 0 1 0-2.82-2.82L12 9.17 5.41 2.59a2 2 0 1 0-2.82 2.82L9.17 12l-6.58 6.59a2 2 0 1 0 2.82 2.82L12 14.83l6.59 6.58a2 2 0 0 0 2.82-2.82z"/></svg>',
  like: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 21.6c-.4 0-.8-.1-1.1-.4C5.2 16.3 1.5 13 1.5 8.6 1.5 5.3 4 2.8 7.2 2.8c1.9 0 3.6.9 4.8 2.4 1.2-1.5 2.9-2.4 4.8-2.4 3.2 0 5.7 2.5 5.7 5.8 0 4.4-3.7 7.7-9.4 12.6-.3.3-.7.4-1.1.4z"/></svg>',
  star: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z"/></svg>',
  rewind: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12.5 3a9 9 0 0 0-8.9 7.7L2.3 9.4a1 1 0 0 0-1.4 1.4l3 3a1 1 0 0 0 1.4 0l3-3a1 1 0 1 0-1.4-1.4l-1.2 1.2A7 7 0 1 1 12.5 19a1 1 0 1 0 0 2 9 9 0 0 0 0-18z"/></svg>',
  info: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 7.5a1.6 1.6 0 1 1 0-3.2 1.6 1.6 0 0 1 0 3.2zm1.4 11.2a1.4 1.4 0 0 1-2.8 0v-7.4a1.4 1.4 0 0 1 2.8 0z"/></svg>',
  back: '<svg viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7"/></svg>',
  close: '<svg viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" d="M6 6l12 12M18 6L6 18"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  play: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M7 4.5v15a1 1 0 0 0 1.5.9l12-7.5a1 1 0 0 0 0-1.8l-12-7.5A1 1 0 0 0 7 4.5z"/></svg>',
  external: '<svg viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>',
  share: '<svg viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" d="M12 3v12M7 8l5-5 5 5M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5"/></svg>',
  tv: '<svg viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" d="M3 5h18v12H3zM8 21h8"/></svg>',
  clock: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2.2"/><path fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" d="M12 7v5l3 2"/></svg>',
  starSm: '<svg viewBox="0 0 24 24"><path fill="#f5b748" d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z"/></svg>',
};
const logo = `<span class="logo">${I.flame}<span>jellyswipe</span></span>`;

// ---------- API ----------
// Hosts use their Jellyfin token: either the Jellyfin web session on this origin, or our own login.
function jellyfinToken() {
  try {
    const creds = JSON.parse(localStorage.getItem('jellyfin_credentials') || '{}');
    const servers = (creds.Servers || []).filter((x) => x.AccessToken).sort((x, y) => (y.DateLastAccessed || 0) - (x.DateLastAccessed || 0));
    return servers[0]?.AccessToken || null;
  } catch { return null; }
}

async function api(path, body, method) {
  const headers = {};
  const token = jellyfinToken();
  if (token) headers.Authorization = `MediaBrowser Token="${token}"`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`api/${path}`, body !== undefined ? { method: method || 'POST', headers, body: JSON.stringify(body) } : { headers });
  const data = res.headers.get('content-type')?.includes('json') ? await res.json() : null;
  if (!res.ok) throw Object.assign(new Error(data?.error || `Request failed (${res.status})`), { status: res.status });
  return data;
}
// Jellyfin serves images anonymously; the app lives at <server>/JellySwipe/.
const img = (id, ref = 'Primary/0', w = 720) => `../Items/${id}/Images/${ref}?fillWidth=${w}&quality=85`;

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

// ---------- App state ----------
const S = {
  jf: null,
  session: store.get('session'), // { code, secret, playerId }
  room: null,
  deck: [],
  deckRound: null,
  pos: 0,
  screen: null,
  known: new Set(),
  primed: false,
  overlayOpen: false,
  es: null,
};
const joinParam = new URLSearchParams(location.search).get('join');

function avatar(p, cls = '') {
  if (!p) return '';
  return `<div class="avatar ${cls} ${p.online === false ? 'offline' : ''}" style="background:${p.color}" title="${esc(p.name)}">${esc(p.name[0]?.toUpperCase() || '?')}${cls.includes('sm') ? '' : '<i class="dot"></i>'}</div>`;
}
const playerById = (id) => S.room?.players.find((p) => p.id === id);
const fmtRuntime = (m) => (m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`);
function subline(it) {
  const parts = [it.year, it.type === 'Series' ? (it.seasons ? `${it.seasons} season${it.seasons > 1 ? 's' : ''}` : 'Series') : it.runtime && fmtRuntime(it.runtime), it.official];
  return parts.filter(Boolean).join(' · ');
}

// ---------- Router ----------
async function boot() {
  try { S.jf = await api('status'); } catch { S.jf = { user: null, allowGuests: true }; }
  if (S.session) return connectRoom(S.session);
  route();
}

function route() {
  if (S.room) {
    if (S.room.status === 'lobby') return show('lobby', renderLobby);
    if (S.room.status === 'playing') return show('game', renderGame);
    return show('results', renderResults);
  }
  return show('home', renderHome);
}

function show(name, fn) {
  const same = S.screen === name;
  S.screen = name;
  fn(same);
}

// ---------- Home ----------
function renderHome() {
  const name = store.get('name', '') || S.jf?.user || '';
  app.innerHTML = `
    <div class="screen">
      <div class="topbar"><div class="side"></div>${logo}<div class="side"></div></div>
      <div class="scroll">
        <div class="hero">
          <div>${I.flame.replace('<svg', '<svg class="big-logo"')}</div>
          <h1>Swipe. Match. Watch.</h1>
          <p>Stop scrolling for an hour — swipe your Jellyfin library together until you match.</p>
        </div>
        <div class="stack" style="margin-top:28px">
          <div class="field"><label>Your name</label><input class="input" id="name" maxlength="20" placeholder="e.g. Alex" value="${esc(name)}" autocomplete="nickname"></div>
          ${S.jf?.host ? '<button class="btn btn-primary" id="create">Create game</button>' : '<a class="btn btn-primary" href="../web/" style="text-decoration:none">Sign in to Jellyfin to host</a>'}
          <div class="divider">or join a lobby</div>
          <input class="input code-input" id="code" inputmode="numeric" pattern="[0-9]*" maxlength="4" placeholder="····" value="${esc(joinParam || '')}" autocomplete="off">
          <div class="error" id="err"></div>
          <button class="btn btn-outline" id="join">Join</button>
        </div>
      </div>
      <div class="sticky-footer hint">${S.jf?.host ? `Hosting as <b>${esc(S.jf.host)}</b>` : 'Joining a lobby needs no account'} · <a href="../web/">Jellyfin</a></div>
    </div>`;
  const nameEl = $('#name');
  const codeEl = $('#code');
  const needName = () => {
    const n = nameEl.value.trim();
    if (!n) { nameEl.focus(); $('#err').textContent = 'Enter your name first'; return null; }
    store.set('name', n);
    return n;
  };
  $('#create')?.addEventListener('click', () => { if (needName()) show('create', renderCreate); });

  const join = async () => {
    const n = needName();
    if (!n) return;
    const code = codeEl.value.trim();
    if (!/^\d{4}$/.test(code)) { $('#err').textContent = 'Lobby codes have 4 digits'; codeEl.focus(); return; }
    try {
      const r = await api(`rooms/${code}/join`, { name: n });
      history.replaceState(null, '', location.pathname);
      connectRoom({ code, secret: r.secret, playerId: r.playerId });
    } catch (e) { $('#err').textContent = e.message; vibrate(80); }
  };
  $('#join').onclick = join;
  codeEl.addEventListener('input', () => {
    codeEl.value = codeEl.value.replace(/\D/g, '').slice(0, 4);
    $('#err').textContent = '';
    if (codeEl.value.length === 4 && nameEl.value.trim()) join();
  });
  if (joinParam && !name) nameEl.focus();
}

// ---------- Create game ----------
async function renderCreate() {
  const saved = store.get('lastSettings', {});
  const sel = { libs: new Set(saved.libraryIds || []), genres: new Set(), goal: saved.goal || 3, unplayed: !!saved.unplayedOnly, autoPlay: null };
  let libs = [];
  let genres = [];
  app.innerHTML = `
    <div class="screen">
      <div class="topbar"><div class="side"><button class="icon-btn" id="back" aria-label="Back">${I.back}</button></div>${logo}<div class="side"></div></div>
      <div class="scroll">
        <div class="section-title">Libraries <small id="libcount"></small></div>
        <div class="tiles" id="libs"><div class="spinner"></div></div>
        <div class="section-title">Genres <small>optional · any if none</small></div>
        <div class="chips" id="genres"><span class="hint">Pick a library first</span></div>
        <div class="section-title">Goal</div>
        <div class="segmented" id="goal">${[1, 3, 5].map((g) => `<button data-g="${g}">${g}<small>match${g > 1 ? 'es' : ''}</small></button>`).join('')}</div>
        <div class="section-title">Options</div>
        <div class="stack">
          <button class="toggle-row" id="unplayed"><span>Only unwatched</span><span class="switch"></span></button>
        </div>
        <div class="section-title">Auto-play the winner on <small>optional</small></div>
        <div class="chips" id="devices"><span class="hint">Looking for Jellyfin devices…</span></div>
        <div class="hint" style="margin-top:8px;text-align:left">Devices show up while a Jellyfin app is open on them (TV, phone, browser).</div>
      </div>
      <div class="sticky-footer"><div class="error" id="err"></div><button class="btn btn-primary" id="go" disabled>Create lobby</button></div>
    </div>`;
  $('#back').onclick = () => show('home', renderHome);

  const paint = () => {
    for (const t of app.querySelectorAll('.tile')) t.classList.toggle('on', sel.libs.has(t.dataset.id));
    for (const c of app.querySelectorAll('#genres .chip')) c.classList.toggle('on', sel.genres.has(c.dataset.id));
    for (const b of app.querySelectorAll('#goal button')) b.classList.toggle('on', Number(b.dataset.g) === sel.goal);
    for (const c of app.querySelectorAll('#devices .chip')) c.classList.toggle('on', (c.dataset.id || null) === (sel.autoPlay?.deviceId || null));
    $('#unplayed .switch').classList.toggle('on', sel.unplayed);
    $('#go').disabled = !sel.libs.size;
    $('#libcount').textContent = sel.libs.size ? `${sel.libs.size} selected` : 'pick at least one';
  };
  const loadGenres = async () => {
    const el = $('#genres');
    if (!sel.libs.size) { el.innerHTML = '<span class="hint">Pick a library first</span>'; genres = []; return; }
    el.innerHTML = '<div class="spinner" style="margin:4px"></div>';
    try {
      genres = await api(`genres?libraryIds=${[...sel.libs].join(',')}`);
      for (const id of [...sel.genres]) if (!genres.some((g) => g.id === id)) sel.genres.delete(id);
      el.innerHTML = genres.length ? genres.map((g) => `<button class="chip" data-id="${g.id}">${esc(g.name)}</button>`).join('') : '<span class="hint">No genres found</span>';
      paint();
    } catch (e) { el.innerHTML = `<span class="error">${esc(e.message)}</span>`; }
  };

  app.firstElementChild.addEventListener('click', (e) => {
    const tile = e.target.closest('.tile');
    const chip = e.target.closest('#genres .chip');
    const goal = e.target.closest('#goal button');
    const dev = e.target.closest('#devices .chip');
    if (tile) { sel.libs.has(tile.dataset.id) ? sel.libs.delete(tile.dataset.id) : sel.libs.add(tile.dataset.id); vibrate(10); loadGenres(); }
    if (chip) sel.genres.has(chip.dataset.id) ? sel.genres.delete(chip.dataset.id) : sel.genres.add(chip.dataset.id);
    if (goal) sel.goal = Number(goal.dataset.g);
    if (dev) sel.autoPlay = dev.dataset.id ? { deviceId: dev.dataset.id, deviceName: dev.dataset.name } : null;
    if (e.target.closest('#unplayed')) sel.unplayed = !sel.unplayed;
    if (tile || chip || goal || dev || e.target.closest('#unplayed')) paint();
  });

  $('#go').onclick = async () => {
    const btn = $('#go');
    btn.disabled = true;
    const settings = {
      libraryIds: [...sel.libs],
      libraryNames: libs.filter((l) => sel.libs.has(l.id)).map((l) => l.name),
      genreIds: [...sel.genres],
      genreNames: genres.filter((g) => sel.genres.has(g.id)).map((g) => g.name),
      goal: sel.goal,
      unplayedOnly: sel.unplayed,
      autoPlay: sel.autoPlay,
    };
    store.set('lastSettings', { libraryIds: settings.libraryIds, goal: settings.goal, unplayedOnly: settings.unplayedOnly });
    try {
      const r = await api('rooms', { name: store.get('name'), settings });
      connectRoom({ code: r.code, secret: r.secret, playerId: r.playerId });
    } catch (e) { $('#err').textContent = e.message; btn.disabled = false; }
  };

  paint();
  try {
    libs = await api('libraries');
    for (const id of [...sel.libs]) if (!libs.some((l) => l.id === id)) sel.libs.delete(id);
    if (!sel.libs.size) for (const l of libs) if (l.type === 'movies') sel.libs.add(l.id);
    $('#libs').innerHTML = libs.length
      ? libs.map((l) => `<button class="tile" data-id="${l.id}" style="${l.hasImage ? `background-image:url('${img(l.id, 'Primary/0', 400)}')` : 'background-image:var(--brand)'}"><span>${esc(l.name)}</span><i class="check">${I.check}</i></button>`).join('')
      : '<span class="hint">No movie or TV libraries visible to this Jellyfin user.</span>';
    paint();
    loadGenres();
  } catch (e) {
    $('#libs').innerHTML = `<span class="error">${esc(e.message)}</span>`;
    if (e.status === 401) { S.jf = await api('status'); route(); }
  }
  try {
    const devices = await api('sessions');
    $('#devices').innerHTML = `<button class="chip" data-id="">Off</button>${devices.map((d) => `<button class="chip" data-id="${esc(d.deviceId)}" data-name="${esc(d.device)}">${esc(d.device)} · ${esc(d.client)}</button>`).join('')}`;
    paint();
  } catch { $('#devices').innerHTML = '<span class="hint">Could not list devices</span>'; }
}

// ---------- Room connection (SSE) ----------
function connectRoom(session) {
  S.session = session;
  store.set('session', session);
  S.primed = false;
  S.known = new Set();
  S.es?.close();
  const es = new EventSource(`api/rooms/${session.code}/events?secret=${encodeURIComponent(session.secret)}`);
  S.es = es;
  es.addEventListener('state', (e) => onState(JSON.parse(e.data)));
  es.addEventListener('kicked', () => { leaveLocal(); toast('The host removed you from the lobby'); });
  es.addEventListener('closed', () => { leaveLocal(); toast('Lobby closed'); });
  es.onerror = async () => {
    // EventSource auto-retries; if the room no longer exists, stop.
    if (es.readyState === EventSource.CLOSED || !S.room) {
      try { await api(`rooms/${session.code}`); } catch (err) {
        if (err.status === 404 || err.status === 403) { leaveLocal(); toast('That lobby no longer exists'); }
      }
    }
  };
}

function leaveLocal() {
  S.es?.close();
  S.es = null;
  S.session = null;
  S.room = null;
  S.deck = [];
  S.deckRound = null;
  store.set('session', null);
  closeOverlay();
  route();
}

async function leaveRoom() {
  const s = S.session;
  if (s) api(`rooms/${s.code}/leave`, { secret: s.secret }).catch(() => {});
  leaveLocal();
}

let stateChain = Promise.resolve();
function onState(room) {
  // Serialise: deck fetches are async and states must be applied in order.
  stateChain = stateChain.then(() => applyState(room)).catch((e) => toast(e.message));
}

async function applyState(room) {
  const prev = S.room;
  if (room.status !== 'lobby' && S.deckRound !== `${room.code}:${room.round}`) {
    const { deck } = await api(`rooms/${room.code}/deck?secret=${encodeURIComponent(S.session.secret)}`);
    S.deck = deck;
    S.pos = room.you.position;
    S.deckRound = `${room.code}:${room.round}`;
    photoIdx.clear();
  }
  if (room.status === 'lobby') {
    S.deck = [];
    S.deckRound = null;
    S.known = new Set();
    S.celebrated = false;
  }
  S.room = room;
  if (!S.primed) {
    // Don't replay match celebrations after a reload.
    for (const m of room.matches) S.known.add(m.id);
    S.primed = true;
  }
  const fresh = room.matches.filter((m) => !S.known.has(m.id));
  for (const m of fresh) S.known.add(m.id);

  if (fresh.length && room.mode === 'multi') {
    queueMatch(fresh.at(-1), room);
    if (room.status === 'finished') S.pendingResults = true;
  }
  if (S.overlayOpen && S.pendingResults) return updateGameChrome();
  if (prev?.status !== room.status) {
    // Let the last card finish flying before switching to results.
    if (room.status === 'finished' && S.screen === 'game') return setTimeout(route, 450);
    return route();
  }
  if (S.screen === 'lobby' || S.screen === 'results') route();
  else if (S.screen === 'game') updateGameChrome();
}

// ---------- Lobby ----------
// navigator.clipboard needs HTTPS; LAN Jellyfin is usually plain http, so fall back to execCommand.
async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); return true; }
  } catch { /* fall through */ }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;font-size:16px';
  document.body.appendChild(ta);
  ta.select();
  ta.setSelectionRange(0, text.length);
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { ok = false; }
  ta.remove();
  return ok;
}

function qrSvg(text) {
  try {
    const qr = window.qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    return qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
  } catch { return ''; }
}

function renderLobby(same) {
  const r = S.room;
  const joinUrl = `${location.origin}${location.pathname}?join=${r.code}`;
  const isLocal = /^(localhost|127\.|\[::1\])/.test(location.hostname);
  const summary = [
    ...r.settings.libraryNames,
    ...(r.settings.genreNames.length ? r.settings.genreNames : ['All genres']),
    `Goal: ${r.settings.goal} match${r.settings.goal > 1 ? 'es' : ''}`,
    ...(r.settings.unplayedOnly ? ['Unwatched only'] : []),
    ...(r.settings.autoPlay ? [`▶ ${r.settings.autoPlay.deviceName}`] : []),
  ];
  const players = r.players.map((p) => `
    <div class="player">${avatar(p)}<span class="name">${esc(p.name)}${p.id === r.you.id ? ' <span class="hint">(you)</span>' : ''}</span>
      ${p.host ? '<span class="tag">Host</span>' : ''}
      ${r.you.host && !p.host ? `<button class="icon-btn" data-kick="${p.id}" aria-label="Remove ${esc(p.name)}">${I.close}</button>` : ''}
    </div>`).join('');
  const solo = r.players.length === 1;
  const footer = r.you.host
    ? `<button class="btn btn-primary" id="start">${solo ? 'Play solo' : `Start swiping · ${r.players.length} players`}</button>
       <div class="hint" style="margin-top:8px">${solo ? 'Or wait for friends to join — matches need 2+ players.' : 'A match = everyone swiped right.'}</div>`
    : '<div class="waiting"><span class="pulse"></span>Waiting for the host to start…</div>';

  if (same && $('#players')) {
    $('#players').innerHTML = players;
    $('#pcount').textContent = `${r.players.length}/12`;
    $('#lobby-footer').innerHTML = footer;
    bindLobby();
    return;
  }
  app.innerHTML = `
    <div class="screen">
      <div class="topbar"><div class="side"><button class="icon-btn" id="leave" aria-label="Leave">${I.close}</button></div>${logo}<div class="side"></div></div>
      <div class="scroll">
        <div class="lobby-code"><div class="label">Lobby code</div><div class="digits">${r.code}</div></div>
        <div class="qr" role="img" aria-label="QR code to join lobby ${r.code}">${qrSvg(joinUrl)}</div>
        ${isLocal ? '<div class="hint">⚠ Open this page via the server\'s LAN address so phones can use the QR code.</div>' : ''}
        <div class="share-row"><button class="pill-btn" id="share">${I.share} Share invite</button></div>
        <div class="summary">${summary.map((s) => `<span>${esc(s)}</span>`).join('')}</div>
        <div class="section-title">Players <small id="pcount">${r.players.length}/12</small></div>
        <div class="players" id="players">${players}</div>
      </div>
      <div class="sticky-footer" id="lobby-footer">${footer}</div>
    </div>`;
  $('#leave').onclick = leaveRoom;
  $('#share').onclick = async () => {
    const copied = await copyText(joinUrl);
    toast(copied ? 'Invite link copied ✓' : joinUrl);
    vibrate(15);
    if (navigator.share) { try { await navigator.share({ title: 'JellySwipe', text: `Join my JellySwipe lobby ${r.code}`, url: joinUrl }); } catch { /* dismissed */ } }
  };
  $('.lobby-code').onclick = async () => { if (await copyText(joinUrl)) toast('Invite link copied ✓'); };
  bindLobby();
}

function bindLobby() {
  const s = S.session;
  $('#start')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.innerHTML = 'Shuffling the deck…';
    try { await api(`rooms/${s.code}/start`, { secret: s.secret }); } catch (err) { toast(err.message); btn.disabled = false; renderLobby(true); }
  });
  for (const b of app.querySelectorAll('[data-kick]')) {
    b.onclick = () => api(`rooms/${s.code}/kick`, { secret: s.secret, playerId: b.dataset.kick }).catch((err) => toast(err.message));
  }
}

// ---------- Game ----------
const goalCount = () => (S.room.mode === 'solo' ? S.room.you.picks : S.room.matches.length);

function renderGame() {
  app.innerHTML = `
    <div class="screen">
      <div class="game-header">
        <button class="avatars" id="who" aria-label="Players"></button>
        ${logo}
        <div class="goal" id="goal" aria-label="Goal progress"></div>
      </div>
      <div class="deck" id="deck"></div>
      <div class="actions">
        <button class="action small rewind" id="b-undo" aria-label="Undo">${I.rewind}</button>
        <button class="action nope" id="b-nope" aria-label="Nope">${I.nope}</button>
        <button class="action small super" id="b-super" aria-label="Super like">${I.star}</button>
        <button class="action like" id="b-like" aria-label="Like">${I.like}</button>
      </div>
    </div>`;
  $('#b-nope').onclick = () => swipeTop('nope');
  $('#b-like').onclick = () => swipeTop('like');
  $('#b-super').onclick = () => swipeTop('super');
  $('#b-undo').onclick = undo;
  $('#who').onclick = openPlayersSheet;
  renderStack();
  updateGameChrome();
}

function updateGameChrome() {
  if (S.screen !== 'game' || !$('#goal')) return;
  const r = S.room;
  const n = goalCount();
  $('#goal').innerHTML = Array.from({ length: r.settings.goal }, (_, i) => I.like.replace('<svg', `<svg class="${i < n ? 'on' : ''}"`)).join('');
  $('#goal').title = r.mode === 'solo' ? `${n}/${r.settings.goal} picks` : `${n}/${r.settings.goal} matches`;
  $('#who').innerHTML = r.players.slice(0, 4).map((p) => avatar(p, 'sm')).join('');
  $('#b-undo').disabled = !r.you.canUndo || S.pos === 0;
  if (S.pos >= S.deck.length) renderStack();
}

const photoIdx = new Map();

function cardHtml(it, depth) {
  const idx = photoIdx.get(it.id) || 0;
  const ref = it.images[idx] || it.images[0];
  const bars = it.images.length > 1 ? `<div class="bars">${it.images.map((_, i) => `<i class="${i === idx ? 'on' : ''}"></i>`).join('')}</div>` : '';
  const meta = [
    it.rating ? `<span>${I.starSm}${it.rating}</span>` : '',
    it.runtime && it.type !== 'Series' ? `<span>${I.clock}${fmtRuntime(it.runtime)}</span>` : '',
    it.official ? `<span>${esc(it.official)}</span>` : '',
  ].join('');
  return `
    <div class="card ${depth ? 'behind' : ''}" data-id="${it.id}" style="z-index:${10 - depth};transform:scale(${1 - depth * 0.04})">
      <div class="photo" style="background-image:url('${img(it.id, ref, ref.startsWith('Backdrop') ? 1280 : 720)}')"></div>
      ${bars}
      <div class="stamp like">Like</div><div class="stamp nope">Nope</div><div class="stamp super">Super<br>Like</div>
      <div class="shade"></div>
      <div class="info">
        <div class="title-row"><h2>${esc(it.name)}${it.year ? `<small>${it.year}</small>` : ''}</h2><button class="info-btn" aria-label="Details">${I.info}</button></div>
        <div class="meta">${it.type === 'Series' ? '<span class="type-badge">Series</span>' : ''}${meta}</div>
        ${it.genres.length ? `<div class="tags">${it.genres.map((g) => `<span>${esc(g)}</span>`).join('')}</div>` : ''}
        ${idx === 0 && it.overview ? `<div class="overview">${esc(it.overview)}</div>` : ''}
      </div>
    </div>`;
}

function preload(from) {
  for (const it of S.deck.slice(from, from + 4)) {
    for (const ref of it.images.slice(0, 2)) new Image().src = img(it.id, ref, ref.startsWith('Backdrop') ? 1280 : 720);
  }
}

function renderStack() {
  const deckEl = $('#deck');
  if (!deckEl) return;
  const items = S.deck.slice(S.pos, S.pos + 3);
  if (!items.length) {
    const others = S.room.players.filter((p) => p.id !== S.room.you.id && p.progress < S.room.deckSize);
    deckEl.innerHTML = `<div class="empty-deck"><div class="radar"><img src="icon.svg" alt=""></div>
      <b style="color:var(--text);font-size:18px">You're out of cards</b>
      <div>${others.length ? `Waiting for ${others.map((p) => esc(p.name)).join(', ')} to finish swiping…` : 'Wrapping up…'}</div></div>`;
    return;
  }
  deckEl.innerHTML = items.map((it, i) => cardHtml(it, i)).reverse().join('');
  bindCard(deckEl.querySelector(`.card[data-id="${items[0].id}"]`), items[0]);
  preload(S.pos + 1);
}

// Tinder-style drag physics.
function bindCard(card, it) {
  const next = card.previousElementSibling;
  const stamps = { like: $('.stamp.like', card), nope: $('.stamp.nope', card), super: $('.stamp.super', card) };
  const btns = { like: $('#b-like'), nope: $('#b-nope'), super: $('#b-super') };
  let start = null;
  let dx = 0;
  let dy = 0;
  let flip = 1;
  let last = { x: 0, t: 0, vx: 0 };

  const setVisual = () => {
    const w = card.offsetWidth;
    card.style.transform = `translate(${dx}px, ${dy}px) rotate(${(dx / w) * 22 * flip}deg)`;
    const like = Math.max(0, Math.min(1, dx / 90));
    const nope = Math.max(0, Math.min(1, -dx / 90));
    const sup = Math.abs(dy) > Math.abs(dx) ? Math.max(0, Math.min(1, -dy / 110)) : 0;
    stamps.like.style.opacity = sup ? 0 : like;
    stamps.nope.style.opacity = sup ? 0 : nope;
    stamps.super.style.opacity = sup;
    const p = Math.min(1, Math.hypot(dx, dy) / 150);
    if (next) next.style.transform = `scale(${0.96 + 0.04 * p})`;
    btns.like?.classList.toggle('flash-like', like > 0.6 && !sup);
    btns.nope?.classList.toggle('flash-nope', nope > 0.6 && !sup);
    btns.super?.classList.toggle('flash-super', sup > 0.6);
  };
  const clearBtns = () => Object.values(btns).forEach((b) => b?.classList.remove('flash-like', 'flash-nope', 'flash-super'));

  card.addEventListener('pointerdown', (e) => {
    if (card.dataset.gone || e.button > 0) return;
    card.setPointerCapture(e.pointerId);
    const rect = card.getBoundingClientRect();
    flip = e.clientY - rect.top > rect.height / 2 ? -1 : 1; // grab low → rotate the other way, like Tinder
    start = { x: e.clientX, y: e.clientY, t: performance.now(), rect };
    last = { x: e.clientX, t: start.t, vx: 0 };
    card.style.transition = 'none';
  });
  card.addEventListener('pointermove', (e) => {
    if (!start) return;
    dx = e.clientX - start.x;
    dy = e.clientY - start.y;
    const now = performance.now();
    last = { x: e.clientX, t: now, vx: (e.clientX - last.x) / Math.max(1, now - last.t) };
    setVisual();
  });
  const end = (e) => {
    if (!start) return;
    const moved = Math.hypot(dx, dy);
    const dt = performance.now() - start.t;
    const { rect } = start;
    start = null;
    clearBtns();
    if (moved < 8 && dt < 400) {
      dx = dy = 0;
      card.style.transform = '';
      return onTap(card, it, e, rect);
    }
    const w = rect.width;
    let choice = null;
    if (-dy > 120 && Math.abs(dy) > Math.abs(dx)) choice = 'super';
    else if (dx > w * 0.3 || (last.vx > 0.6 && dx > 40)) choice = 'like';
    else if (dx < -w * 0.3 || (last.vx < -0.6 && dx < -40)) choice = 'nope';
    if (choice) return flyOut(card, choice, dx, dy);
    card.style.transition = 'transform .35s cubic-bezier(.2, 1.4, .4, 1)';
    dx = dy = 0;
    card.style.transform = '';
    for (const s of Object.values(stamps)) s.style.opacity = 0;
    if (next) next.style.transform = 'scale(.96)';
  };
  card.addEventListener('pointerup', end);
  card.addEventListener('pointercancel', end);
}

function onTap(card, it, e, rect) {
  if (e.target.closest('.info-btn') || e.clientY - rect.top > rect.height * 0.72) return openDetails(it);
  if (it.images.length < 2) return nudge(card, e.clientX - rect.left < rect.width / 2 ? -1 : 1);
  const cur = photoIdx.get(it.id) || 0;
  const dir = e.clientX - rect.left < rect.width / 2 ? -1 : 1;
  const nextIdx = cur + dir;
  if (nextIdx < 0 || nextIdx >= it.images.length) return nudge(card, dir);
  photoIdx.set(it.id, nextIdx);
  const ref = it.images[nextIdx];
  $('.photo', card).style.backgroundImage = `url('${img(it.id, ref, ref.startsWith('Backdrop') ? 1280 : 720)}')`;
  card.querySelectorAll('.bars i').forEach((b, i) => b.classList.toggle('on', i === nextIdx));
  const ov = $('.overview', card);
  if (ov) ov.style.display = nextIdx === 0 ? '' : 'none';
}

function nudge(card, dir) {
  card.animate([{ transform: 'none' }, { transform: `perspective(800px) rotateY(${dir * 6}deg)` }, { transform: 'none' }], { duration: 250, easing: 'ease-out' });
}

let swipeChain = Promise.resolve();
function flyOut(card, choice, dx = 0, dy = 0) {
  if (card.dataset.gone) return;
  card.dataset.gone = '1';
  const it = S.deck[S.pos];
  const w = card.offsetWidth;
  const h = card.offsetHeight;
  const tx = choice === 'super' ? dx : (choice === 'like' ? 1 : -1) * (w * 1.6);
  const ty = choice === 'super' ? -h * 1.4 : dy + (dy || 40);
  const rot = choice === 'super' ? 0 : (choice === 'like' ? 1 : -1) * 30;
  const stamp = $(`.stamp.${choice}`, card);
  if (stamp) stamp.style.opacity = 1;
  card.style.transition = 'transform .4s cubic-bezier(.3, .5, .4, 1), opacity .4s';
  card.style.transform = `translate(${tx}px, ${ty}px) rotate(${rot}deg)`;
  card.style.pointerEvents = 'none';
  vibrate(choice === 'super' ? [20, 40, 20] : 15);
  S.pos++;
  const next = card.previousElementSibling;
  if (next) { next.style.transform = 'scale(1)'; }
  setTimeout(() => { if (S.screen === 'game') renderStack(); updateGameChrome(); }, 260);

  const { code, secret } = S.session;
  swipeChain = swipeChain.then(() => api(`rooms/${code}/swipe`, { secret, itemId: it.id, choice })).catch((e) => toast(e.message));
}

function swipeTop(choice) {
  if (S.overlayOpen || $('.sheet-backdrop')) return;
  const it = S.deck[S.pos];
  if (!it) return;
  const card = $(`#deck .card[data-id="${it.id}"]`);
  if (!card) return;
  const btn = $(`#b-${choice}`);
  btn?.classList.add(`flash-${choice}`);
  setTimeout(() => btn?.classList.remove(`flash-${choice}`), 200);
  const stamp = $(`.stamp.${choice}`, card);
  if (stamp) stamp.style.opacity = 1;
  setTimeout(() => flyOut(card, choice), 90);
}

async function undo() {
  const { code, secret } = S.session;
  await swipeChain;
  try {
    const { itemId } = await api(`rooms/${code}/undo`, { secret });
    const idx = S.deck.findIndex((d) => d.id === itemId);
    if (idx >= 0) S.pos = idx;
    renderStack();
    const card = $(`#deck .card[data-id="${itemId}"]`);
    card?.animate([{ transform: 'translate(-120%, -10%) rotate(-25deg)' }, { transform: 'none' }], { duration: 380, easing: 'cubic-bezier(.2, 1.2, .4, 1)' });
    vibrate(10);
  } catch (e) { toast(e.message); }
}

document.addEventListener('keydown', (e) => {
  if (S.screen !== 'game' || e.target.matches('input')) return;
  if ($('.sheet-backdrop')) { if (e.key === 'Escape') closeSheet(); return; }
  if (S.overlayOpen) { if (e.key === 'Escape' || e.key === 'Enter') $('#keep')?.click(); return; }
  const map = { ArrowLeft: 'nope', ArrowRight: 'like', ArrowUp: 'super' };
  if (map[e.key]) { e.preventDefault(); swipeTop(map[e.key]); }
  if (e.key === 'Backspace' || e.key.toLowerCase() === 'z') undo();
  if (e.key === ' ' || e.key.toLowerCase() === 'i') { e.preventDefault(); const it = S.deck[S.pos]; if (it) openDetails(it); }
});

// ---------- Sheets ----------
function openSheet(html) {
  closeSheet();
  const el = document.createElement('div');
  el.className = 'sheet-backdrop';
  el.innerHTML = `<div class="sheet"><div class="grab"></div>${html}</div>`;
  el.addEventListener('click', (e) => { if (e.target === el) closeSheet(); });
  overlayRoot.appendChild(el);
  return el;
}
function closeSheet() { overlayRoot.querySelector('.sheet-backdrop')?.remove(); }

function openDetails(it) {
  const hero = it.images.find((r) => r.startsWith('Backdrop')) || it.images[0];
  const facts = [it.year, it.type === 'Series' ? 'Series' : 'Movie', it.runtime && it.type !== 'Series' && fmtRuntime(it.runtime), it.seasons && `${it.seasons} seasons`, it.official, it.rating && `★ ${it.rating}`, it.critic && `🍅 ${it.critic}%`].filter(Boolean);
  const inGame = S.screen === 'game';
  const el = openSheet(`
    <div class="hero-img" style="background-image:url('${img(it.id, hero, 1280)}')"></div>
    <div class="body">
      <h3>${esc(it.name)}</h3>
      <div class="facts">${facts.map((f) => `<span>${esc(f)}</span>`).join('')}</div>
      ${it.genres.length ? `<div class="hint" style="text-align:left">${it.genres.map(esc).join(' · ')}</div>` : ''}
      <p>${esc(it.overview || 'No description.')}</p>
      ${inGame ? `<div class="actions" style="padding-bottom:0">
        <button class="action nope" data-c="nope">${I.nope}</button>
        <button class="action small super" data-c="super">${I.star}</button>
        <button class="action like" data-c="like">${I.like}</button></div>` : ''}
    </div>`);
  for (const b of el.querySelectorAll('[data-c]')) b.onclick = () => { closeSheet(); swipeTop(b.dataset.c); };
}

function openPlayersSheet() {
  const r = S.room;
  const el = openSheet(`
    <div class="body">
      <h3>${r.mode === 'solo' ? 'Solo game' : 'Players'}</h3>
      <div class="hint" style="text-align:left;margin-bottom:12px">Lobby ${r.code} · ${r.mode === 'solo' ? `${r.you.picks}/${r.settings.goal} picks` : `${r.matches.length}/${r.settings.goal} matches`} · ${r.deckSize} titles in the deck</div>
      <div class="players">${r.players.map((p) => `<div class="player">${avatar(p)}<span class="name">${esc(p.name)}</span><span class="hint">${Math.min(p.progress, r.deckSize)}/${r.deckSize} swiped</span></div>`).join('')}</div>
      <div class="stack" style="margin-top:18px">
        ${r.matches.length ? '<button class="btn btn-outline" id="see-matches">See matches so far</button>' : ''}
        <button class="btn btn-ghost" id="quit">Leave game</button>
      </div>
    </div>`);
  $('#quit', el).onclick = () => { closeSheet(); leaveRoom(); };
  $('#see-matches', el)?.addEventListener('click', () => {
    closeSheet();
    openSheet(`<div class="body"><h3>Matches</h3><div class="result-list">${r.matches.map((m, i) => resultHtml(m, i)).join('')}</div></div>`);
    bindResults(overlayRoot);
  });
}

// ---------- It's a Match! ----------
function confetti(root, n = 40) {
  const wrap = document.createElement('div');
  wrap.className = 'confetti';
  const glyphs = ['❤️', '💖', '✨', '🍿', '🎬', '💘'];
  for (let i = 0; i < n; i++) {
    const c = document.createElement('i');
    c.textContent = glyphs[i % glyphs.length];
    c.style.left = `${Math.random() * 100}%`;
    c.style.fontSize = `${14 + Math.random() * 22}px`;
    c.style.animationDuration = `${2.4 + Math.random() * 2.5}s`;
    c.style.animationDelay = `${Math.random() * 1.2}s`;
    wrap.appendChild(c);
  }
  root.appendChild(wrap);
}

function queueMatch(m, room) {
  S.overlayOpen = true;
  closeSheet();
  overlayRoot.querySelector('.match-overlay')?.remove();
  const others = m.likedBy.filter((id) => id !== room.you.id).map(playerById).filter(Boolean);
  const names = others.map((p) => p.name);
  const who = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
  const done = room.status === 'finished';
  const el = document.createElement('div');
  el.className = 'match-overlay';
  el.innerHTML = `
    <div class="bg" style="background-image:url('${img(m.id, m.images.find((r) => r.startsWith('Backdrop')) || m.images[0], 1280)}')"></div>
    <h1 class="match-title">It's a Match!</h1>
    <div class="match-sub">You and ${esc(who)} want to watch <b>${esc(m.name)}</b></div>
    <div class="match-posters"><div class="match-poster" style="background-image:url('${img(m.id, m.images[0], 600)}')"></div></div>
    <div class="match-likers">${m.likedBy.map((id) => avatar(playerById(id), 'sm')).join('')}</div>
    <div class="match-progress">Match ${room.matches.length} of ${room.settings.goal}</div>
    <div class="stack" style="width:100%;align-items:center">
      <button class="btn btn-primary" id="keep">${done ? 'See all matches' : 'Keep swiping'}</button>
      <button class="btn btn-outline" id="m-details">Details</button>
    </div>`;
  confetti(el, done ? 70 : 36);
  overlayRoot.appendChild(el);
  vibrate([60, 40, 120]);
  $('#keep', el).onclick = () => {
    closeOverlay();
    if (S.pendingResults) { S.pendingResults = false; route(); }
  };
  $('#m-details', el).onclick = () => openDetails(m);
}

function closeOverlay() {
  S.overlayOpen = false;
  overlayRoot.querySelector('.match-overlay')?.remove();
}

// ---------- Results ----------
function resultHtml(m, i, extra = '') {
  const likers = (m.likedBy || []).map(playerById).filter(Boolean);
  const supers = (m.superBy || []).length;
  return `
    <div class="result" style="animation-delay:${i * 90}ms" data-id="${m.id}">
      <div class="poster" style="background-image:url('${img(m.id, m.images[0], 300)}')"><span class="rank">${i + 1}</span></div>
      <div class="body">
        <h4>${esc(m.name)}</h4>
        <div class="sub">${esc(subline(m))}</div>
        <div class="sub">${esc(m.genres.slice(0, 3).join(' · '))}${supers ? ` · <span style="color:var(--super)">★ ${supers} super like${supers > 1 ? 's' : ''}</span>` : ''}${extra}</div>
        ${likers.length > 1 ? `<div class="likers">${likers.map((p) => avatar(p, 'sm')).join('')}</div>` : ''}
        <div class="row">
          <button class="btn btn-primary" data-play="${m.id}">${I.play} Play</button>
          <button class="btn btn-outline" data-info="${m.id}" aria-label="Details">${I.info}</button>
        </div>
      </div>
    </div>`;
}

function allResultItems() {
  const r = S.room;
  return [...r.matches, ...(r.results?.picks || []), ...(r.results?.close || [])];
}

function bindResults(root) {
  for (const b of root.querySelectorAll('[data-play]')) b.onclick = () => openDevicePicker(allResultItems().find((m) => m.id === b.dataset.play));
  for (const b of root.querySelectorAll('[data-info]')) b.onclick = () => openDetails(allResultItems().find((m) => m.id === b.dataset.info));
}

let countdownTimer;
function renderResults() {
  const r = S.room;
  const res = r.results || { picks: [], close: [], ranked: [] };
  const solo = r.mode === 'solo';
  const byId = new Map(allResultItems().map((m) => [m.id, m]));
  const main = (res.ranked?.length ? res.ranked : (solo ? res.picks : r.matches).map((m) => m.id)).map((id) => byId.get(id)).filter(Boolean);
  const reached = res.reason === 'goal';
  let title;
  let sub;
  if (solo) {
    title = reached ? 'Your Picks' : 'Out of cards';
    sub = main.length ? `You picked ${main.length} title${main.length > 1 ? 's' : ''} — #1 is your winner` : 'You swiped left on everything 😅';
  } else if (reached) {
    title = r.settings.goal === 1 ? 'It\'s a Match!' : 'You Matched!';
    sub = `${main.length} title${main.length > 1 ? 's' : ''} everyone swiped right on${main.length > 1 ? ' — #1 is the winner' : ''}`;
  } else {
    title = 'Out of cards';
    sub = main.length ? `Only ${main.length} match${main.length > 1 ? 'es' : ''} before the deck ran out` : 'No title got a yes from everyone';
  }
  const ap = r.autoPlay;
  const apLine = ap && ap.status !== 'cancelled' ? `<div class="toggle-row" id="ap" style="margin-top:14px">${
    ap.status === 'pending' ? `<span>▶ Playing #1 on <b>${esc(ap.deviceName)}</b> in <b id="ap-s">${Math.ceil(ap.inMs / 1000)}</b>s</span><button class="pill-btn" id="ap-cancel">Cancel</button>`
      : ap.status === 'playing' ? `<span>▶ Now playing on <b>${esc(ap.deviceName)}</b> 🍿</span>`
        : `<span class="error" style="text-align:left">Auto-play failed: ${esc(ap.error || '')}</span>`}</div>` : '';

  app.innerHTML = `
    <div class="screen">
      <div class="topbar"><div class="side"><button class="icon-btn" id="leave" aria-label="Leave">${I.close}</button></div>${logo}<div class="side"></div></div>
      <div class="scroll">
        <div class="results-hero"><h1 class="match-title">${esc(title)}</h1><p>${sub}</p>${apLine}</div>
        <div class="result-list">${main.map((m, i) => resultHtml(m, i)).join('')}</div>
        ${res.close?.length ? `<div class="section-title">Closest calls</div><div class="result-list">${res.close.map((m, i) => resultHtml(m, i, ` · ${m.likedBy.length}/${r.players.length} liked`)).join('')}</div>` : ''}
      </div>
      <div class="sticky-footer stack">
        ${r.you.host ? '<button class="btn btn-primary" id="again">Play again</button>' : '<div class="hint">The host can start a new round.</div>'}
      </div>
    </div>`;
  if (reached && main.length && !S.celebrated) {
    S.celebrated = true;
    confetti($('.screen'), 60);
    vibrate([40, 30, 80]);
  }
  if (!reached) S.celebrated = false;
  $('#leave').onclick = leaveRoom;
  $('#again')?.addEventListener('click', () => { S.celebrated = false; api(`rooms/${r.code}/lobby`, { secret: S.session.secret }).catch((e) => toast(e.message)); });
  $('#ap-cancel')?.addEventListener('click', () => api(`rooms/${r.code}/cancel-autoplay`, { secret: S.session.secret }).catch((e) => toast(e.message)));
  bindResults(app);
  clearInterval(countdownTimer);
  if (ap?.status === 'pending') {
    const endAt = Date.now() + ap.inMs;
    countdownTimer = setInterval(() => {
      const el = $('#ap-s');
      if (!el) return clearInterval(countdownTimer);
      el.textContent = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
    }, 250);
  }
}

async function openDevicePicker(m) {
  const el = openSheet(`<div class="body"><h3>Play ${esc(m.name)}</h3><div class="hint" style="text-align:left;margin-bottom:14px">${m.type === 'Series' ? 'Starts the next unwatched episode. ' : ''}Pick a device running Jellyfin.</div><div id="devs"><div class="spinner"></div></div>
    <a class="btn btn-outline" style="margin-top:8px;text-decoration:none" target="_blank" rel="noopener" href="../web/#/details?id=${m.id}">${I.external} Open in Jellyfin</a></div>`);
  const load = async () => {
    const box = $('#devs', el);
    box.innerHTML = '<div class="spinner"></div>';
    try {
      const devices = await api(`rooms/${S.room.code}/sessions?secret=${encodeURIComponent(S.session.secret)}`);
      if (!devices.length) {
        box.innerHTML = '<p class="hint">No controllable devices online. Open the Jellyfin app on your TV or phone, then refresh.</p><button class="btn btn-ghost" id="rf">Refresh</button>';
        $('#rf', el).onclick = load;
        return;
      }
      box.innerHTML = devices.map((d) => `<button class="device" data-s="${esc(d.id)}"><span class="ico">${I.tv}</span><span><b>${esc(d.device)}</b><small>${esc(d.client)}${d.user ? ` · ${esc(d.user)}` : ''}${d.nowPlaying ? ` · playing ${esc(d.nowPlaying)}` : ''}</small></span></button>`).join('');
      for (const b of box.querySelectorAll('[data-s]')) {
        b.onclick = async () => {
          b.disabled = true;
          try {
            await api(`rooms/${S.room.code}/play`, { secret: S.session.secret, itemId: m.id, sessionId: b.dataset.s });
            closeSheet();
            toast(`▶ Playing on ${devices.find((d) => d.id === b.dataset.s)?.device}`);
            vibrate(30);
          } catch (e) { toast(e.message); b.disabled = false; }
        };
      }
    } catch (e) { box.innerHTML = `<p class="error">${esc(e.message)}</p>`; }
  };
  load();
}

boot();
