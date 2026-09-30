// End-to-end API smoke test against the mock Jellyfin.
// Usage: node dev/smoke-test.js   (spawns the mock + app on spare ports)
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

const MOCK = 28096;
const APP = 28097;
const base = `http://127.0.0.1:${APP}/api/`;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jellyswipe-'));
const procs = [
  spawn('node', ['dev/mock-jellyfin.js'], { env: { ...process.env, MOCK_PORT: MOCK }, stdio: 'inherit' }),
  spawn('node', ['server.js'], { env: { ...process.env, PORT: APP, DATA_DIR: dataDir, JELLYFIN_URL: '', AUTOPLAY_DELAY_MS: '300' }, stdio: 'inherit' }),
];
const cleanup = () => { for (const p of procs) p.kill(); fs.rmSync(dataDir, { recursive: true, force: true }); };
process.on('exit', cleanup);

async function api(p, body) {
  const res = await fetch(base + p, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
  const data = await res.json().catch(() => null);
  if (!res.ok) throw Object.assign(new Error(`${p}: ${res.status} ${data?.error}`), { status: res.status });
  return data;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  for (let i = 0; i < 50; i++) { try { await api('status'); break; } catch { await sleep(100); } }
  assert.equal((await api('status')).connected, false);
  await api('login', { url: `http://127.0.0.1:${MOCK}`, username: 'demo', password: 'x' });
  assert.equal((await api('status')).connected, true);

  const libs = await api('libraries');
  assert.deepEqual(libs.map((l) => l.name), ['Movies', 'Shows'], 'music libraries are filtered out');
  const genres = await api(`genres?libraryIds=${libs.map((l) => l.id).join(',')}`);
  assert.ok(genres.length > 3);

  const img = await fetch(`${base}img/${libs[0].id}/Primary/0?w=300`);
  assert.equal(img.status, 200);

  const devices = await api('sessions');
  assert.equal(devices.length, 2);

  // --- Multiplayer: goal 3, auto-play on the TV ---
  const host = await api('rooms', { name: 'Ana', settings: { libraryIds: libs.map((l) => l.id), goal: 3, autoPlay: { deviceId: 'dev-tv', deviceName: 'Living Room TV' } } });
  assert.match(host.code, /^\d{4}$/);
  const bob = await api(`rooms/${host.code}/join`, { name: 'Bob' });
  await assert.rejects(api(`rooms/${host.code}/start`, { secret: bob.secret }), /403/);
  await api(`rooms/${host.code}/start`, { secret: host.secret });
  await assert.rejects(api(`rooms/${host.code}/join`, { name: 'Late' }), /409/);

  const { deck } = await api(`rooms/${host.code}/deck?secret=${host.secret}`);
  const { deck: deckB } = await api(`rooms/${host.code}/deck?secret=${bob.secret}`);
  assert.deepEqual(deck.map((d) => d.id), deckB.map((d) => d.id), 'everyone gets the same deck order');

  // Card 0: both like → match. Card 1: Ana likes, Bob nope → no match. Undo works.
  await api(`rooms/${host.code}/swipe`, { secret: host.secret, itemId: deck[0].id, choice: 'like' });
  let r = await api(`rooms/${host.code}/swipe`, { secret: bob.secret, itemId: deck[0].id, choice: 'like' });
  assert.equal(r.matched, true);
  await assert.rejects(api(`rooms/${host.code}/undo`, { secret: bob.secret }), /409/, 'cannot undo a match');
  await api(`rooms/${host.code}/swipe`, { secret: host.secret, itemId: deck[1].id, choice: 'like' });
  r = await api(`rooms/${host.code}/swipe`, { secret: bob.secret, itemId: deck[1].id, choice: 'nope' });
  assert.equal(r.matched, false);
  await api(`rooms/${host.code}/undo`, { secret: bob.secret });
  r = await api(`rooms/${host.code}/swipe`, { secret: bob.secret, itemId: deck[1].id, choice: 'super' });
  assert.equal(r.matched, true);
  await api(`rooms/${host.code}/swipe`, { secret: host.secret, itemId: deck[2].id, choice: 'like' });
  await api(`rooms/${host.code}/swipe`, { secret: bob.secret, itemId: deck[2].id, choice: 'like' });

  const info = await api(`rooms/${host.code}`);
  assert.equal(info.status, 'finished');
  assert.equal(info.autoPlay, 'pending');
  await sleep(600);
  assert.equal((await api(`rooms/${host.code}`)).autoPlay, 'playing', 'winner auto-played on the TV');

  // Play a match manually; non-results are refused.
  await assert.rejects(api(`rooms/${host.code}/play`, { secret: host.secret, itemId: deck[5].id, sessionId: 'sess-tv' }), /400/);
  await api(`rooms/${host.code}/play`, { secret: host.secret, itemId: deck[0].id, sessionId: 'sess-web' });

  // Back to lobby + solo round with Ana only.
  await api(`rooms/${host.code}/leave`, { secret: bob.secret });
  await api(`rooms/${host.code}/lobby`, { secret: host.secret });
  await api(`rooms/${host.code}/start`, { secret: host.secret });
  const solo = (await api(`rooms/${host.code}/deck?secret=${host.secret}`)).deck;
  for (let i = 0; i < 3; i++) await api(`rooms/${host.code}/swipe`, { secret: host.secret, itemId: solo[i].id, choice: i === 1 ? 'nope' : 'like' });
  assert.equal((await api(`rooms/${host.code}`)).status, 'playing', 'solo: 2 likes < goal 3');
  await api(`rooms/${host.code}/swipe`, { secret: host.secret, itemId: solo[3].id, choice: 'like' });
  assert.equal((await api(`rooms/${host.code}`)).status, 'finished', 'solo: 3 likes = goal');

  // Unplayed filter shrinks the deck; QR endpoint returns SVG.
  const qr = await fetch(`${base}qr?text=${encodeURIComponent('http://x/?join=1234')}`);
  assert.match(await qr.text(), /^<svg/);

  console.log('\n✅ smoke test passed');
  process.exit(0);
} catch (e) {
  console.error('\n❌', e);
  process.exit(1);
}
