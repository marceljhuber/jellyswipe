import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';
import * as jf from './src/jellyfin.js';
import * as rooms from './src/rooms.js';

const PORT = Number(process.env.PORT || 8097);
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
};

function send(res, status, body, headers = {}) {
  const json = typeof body !== 'string';
  res.writeHead(status, { 'Content-Type': json ? 'application/json' : 'text/plain', 'Cache-Control': 'no-store', ...headers });
  res.end(json ? JSON.stringify(body) : body);
}

async function readJson(req) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 1e6) throw Object.assign(new Error('Body too large'), { status: 413 });
  }
  try { return raw ? JSON.parse(raw) : {}; } catch { throw Object.assign(new Error('Invalid JSON'), { status: 400 }); }
}

function serveStatic(req, res, pathname) {
  const rel = pathname === '/' ? 'index.html' : pathname.slice(1);
  const file = path.join(PUBLIC_DIR, path.normalize(rel));
  if (!file.startsWith(PUBLIC_DIR)) return send(res, 403, 'Forbidden');
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return send(res, 404, 'Not found');
    const ext = path.extname(file);
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=300',
    });
    fs.createReadStream(file).pipe(res);
  });
}

// Room routes: /api/rooms/:code/:action
async function roomRoute(req, res, code, action, url) {
  const room = rooms.get(code);
  if (action === 'events') {
    const player = rooms.playerBySecret(room, url.searchParams.get('secret'));
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.write('retry: 2000\n\n');
    return rooms.subscribe(room, player, res);
  }
  if (action === 'deck') {
    rooms.playerBySecret(room, url.searchParams.get('secret'));
    return send(res, 200, { deck: room.deck });
  }
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });
  const body = await readJson(req);
  if (action === 'join') {
    const p = rooms.join(room, body.name, body.secret);
    return send(res, 200, { code: room.code, secret: p.secret, playerId: p.id });
  }
  const player = rooms.playerBySecret(room, body.secret);
  switch (action) {
    case 'start': {
      if (player.id !== room.hostId) return send(res, 403, { error: 'Only the host can start' });
      const deck = await jf.buildDeck(room.settings);
      rooms.start(room, player, deck);
      return send(res, 200, { ok: true });
    }
    case 'swipe': return send(res, 200, rooms.swipe(room, player, String(body.itemId), body.choice));
    case 'undo': return send(res, 200, rooms.undo(room, player));
    case 'leave': rooms.leave(room, player); return send(res, 200, { ok: true });
    case 'kick': rooms.kick(room, player, String(body.playerId)); return send(res, 200, { ok: true });
    case 'cancel-autoplay': rooms.cancelAutoPlay(room); rooms.broadcast(room); return send(res, 200, { ok: true });
    case 'lobby': rooms.backToLobby(room, player); return send(res, 200, { ok: true });
    case 'play': {
      const allowed = new Set([...room.matches, ...(room.results?.picks || []), ...(room.results?.close || []).map((c) => c.id)]);
      if (!allowed.has(String(body.itemId))) return send(res, 400, { error: 'Only results can be played' });
      return send(res, 200, await jf.play(String(body.sessionId), String(body.itemId)));
    }
    default: return send(res, 404, { error: 'Unknown action' });
  }
}

async function handle(req, res) {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;
  if (!p.startsWith('/api/')) return serveStatic(req, res, p);

  if (p === '/api/status') return send(res, 200, jf.status());
  if (p === '/api/probe') {
    if (jf.status().connected) return send(res, 409, { error: 'Already connected' });
    return send(res, 200, await jf.publicInfo(url.searchParams.get('url')));
  }
  if (p === '/api/login' && req.method === 'POST') {
    const status = jf.status();
    if (status.connected) return send(res, 409, { error: 'Already connected — log out first' });
    const b = await readJson(req);
    try {
      return send(res, 200, await jf.login(b.url, b.username, b.password || ''));
    } catch (e) {
      return send(res, e.status === 401 ? 401 : 502, { error: e.status === 401 ? 'Wrong username or password' : `Cannot reach Jellyfin (${e.message})` });
    }
  }
  if (p === '/api/logout' && req.method === 'POST') { jf.logout(); return send(res, 200, jf.status()); }
  if (p === '/api/qr') {
    const svg = await QRCode.toString(String(url.searchParams.get('text') || '').slice(0, 500), { type: 'svg', margin: 1, errorCorrectionLevel: 'M' });
    return send(res, 200, svg, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=3600' });
  }
  if (p === '/api/libraries') return send(res, 200, await jf.libraries());
  if (p === '/api/genres') {
    const ids = (url.searchParams.get('libraryIds') || '').split(',').filter(Boolean);
    return send(res, 200, ids.length ? await jf.genres(ids) : []);
  }
  if (p === '/api/sessions') return send(res, 200, await jf.sessions());

  const img = p.match(/^\/api\/img\/([a-f0-9]{32})\/(Primary|Backdrop)\/(\d)$/);
  if (img) {
    const upstream = await jf.image(img[1], img[2], img[3], Math.min(Number(url.searchParams.get('w')) || 720, 1600));
    res.writeHead(200, {
      'Content-Type': upstream.headers.get('content-type') || 'image/jpeg',
      'Cache-Control': 'public, max-age=86400, immutable',
    });
    return Readable.fromWeb(upstream.body).pipe(res);
  }

  if (p === '/api/rooms' && req.method === 'POST') {
    const b = await readJson(req);
    const { room, player } = rooms.create({ name: b.name, settings: b.settings || {} });
    return send(res, 200, { code: room.code, secret: player.secret, playerId: player.id });
  }
  const m = p.match(/^\/api\/rooms\/(\d{4})\/([\w-]+)$/);
  if (m) return roomRoute(req, res, m[1], m[2], url);
  if (p.match(/^\/api\/rooms\/(\d{4})$/)) {
    const room = rooms.get(p.split('/')[3]);
    return send(res, 200, { code: room.code, status: room.status, players: room.players.size, autoPlay: room.autoPlayState?.status || null });
  }
  return send(res, 404, { error: 'Not found' });
}

const server = http.createServer((req, res) => {
  handle(req, res).catch((e) => {
    const status = e.status && e.status < 600 ? e.status : 500;
    if (status >= 500) console.error(`[${req.method} ${req.url.split('?')[0]}]`, e.message);
    if (!res.headersSent) send(res, status, { error: e.message });
    else res.end();
  });
});

rooms.onAutoPlay((deviceId, itemId) => jf.playOnDevice(deviceId, itemId));
await jf.init().catch((e) => console.warn('[jellyfin] init:', e.message));
server.listen(PORT, HOST, () => {
  const s = jf.status();
  console.log(`JellySwipe on http://${HOST}:${PORT} — Jellyfin ${s.connected ? `connected as ${s.userName}` : 'not connected (log in via the web UI)'}`);
});
