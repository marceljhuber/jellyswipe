// Tiny fake Jellyfin for local development and tests: `node dev/mock-jellyfin.js`
// then log in to http://localhost:8096 with any username/password.
import http from 'node:http';

const PORT = Number(process.env.MOCK_PORT || 8096);
const hex = (n) => n.toString(16).padStart(32, '0');
const GENRES = ['Action', 'Comedy', 'Drama', 'Sci-Fi', 'Horror', 'Animation', 'Thriller', 'Romance'];
const WORDS = ['Midnight', 'Galaxy', 'Echo', 'Paper', 'Crimson', 'Silent', 'Neon', 'Ocean', 'Iron', 'Velvet', 'Last', 'Hidden', 'Golden', 'Broken', 'Wild'];
const NOUNS = ['Protocol', 'Summer', 'Heist', 'Kingdom', 'Signal', 'Harbor', 'Detective', 'Garden', 'Frontier', 'Letters', 'Machine', 'River'];

const libs = [
  { Id: hex(1), Name: 'Movies', CollectionType: 'movies', ImageTags: { Primary: 'a' } },
  { Id: hex(2), Name: 'Shows', CollectionType: 'tvshows', ImageTags: { Primary: 'b' } },
  { Id: hex(3), Name: 'Music', CollectionType: 'music' },
];
const items = [];
for (let i = 0; i < 60; i++) {
  const series = i % 3 === 0;
  items.push({
    Id: hex(1000 + i),
    Name: `${WORDS[i % WORDS.length]} ${NOUNS[(i * 7) % NOUNS.length]}`,
    Type: series ? 'Series' : 'Movie',
    ParentId: series ? libs[1].Id : libs[0].Id,
    ProductionYear: 1985 + (i * 13) % 40,
    Overview: 'A thrilling story about people who cannot decide what to watch, until a swipe changes everything. Twists, turns and popcorn.',
    Genres: [GENRES[i % GENRES.length], GENRES[(i * 3 + 1) % GENRES.length]].filter((g, k, a) => a.indexOf(g) === k),
    GenreItems: [],
    CommunityRating: 5 + (i % 50) / 10,
    OfficialRating: ['PG', 'PG-13', 'R', 'FSK-12'][i % 4],
    RunTimeTicks: series ? null : (80 + (i % 70)) * 600000000,
    ChildCount: series ? 1 + (i % 5) : undefined,
    ImageTags: { Primary: 'p' },
    BackdropImageTags: i % 2 ? ['b0', 'b1'] : ['b0'],
    Played: i % 5 === 0,
  });
}
const genreId = (g) => hex(500 + GENRES.indexOf(g));
const sessions = [
  { Id: 'sess-tv', DeviceId: 'dev-tv', DeviceName: 'Living Room TV', Client: 'Jellyfin Android TV', UserName: 'demo', SupportsRemoteControl: true },
  { Id: 'sess-web', DeviceId: 'dev-web', DeviceName: 'Firefox', Client: 'Jellyfin Web', UserName: 'demo', SupportsRemoteControl: true },
];
export const played = [];

function poster(id, type) {
  const it = items.find((x) => x.Id === id) || libs.find((x) => x.Id === id) || { Name: '?' };
  const n = parseInt(id.slice(-4), 16);
  const h1 = (n * 47) % 360;
  const h2 = (h1 + 60) % 360;
  const [w, h] = type === 'Backdrop' ? [1280, 720] : [600, 900];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${h1},70%,45%)"/><stop offset="1" stop-color="hsl(${h2},70%,20%)"/></linearGradient></defs>
    <rect width="100%" height="100%" fill="url(#g)"/>
    <circle cx="${w * 0.7}" cy="${h * 0.3}" r="${w * 0.25}" fill="rgba(255,255,255,.12)"/>
    <text x="50%" y="${type === 'Backdrop' ? 50 : 35}%" fill="#fff" font-family="sans-serif" font-size="${w / 12}" font-weight="900" text-anchor="middle">${it.Name}</text>
    <text x="50%" y="${type === 'Backdrop' ? 62 : 42}%" fill="rgba(255,255,255,.7)" font-family="sans-serif" font-size="${w / 24}" text-anchor="middle">${type}</text>
  </svg>`;
}

function json(res, body, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;
  const q = Object.fromEntries([...url.searchParams].map(([k, v]) => [k.toLowerCase(), v]));
  if (p === '/System/Info/Public') return json(res, { ServerName: 'Mock Jellyfin', Version: '10.11.0', Id: 'mock' });
  if (p === '/Users/AuthenticateByName') return json(res, { AccessToken: 'mock-token', User: { Id: hex(9), Name: 'demo' } });
  if (!String(req.headers.authorization).includes('Token="mock-token"')) return json(res, {}, 401);
  if (p === '/System/Info') return json(res, { ServerName: 'Mock Jellyfin' });
  if (p === '/Users') return json(res, [{ Id: hex(9), Name: 'demo', Policy: { IsAdministrator: true } }]);
  if (p === '/UserViews') return json(res, { Items: libs });
  if (p === '/Genres') {
    const names = [...new Set(items.filter((i) => i.ParentId === q.parentid).flatMap((i) => i.Genres))];
    return json(res, { Items: names.map((n) => ({ Id: genreId(n), Name: n })) });
  }
  if (p === '/Items') {
    let list = items.filter((i) => i.ParentId === q.parentid);
    if (q.genreids) {
      const want = new Set(q.genreids.split('|'));
      list = list.filter((i) => i.Genres.some((g) => want.has(genreId(g))));
    }
    if (q.isplayed === 'false') list = list.filter((i) => !i.Played);
    return json(res, { Items: list.slice(0, Number(q.limit) || 100) });
  }
  const im = p.match(/^\/Items\/(\w+)\/Images\/(\w+)\/\d$/);
  if (im) {
    res.writeHead(200, { 'Content-Type': 'image/svg+xml' });
    return res.end(poster(im[1], im[2]));
  }
  const one = p.match(/^\/Items\/(\w+)$/);
  if (one) return json(res, items.find((i) => i.Id === one[1]) || {}, 200);
  if (p === '/Shows/NextUp') return json(res, { Items: [{ Id: hex(90000), Name: 'S1E1' }] });
  if (p === '/Sessions') return json(res, sessions);
  const pl = p.match(/^\/Sessions\/([\w-]+)\/Playing$/);
  if (pl && req.method === 'POST') {
    played.push({ session: pl[1], itemIds: q.itemids });
    console.log(`[mock] PlayNow ${q.itemids} on ${pl[1]}`);
    res.writeHead(204);
    return res.end();
  }
  return json(res, { error: 'not mocked' }, 404);
});

server.listen(PORT, () => console.log(`Mock Jellyfin on http://localhost:${PORT}`));
