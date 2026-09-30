# JellySwipe — Idea

Original prompt (2026-09-30), lightly cleaned up for typos but otherwise as written:

> Build the app JellySwipe. The idea is to have a webapp in the local network
> where the Jellyfin server is. It connects to the Jellyfin server and queries
> all shows, movies etc. — whatever category or pool is selected.
>
> First you select out of a pool of libraries, optionally you can select
> genres, then you create a "swiping game". This game has a "lobby" where you
> can either click play for solo play (here "matches" don't exist), or you wait
> for other players to join — think about the best system, maybe a QR code or
> simple few-digit lobby codes.
>
> Then you start the swiping game. Random movies come in. I want the feeling
> and optics to be 1:1 cloned from Tinder. Left is bad, right is yes.
>
> I don't know yet if we should end with one match or aim for multiple — maybe
> add in the "create game" options the amount of goal matches: 1, 3, 5. Then
> everyone swipes, and when you reach the goal of matches it ends with a nice
> animation like in Tinder, showcasing the matches.
>
> For this app you need to query stuff from the actual Jellyfin server. Maybe,
> if possible, also play the winner automatically on the selected device.
>
> Make it a webapp (a Jellyfin plugin? maybe just some subpage of Jellyfin?).
> Optimize everything maximally for mobile swiping usage, but it should also
> work on desktop.

## Decisions taken

| Question | Decision | Why |
|---|---|---|
| Plugin vs. standalone | **Standalone Node web app** next to Jellyfin, linked from Jellyfin's sidebar via `menuLinks` | A real plugin is C#/.NET inside the Jellyfin process: restarts on every change and awkward realtime lobby state. Standalone = one tiny container, no Jellyfin restart, same LAN. |
| Joining a lobby | **4-digit code + QR code** (QR encodes the join URL with the code) | Phones scan the QR from the host's screen; people across the room type 4 digits. |
| Realtime transport | Server-Sent Events + plain POSTs | Works on every mobile browser, no WebSocket dependency, auto-reconnects. |
| What is a "match" | A title **every player** swiped right (or super-liked) | Same as Tinder: mutual yes. |
| Goal | Host picks **1 / 3 / 5** matches. Game ends when reached, or when everyone has run out of cards (then shows the closest calls). | Matches the prompt. |
| Solo mode | No matches; your right-swipes count toward the goal and become your picks | "Matches don't exist" in solo. |
| Deck order | Same shuffled deck for everyone in a room | Converges on matches much faster than independent random decks. |
| Series | For TV series, "Play" starts Next Up (or S1E1) | Makes "play the winner" useful for shows too. |
| Play on device | Host picks any Jellyfin client that supports remote control (TV app, web, Android TV…) → `PlayNow` | Uses Jellyfin's Sessions API. |
| Auth | Host logs in to Jellyfin once in the app (token saved in `data/auth.json`), or `JELLYFIN_API_KEY` via env | Players never need Jellyfin accounts. |

## Tinder look & feel checklist

- Pink→orange gradient brand, flame-style logo, white/dark UI
- Full-bleed rounded card, photo with bottom black gradient, bold title + year
- Tap left/right side of the card to flip photos (poster → backdrops) with segment bars on top
- Drag card: rotates with finger, **LIKE** (green, top-left) / **NOPE** (red, top-right) / **SUPER LIKE** (blue, bottom) stamps fade in
- Round bottom buttons: rewind (yellow), nope (red), super like (blue), like (green)
- Next card peeks from behind and scales up
- "It's a Match!" overlay in script type, with the poster and the players who liked it
- End screen showcasing all matches with Play buttons
