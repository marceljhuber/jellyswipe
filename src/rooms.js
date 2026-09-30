// In-memory game rooms. A room is a lobby + shared deck; state is pushed to
// clients over Server-Sent Events whenever something changes.
import crypto from 'node:crypto';

const rooms = new Map();
const AUTOPLAY_DELAY_MS = Number(process.env.AUTOPLAY_DELAY_MS || 10000);
let autoPlayHandler = async () => {};
export const onAutoPlay = (fn) => { autoPlayHandler = fn; };
const COLORS = ['#fd267a', '#ff7854', '#21d07c', '#1ec0ff', '#a26bfa', '#f5b748', '#ff4d6d', '#00c2a8'];
const ROOM_TTL_MS = 6 * 60 * 60 * 1000;
const LIKE = new Set(['like', 'super']);

const httpError = (status, message) => Object.assign(new Error(message), { status });

function newCode() {
  for (let i = 0; i < 1000; i++) {
    const code = String(crypto.randomInt(1000, 10000));
    if (!rooms.has(code)) return code;
  }
  throw httpError(503, 'No free lobby codes');
}

function cleanName(name) {
  const n = String(name || '').replace(/\s+/g, ' ').trim().slice(0, 20);
  return n || `Player ${crypto.randomInt(10, 100)}`;
}

export function get(code) {
  const room = rooms.get(String(code));
  if (!room) throw httpError(404, 'Lobby not found');
  room.lastActive = Date.now();
  return room;
}

export function playerBySecret(room, secret) {
  const p = [...room.players.values()].find((x) => x.secret === secret);
  if (!p) throw httpError(403, 'You are not in this lobby');
  return p;
}

function addPlayer(room, name) {
  const player = {
    id: crypto.randomBytes(6).toString('hex'),
    secret: crypto.randomUUID(),
    name: cleanName(name),
    color: COLORS[room.players.size % COLORS.length],
    position: 0,
    history: [],
    connections: 0,
  };
  room.players.set(player.id, player);
  return player;
}

export function create({ name, settings }) {
  const goal = [1, 3, 5].includes(Number(settings.goal)) ? Number(settings.goal) : 3;
  if (!Array.isArray(settings.libraryIds) || !settings.libraryIds.length) throw httpError(400, 'Pick at least one library');
  const room = {
    code: newCode(),
    status: 'lobby',
    createdAt: Date.now(),
    lastActive: Date.now(),
    settings: {
      libraryIds: settings.libraryIds.map(String),
      libraryNames: (settings.libraryNames || []).map(String).slice(0, 20),
      genreIds: (settings.genreIds || []).map(String),
      genreNames: (settings.genreNames || []).map(String).slice(0, 30),
      unplayedOnly: !!settings.unplayedOnly,
      goal,
      autoPlay: settings.autoPlay?.deviceId
        ? { deviceId: String(settings.autoPlay.deviceId), deviceName: String(settings.autoPlay.deviceName || 'TV').slice(0, 60) }
        : null,
    },
    mode: null,
    players: new Map(),
    deck: [],
    swipes: new Map(), // itemId -> Map(playerId -> choice)
    matches: [],
    results: null,
    listeners: new Set(),
    seq: 0,
    round: 0,
  };
  const host = addPlayer(room, name);
  room.hostId = host.id;
  rooms.set(room.code, room);
  return { room, player: host };
}

export function join(room, name, secret) {
  if (secret) {
    const existing = [...room.players.values()].find((p) => p.secret === secret);
    if (existing) return existing;
  }
  if (room.status !== 'lobby') throw httpError(409, 'This game already started');
  if (room.players.size >= 12) throw httpError(409, 'Lobby is full');
  const p = addPlayer(room, name);
  broadcast(room);
  return p;
}

export function leave(room, player) {
  room.players.delete(player.id);
  for (const votes of room.swipes.values()) votes.delete(player.id);
  if (!room.players.size) {
    closeRoom(room);
    return;
  }
  if (room.hostId === player.id) room.hostId = room.players.keys().next().value;
  if (room.status === 'playing') {
    reevaluate(room);
    checkEnd(room);
  }
  broadcast(room);
}

export function kick(room, host, targetId) {
  if (host.id !== room.hostId) throw httpError(403, 'Only the host can remove players');
  const target = room.players.get(targetId);
  if (!target || target.id === host.id) throw httpError(400, 'Cannot remove that player');
  leave(room, target);
  sendTo(room, target.id, 'kicked', {});
}

export function start(room, player, deck) {
  if (player.id !== room.hostId) throw httpError(403, 'Only the host can start');
  if (room.status === 'playing') throw httpError(409, 'Already playing');
  if (!deck.length) throw httpError(422, 'No titles match these filters');
  room.deck = deck;
  room.deckIndex = new Map(deck.map((it, i) => [it.id, i]));
  room.swipes = new Map();
  room.matches = [];
  room.results = null;
  room.mode = room.players.size > 1 ? 'multi' : 'solo';
  for (const p of room.players.values()) {
    p.position = 0;
    p.history = [];
  }
  room.autoPlayState = null;
  room.round++;
  room.status = 'playing';
  room.startedAt = Date.now();
  broadcast(room);
}

export function backToLobby(room, player) {
  if (player.id !== room.hostId) throw httpError(403, 'Only the host can restart');
  cancelAutoPlay(room);
  room.status = 'lobby';
  room.deck = [];
  room.matches = [];
  room.results = null;
  broadcast(room);
}

function likersOf(room, itemId) {
  const votes = room.swipes.get(itemId);
  if (!votes) return [];
  return [...votes.entries()].filter(([, c]) => LIKE.has(c)).map(([pid]) => pid);
}

function isMatch(room, itemId) {
  if (room.mode === 'solo') return false;
  const likers = likersOf(room, itemId);
  return likers.length >= 2 && likers.length === room.players.size;
}

function reevaluate(room) {
  for (const itemId of room.swipes.keys()) {
    if (!room.matches.includes(itemId) && isMatch(room, itemId)) room.matches.push(itemId);
  }
}

function soloPicks(room, player) {
  return player.history.filter((h) => LIKE.has(h.choice)).map((h) => h.itemId);
}

function checkEnd(room) {
  if (room.status !== 'playing') return;
  const players = [...room.players.values()];
  const reached = room.mode === 'solo'
    ? soloPicks(room, players[0]).length >= room.settings.goal
    : room.matches.length >= room.settings.goal;
  const exhausted = players.every((p) => p.position >= room.deck.length);
  if (!reached && !exhausted) return;
  room.status = 'finished';
  room.finishedAt = Date.now();
  if (room.mode === 'solo') {
    room.results = { reason: reached ? 'goal' : 'exhausted', picks: soloPicks(room, players[0]) };
  } else {
    // Closest calls: most-liked non-matches, for when the deck runs dry before the goal.
    const close = [...room.swipes.keys()]
      .filter((id) => !room.matches.includes(id))
      .map((id) => ({ id, likes: likersOf(room, id).length }))
      .filter((x) => x.likes > 0)
      .sort((a, b) => b.likes - a.likes)
      .slice(0, 6);
    room.results = { reason: reached ? 'goal' : 'exhausted', close };
  }
  const winner = ranked(room)[0];
  if (reached && winner && room.settings.autoPlay) scheduleAutoPlay(room, winner);
}

// Winner = most super-likes, then earliest match (solo: earliest pick).
export function ranked(room) {
  const ids = room.mode === 'solo' ? room.results?.picks || [] : room.matches;
  const supers = (id) => [...(room.swipes.get(id) || new Map()).values()].filter((c) => c === 'super').length;
  return ids.map((id, i) => ({ id, i, s: supers(id) })).sort((a, b) => b.s - a.s || a.i - b.i).map((x) => x.id);
}

function scheduleAutoPlay(room, itemId) {
  const at = Date.now() + AUTOPLAY_DELAY_MS;
  room.autoPlayState = { itemId, at, deviceName: room.settings.autoPlay.deviceName, status: 'pending' };
  room.autoPlayTimer = setTimeout(async () => {
    try {
      await autoPlayHandler(room.settings.autoPlay.deviceId, itemId);
      room.autoPlayState.status = 'playing';
    } catch (e) {
      room.autoPlayState.status = 'failed';
      room.autoPlayState.error = e.message;
    }
    if (rooms.has(room.code)) broadcast(room);
  }, AUTOPLAY_DELAY_MS);
}

export function cancelAutoPlay(room) {
  clearTimeout(room.autoPlayTimer);
  if (room.autoPlayState?.status === 'pending') room.autoPlayState.status = 'cancelled';
  if (room.status !== 'finished') room.autoPlayState = null;
}

export function swipe(room, player, itemId, choice) {
  if (room.status !== 'playing') throw httpError(409, 'Game is not running');
  if (!['like', 'nope', 'super'].includes(choice)) throw httpError(400, 'Bad choice');
  const idx = room.deckIndex.get(itemId);
  if (idx === undefined) throw httpError(400, 'Unknown title');
  if (!room.swipes.has(itemId)) room.swipes.set(itemId, new Map());
  const votes = room.swipes.get(itemId);
  if (!votes.has(player.id)) player.history.push({ itemId, choice });
  votes.set(player.id, choice);
  player.position = Math.max(player.position, idx + 1);
  let matched = false;
  if (!room.matches.includes(itemId) && isMatch(room, itemId)) {
    room.matches.push(itemId);
    matched = true;
  }
  checkEnd(room);
  broadcast(room);
  return { matched };
}

export function undo(room, player) {
  if (room.status !== 'playing') throw httpError(409, 'Game is not running');
  const last = player.history.at(-1);
  if (!last) throw httpError(409, 'Nothing to undo');
  if (room.matches.includes(last.itemId)) throw httpError(409, 'Already a match — no take-backs!');
  player.history.pop();
  room.swipes.get(last.itemId)?.delete(player.id);
  player.position = room.deckIndex.get(last.itemId);
  broadcast(room);
  return { itemId: last.itemId };
}

const item = (room, id) => room.deck[room.deckIndex?.get(id)];

export function view(room, player) {
  const players = [...room.players.values()].map((p) => ({
    id: p.id,
    name: p.name,
    color: p.color,
    host: p.id === room.hostId,
    online: p.connections > 0,
    progress: p.position,
    likes: p.history.filter((h) => LIKE.has(h.choice)).length,
  }));
  const withLikers = (id) => ({ ...item(room, id), likedBy: likersOf(room, id), superBy: [...(room.swipes.get(id) || [])].filter(([, c]) => c === 'super').map(([pid]) => pid) });
  let results = null;
  if (room.results) {
    results = {
      reason: room.results.reason,
      picks: (room.results.picks || []).map(withLikers),
      ranked: ranked(room),
      close: (room.results.close || []).map((c) => withLikers(c.id)),
    };
  }
  return {
    seq: room.seq,
    round: room.round,
    code: room.code,
    status: room.status,
    mode: room.mode,
    settings: room.settings,
    deckSize: room.deck.length,
    players,
    matches: room.matches.map(withLikers),
    results,
    autoPlay: room.autoPlayState && { ...room.autoPlayState, inMs: Math.max(0, room.autoPlayState.at - Date.now()) },
    you: player && {
      id: player.id,
      host: player.id === room.hostId,
      position: player.position,
      canUndo: room.status === 'playing' && player.history.length > 0 && !room.matches.includes(player.history.at(-1).itemId),
      picks: room.mode === 'solo' ? soloPicks(room, player).length : null,
    },
  };
}

function write(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export function broadcast(room) {
  room.seq++;
  for (const l of room.listeners) write(l.res, 'state', view(room, room.players.get(l.playerId)));
}

function sendTo(room, playerId, event, data) {
  for (const l of room.listeners) if (l.playerId === playerId) write(l.res, event, data);
}

export function subscribe(room, player, res) {
  const listener = { res, playerId: player.id };
  room.listeners.add(listener);
  player.connections++;
  broadcast(room);
  const ping = setInterval(() => res.write(': ping\n\n'), 20000);
  res.on('close', () => {
    clearInterval(ping);
    room.listeners.delete(listener);
    player.connections = Math.max(0, player.connections - 1);
    if (rooms.has(room.code)) broadcast(room);
  });
}

function closeRoom(room) {
  clearTimeout(room.autoPlayTimer);
  for (const l of room.listeners) {
    write(l.res, 'closed', {});
    l.res.end();
  }
  rooms.delete(room.code);
}

setInterval(() => {
  const now = Date.now();
  for (const room of rooms.values()) if (now - room.lastActive > ROOM_TTL_MS) closeRoom(room);
}, 10 * 60 * 1000).unref();
