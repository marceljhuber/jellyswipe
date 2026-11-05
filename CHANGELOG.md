# Changelog

## 0.3.1

- Fix: two quick taps on *Start* could deal two decks; a second start now gets HTTP 409.
- Fix: when everyone else leaves a multi-player game, it ends ("Everyone else left") instead of
  waiting forever.
- Fix: swiping an already matched title again could change the result; matches are final.
- Fix: a kicked player's live connection stayed open.
- New unit tests (`tests/JellySwipe.Tests`, `-p:JellyfinTarget=12`).
- Build: the plugin and the test project no longer share one restore folder (`artifacts/obj`), which made test builds fail every other run.

## 0.3.0

- **Deck size:** choose *All titles* (default) or *A random selection of N*; type any number (20, 100, 1000 …). Admins can set an optional server-wide cap (0 = no limit).
- **Wording cleanup:** plain sentence-case labels and messages; same look and layout as 0.2.
- Card images for the first cards are preloaded as soon as a game starts.
- Pinch-zoom is no longer blocked (accessibility).
- Fixed: games failed on Jellyfin 10.11.0 (its random sort returns duplicate rows); the deck is now shuffled by JellySwipe.

## 0.2.0: first public release

**Swipe your Jellyfin library with friends, Tinder-style, until you match on what to watch.**

- Native plugin for **Jellyfin 10.9, 10.10, 10.11 and 12.x**. The catalog installs the right build for your server.
- Lobbies with a **4-digit code + QR code**, and nobody needs to log in (hosts without a Jellyfin session use a configurable default user).
- Tinder-style cards: drag with rotation, LIKE / NOPE / SUPER LIKE stamps, photo flipping, rewind, "It's a Match!"
- Each player swipes the same cards in their **own random order**. Goal of 1, 3 or 5 matches, plus a solo mode.
- **Play on any Jellyfin device**, or auto-play the winner with a cancellable countdown. Series start at the next unwatched episode.
- Sidebar entry + header button in Jellyfin web (with the optional File Transformation plugin).
- Mobile-first PWA, dark mode, haptics, keyboard shortcuts on desktop. Self-hosted fonts, so it works on offline LANs.
