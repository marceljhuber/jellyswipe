// Minimal Jellyfin API client. Auth is either an admin API key (env) or a
// user access token obtained via the in-app login and persisted to data/auth.json.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const DATA_DIR = process.env.DATA_DIR || path.resolve('data');
const AUTH_FILE = path.join(DATA_DIR, 'auth.json');
const CLIENT = 'JellySwipe';
const VERSION = '0.1.0';

let deviceId;
let auth = null; // { url, token, userId, userName }

function loadAuth() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  try {
    const saved = JSON.parse(fs.readFileSync(AUTH_FILE, 'utf8'));
    deviceId = saved.deviceId;
    if (saved.token) auth = saved;
  } catch { /* first run */ }
  deviceId ||= crypto.randomUUID();
}

function saveAuth() {
  fs.writeFileSync(AUTH_FILE, JSON.stringify({ ...auth, deviceId }, null, 2), { mode: 0o600 });
}

function authHeader(token) {
  const parts = [`Client="${CLIENT}"`, `Device="JellySwipe Server"`, `DeviceId="${deviceId}"`, `Version="${VERSION}"`];
  if (token) parts.push(`Token="${token}"`);
  return `MediaBrowser ${parts.join(', ')}`;
}

const trimUrl = (u) => String(u || '').trim().replace(/\/+$/, '');

async function raw(url, token, pathAndQuery, opts = {}) {
  const res = await fetch(url + pathAndQuery, {
    ...opts,
    headers: { Authorization: authHeader(token), 'Content-Type': 'application/json', ...(opts.headers || {}) },
    signal: AbortSignal.timeout(opts.timeout || 15000),
  });
  if (!res.ok) {
    const err = new Error(`Jellyfin ${opts.method || 'GET'} ${pathAndQuery.split('?')[0]} -> ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res;
}

export async function api(pathAndQuery, opts = {}) {
  if (!auth) throw Object.assign(new Error('Not connected to Jellyfin'), { status: 503 });
  const res = await raw(auth.url, auth.token, pathAndQuery, opts);
  if (res.status === 204) return null;
  const type = res.headers.get('content-type') || '';
  return type.includes('json') ? res.json() : null;
}

export async function init() {
  loadAuth();
  const envUrl = trimUrl(process.env.JELLYFIN_URL);
  if (envUrl && process.env.JELLYFIN_API_KEY) {
    // API keys are not bound to a user; pick the configured or first admin user as context.
    auth = { url: envUrl, token: process.env.JELLYFIN_API_KEY, source: 'apikey' };
    const users = await api('/Users');
    const wanted = process.env.JELLYFIN_USERNAME;
    const user = users.find((u) => wanted && u.Name.toLowerCase() === wanted.toLowerCase())
      || users.find((u) => u.Policy?.IsAdministrator) || users[0];
    auth.userId = user.Id;
    auth.userName = user.Name;
  } else if (!auth && envUrl && process.env.JELLYFIN_USERNAME && process.env.JELLYFIN_PASSWORD) {
    await login(envUrl, process.env.JELLYFIN_USERNAME, process.env.JELLYFIN_PASSWORD);
  }
  if (auth) {
    try { await api('/System/Info'); } catch (e) {
      console.warn(`[jellyfin] saved credentials failed (${e.message}); login required`);
      if (auth.source !== 'apikey') auth = null;
    }
  }
}

export async function login(url, username, password) {
  url = trimUrl(url);
  const res = await raw(url, null, '/Users/AuthenticateByName', {
    method: 'POST',
    body: JSON.stringify({ Username: username, Pw: password }),
  });
  const data = await res.json();
  auth = { url, token: data.AccessToken, userId: data.User.Id, userName: data.User.Name, source: 'login' };
  saveAuth();
  return status();
}

export function logout() {
  if (auth?.source === 'login') {
    auth = null;
    try { fs.unlinkSync(AUTH_FILE); } catch { /* already gone */ }
  }
}

export async function publicInfo(url) {
  const res = await raw(trimUrl(url), null, '/System/Info/Public', { timeout: 5000 });
  return res.json();
}

export function status() {
  return {
    connected: !!auth,
    userName: auth?.userName || null,
    serverUrl: auth?.url || trimUrl(process.env.JELLYFIN_URL) || '',
    publicUrl: trimUrl(process.env.JELLYFIN_PUBLIC_URL) || auth?.url || '',
    canLogout: auth?.source === 'login',
  };
}

const SUPPORTED_COLLECTIONS = new Set(['movies', 'tvshows', 'boxsets', 'homevideos', 'mixed', undefined, null]);

export async function libraries() {
  const views = await api(`/UserViews?userId=${auth.userId}`);
  return views.Items
    .filter((v) => SUPPORTED_COLLECTIONS.has(v.CollectionType))
    .map((v) => ({ id: v.Id, name: v.Name, type: v.CollectionType || 'mixed', hasImage: !!v.ImageTags?.Primary }));
}

export async function genres(libraryIds) {
  const seen = new Map();
  for (const id of libraryIds) {
    const res = await api(`/Genres?userId=${auth.userId}&parentId=${id}&includeItemTypes=Movie,Series&sortBy=SortName`);
    for (const g of res.Items) seen.set(g.Name, { id: g.Id, name: g.Name });
  }
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function slim(item) {
  return {
    id: item.Id,
    name: item.Name,
    type: item.Type,
    year: item.ProductionYear || null,
    overview: item.Overview || '',
    genres: (item.Genres || []).slice(0, 4),
    rating: item.CommunityRating ? Math.round(item.CommunityRating * 10) / 10 : null,
    critic: item.CriticRating ?? null,
    official: item.OfficialRating || null,
    runtime: item.RunTimeTicks ? Math.round(item.RunTimeTicks / 600000000) : null,
    seasons: item.ChildCount || null,
    images: [
      ...(item.ImageTags?.Primary ? [`Primary/0`] : []),
      ...(item.BackdropImageTags || []).slice(0, 4).map((_, i) => `Backdrop/${i}`),
    ],
    tag: item.ImageTags?.Primary || item.BackdropImageTags?.[0] || '',
  };
}

export async function buildDeck({ libraryIds, genreIds = [], unplayedOnly = false, limit = 400 }) {
  const byId = new Map();
  const per = Math.ceil(limit / Math.max(libraryIds.length, 1));
  for (const id of libraryIds) {
    const q = new URLSearchParams({
      userId: auth.userId,
      parentId: id,
      recursive: 'true',
      includeItemTypes: 'Movie,Series',
      sortBy: 'Random',
      limit: String(per),
      fields: 'Overview,Genres,ProductionYear,CommunityRating,CriticRating,OfficialRating,ChildCount',
      imageTypeLimit: '4',
      enableImageTypes: 'Primary,Backdrop',
    });
    if (genreIds.length) q.set('genreIds', genreIds.join('|'));
    if (unplayedOnly) q.set('isPlayed', 'false');
    const res = await api(`/Items?${q}`);
    for (const it of res.Items) if (!byId.has(it.Id)) byId.set(it.Id, slim(it));
  }
  const items = [...byId.values()].filter((it) => it.images.length);
  for (let i = items.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

export async function image(itemId, type, index, width) {
  const q = new URLSearchParams({ quality: '85' });
  if (width) q.set('fillWidth', String(width));
  return raw(auth.url, auth.token, `/Items/${itemId}/Images/${type}/${index}?${q}`, { timeout: 20000 });
}

export async function sessions() {
  const list = await api(`/Sessions?controllableByUserId=${auth.userId}&activeWithinSeconds=1800`);
  return list
    .filter((s) => s.SupportsRemoteControl && s.DeviceId !== deviceId && s.Client !== CLIENT)
    .map((s) => ({
      id: s.Id,
      deviceId: s.DeviceId,
      device: s.DeviceName,
      client: s.Client,
      user: s.UserName || null,
      nowPlaying: s.NowPlayingItem?.Name || null,
    }));
}

async function playableIdFor(itemId) {
  const item = await api(`/Items/${itemId}?userId=${auth.userId}`);
  if (item.Type !== 'Series') return itemId;
  const next = await api(`/Shows/NextUp?userId=${auth.userId}&seriesId=${itemId}&limit=1`);
  if (next.Items?.length) return next.Items[0].Id;
  const eps = await api(`/Shows/${itemId}/Episodes?userId=${auth.userId}&limit=1`);
  if (!eps.Items?.length) throw Object.assign(new Error('Series has no episodes'), { status: 404 });
  return eps.Items[0].Id;
}

// Session ids change whenever a client reconnects; the device id is stable.
export async function playOnDevice(deviceId, itemId) {
  const s = (await sessions()).find((x) => x.deviceId === deviceId);
  if (!s) throw Object.assign(new Error('Device is not online in Jellyfin'), { status: 404 });
  return play(s.id, itemId);
}

export async function play(sessionId, itemId) {
  const target = await playableIdFor(itemId);
  await api(`/Sessions/${sessionId}/Playing?playCommand=PlayNow&itemIds=${target}`, { method: 'POST' });
  return { playedItemId: target };
}
