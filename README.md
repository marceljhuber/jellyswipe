# JellySwipe 🔥

**Tinder for your Jellyfin library.** Pick libraries and genres, open a lobby, and everyone swipes on their phone. The first titles *everyone* swiped right on win, and JellySwipe can start the winner on your TV automatically.

- 🃏 Tinder-style cards: drag with rotation, LIKE / NOPE / SUPER LIKE stamps, tap to flip poster ↔ backdrops, rewind, "It's a Match!" celebration
- 👥 Lobbies with a **4-digit code + QR code**. Nobody needs a Jellyfin account to join.
- 🎯 Goal of **1, 3 or 5 matches**. Solo mode turns right-swipes into your personal picks.
- 📺 **Play on any Jellyfin device** that supports remote control (Android TV, web, mobile…). Series start at Next Up, or S1E1.
- ⏱ Optional **auto-play of the winner** with a 10-second, cancellable countdown
- 📱 Mobile-first PWA (add to home screen, safe-area aware, haptics). Also works on desktop: ← → ↑ keys, Z to undo, Space for details.
- 🌗 Light and dark mode. No build step, one runtime dependency (`qrcode`).

See [IDEA.md](IDEA.md) for the original idea and the design decisions.

## Quick start

```bash
npm install
npm start               # http://<this-machine-LAN-IP>:8097
```

On first start the page asks for your Jellyfin URL and a Jellyfin login. The access token is stored in `data/auth.json` (gitignored, mode 600). Players who join only type a name.

> Open JellySwipe via the machine's **LAN address**, not `localhost`, so the lobby QR code works for phones.

### Docker

```bash
cp .env.example .env    # optional: preconfigure URL / API key
docker compose up -d --build
```

### Configuration (`.env`, all optional)

| Variable | Purpose |
|---|---|
| `JELLYFIN_URL` | Jellyfin address as the server sees it (pre-fills the login form) |
| `JELLYFIN_PUBLIC_URL` | Address used for "Open in Jellyfin" links in browsers |
| `JELLYFIN_API_KEY` | Use an API key instead of a login; `JELLYFIN_USERNAME` selects the user context |
| `JELLYFIN_USERNAME` / `JELLYFIN_PASSWORD` | Log in automatically on start |
| `PORT` | Default `8097` |
| `AUTOPLAY_DELAY_MS` | Countdown before auto-playing the winner (default `10000`) |

## Make it feel like part of Jellyfin

JellySwipe is a standalone web app, not a plugin. A Jellyfin plugin would be C#/.NET running inside the server, which needs a restart for every change and makes the realtime lobby awkward. To still reach it from Jellyfin's sidebar, add a custom menu link to jellyfin-web's `config.json` (in Docker usually `/jellyfin/jellyfin-web/config.json`; on Debian `/usr/share/jellyfin/web/config.json`):

```json
"menuLinks": [
  { "name": "JellySwipe", "icon": "favorite", "url": "http://<jellyswipe-host>:8097" }
]
```

All client URLs are relative, so JellySwipe also works behind a reverse proxy under a sub-path (e.g. `https://media.example.com/jellyswipe/`). For Server-Sent Events, disable proxy buffering on `/api/rooms/*/events`. JellySwipe already sends `X-Accel-Buffering: no` for nginx.

## How a game works

1. **Create:** pick libraries (movies / shows / mixed), optional genres, the match goal, "only unwatched", and optionally a device for auto-play.
2. **Lobby:** friends scan the QR code or type the code. With one player the host's button says *Play solo*.
3. **Swipe:** everyone gets the **same shuffled deck**, so matches happen quickly. A match is a title every player in the lobby liked or super-liked.
4. **Finish:** when the goal is reached, everyone sees the celebration and the ranked results (super-likes rank first, then match order). If the deck runs out first, you get the matches so far plus the *closest calls*.
5. **Play:** tap ▶ on any result and choose a device, or let auto-play start #1.

## Architecture

```
public/            vanilla JS SPA (app.js), Tinder-style CSS, PWA manifest
server.js          node:http server — static files, REST API, SSE, image proxy, QR
src/jellyfin.js    Jellyfin API client (login/API key, libraries, genres, deck, sessions, play)
src/rooms.js       in-memory lobbies, swipes, match detection, auto-play timer
dev/               mock Jellyfin + end-to-end smoke test
```

- Realtime runs over **Server-Sent Events** plus plain POSTs, which works on every mobile browser and reconnects automatically. A reload resumes at the same card.
- Images are **proxied** through JellySwipe (`/api/img/...`), so browsers never see the Jellyfin token.
- Lobbies are in memory and expire after 6 hours of inactivity. A restart ends running games.
- Each player gets a random secret stored in `localStorage`. Only the host can start, kick or restart.

## Security notes

JellySwipe is meant for a trusted LAN. Anyone who can reach it can create lobbies and send "play" commands to your Jellyfin devices, but only for titles that came out of a game. The Jellyfin login form is only available while no account is connected. Use "switch account" on the home screen to change it. Don't expose it to the internet without an authenticating reverse proxy in front.

## Development

```bash
npm run dev                  # node --watch
node dev/mock-jellyfin.js    # fake Jellyfin on :8096 with generated posters (log in with any user)
node dev/smoke-test.js       # end-to-end API test against the mock (lobby, matches, undo, solo, auto-play)
npm run check                # syntax check
```

## License

MIT
