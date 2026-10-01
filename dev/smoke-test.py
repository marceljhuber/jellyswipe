#!/usr/bin/env python3
"""End-to-end API smoke test for an installed JellySwipe plugin.

Usage: JF_URL=http://localhost:8096 JF_USER=admin JF_PASS=secret python3 dev/smoke-test.py

Creates a lobby as the Jellyfin user, joins a guest, plays a round to a match,
checks undo rules and solo mode, and then leaves (no playback is triggered
unless JF_PLAY_SESSION is set to a session id).
"""
import json
import os
import sys
import urllib.error
import urllib.request

URL = os.environ.get("JF_URL", "http://localhost:8096").rstrip("/")
BASE = f"{URL}/JellySwipe/api/"


def req(path, body=None, token=None, base=BASE, expect=200):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f'MediaBrowser Token="{token}"'
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(base + path, data=data, headers=headers, method="POST" if data else "GET")
    try:
        with urllib.request.urlopen(r, timeout=30) as res:
            status, raw = res.status, res.read()
    except urllib.error.HTTPError as e:
        status, raw = e.code, e.read()
    out = json.loads(raw) if raw and raw[:1] in (b"{", b"[") else raw
    if status != expect:
        raise AssertionError(f"{path}: expected {expect}, got {status}: {out}")
    return out


def login():
    auth = 'MediaBrowser Client="JellySwipe smoke test", Device="cli", DeviceId="jellyswipe-smoke", Version="1.0"'
    r = urllib.request.Request(
        f"{URL}/Users/AuthenticateByName",
        data=json.dumps({"Username": os.environ["JF_USER"], "Pw": os.environ.get("JF_PASS", "")}).encode(),
        headers={"Content-Type": "application/json", "Authorization": auth},
    )
    with urllib.request.urlopen(r, timeout=30) as res:
        return json.load(res)["AccessToken"]


def logout(token):
    r = urllib.request.Request(f"{URL}/Sessions/Logout", data=b"", method="POST", headers={"Authorization": f'MediaBrowser Token="{token}"'})
    urllib.request.urlopen(r, timeout=10).read()


def main():
    page = urllib.request.urlopen(f"{URL}/JellySwipe/", timeout=10).read().decode()
    assert "app.js" in page, "web app not served"
    anon = req("status")
    assert anon["user"] is None, "anonymous status should have no user"
    print("anonymous visitors host as:", anon.get("host"))
    if not anon.get("host"):
        req("libraries", expect=401)

    token = login()
    try:
        st = req("status", token=token)
        print("signed in as", st["user"])
        libs = req("libraries", token=token)
        print("libraries:", ", ".join(f"{l['name']} ({l['type']})" for l in libs))
        assert libs, "no libraries"
        lib_ids = [l["id"] for l in libs if l["type"] in ("movies", "tvshows")] or [libs[0]["id"]]
        genres = req(f"genres?libraryIds={','.join(lib_ids)}", token=token)
        print(f"genres: {len(genres)}", [g["name"] for g in genres[:8]])
        devices = req("sessions", token=token)
        print("devices:", [d["device"] for d in devices])

        # Multiplayer: goal 1
        host = req("rooms", {"name": "Host", "settings": {"libraryIds": lib_ids, "goal": 1}}, token=token)
        code, hs = host["code"], host["secret"]
        guest = req(f"rooms/{code}/join", {"name": "Guest"})
        req(f"rooms/{code}/start", {"secret": guest["secret"]}, expect=403)
        req(f"rooms/{code}/start", {"secret": hs})
        req(f"rooms/{code}/join", {"name": "Late"}, expect=409)
        deck = req(f"rooms/{code}/deck?secret={hs}")["deck"]
        deck2 = req(f"rooms/{code}/deck?secret={guest['secret']}")["deck"]
        assert sorted(d["id"] for d in deck) == sorted(d["id"] for d in deck2), "players must get the same cards"
        if len(deck) > 3:
            assert [d["id"] for d in deck] != [d["id"] for d in deck2], "each player should get their own order"
        print(f"deck: {len(deck)} cards, first: {deck[0]['name']} ({deck[0]['type']}, {deck[0]['images']})")

        req(f"rooms/{code}/swipe", {"secret": hs, "itemId": deck[0]["id"], "choice": "like"})
        req(f"rooms/{code}/swipe", {"secret": guest["secret"], "itemId": deck[0]["id"], "choice": "nope"})
        req(f"rooms/{code}/undo", {"secret": guest["secret"]})
        r = req(f"rooms/{code}/swipe", {"secret": guest["secret"], "itemId": deck[0]["id"], "choice": "super"})
        assert r["matched"], "expected a match"
        req(f"rooms/{code}/undo", {"secret": guest["secret"]}, expect=409)
        assert req(f"rooms/{code}")["status"] == "finished"
        room_devices = req(f"rooms/{code}/sessions?secret={guest['secret']}")
        assert [d["id"] for d in room_devices] == [d["id"] for d in devices], "guest sees host's devices"
        req(f"rooms/{code}/play", {"secret": hs, "itemId": deck[3]["id"], "sessionId": "x"}, expect=400)
        if os.environ.get("JF_PLAY_SESSION"):
            req(f"rooms/{code}/play", {"secret": hs, "itemId": deck[0]["id"], "sessionId": os.environ["JF_PLAY_SESSION"]})
            print("▶ sent play command")

        # Solo round in the same lobby
        req(f"rooms/{code}/leave", {"secret": guest["secret"]})
        req(f"rooms/{code}/lobby", {"secret": hs})
        req(f"rooms/{code}/start", {"secret": hs})
        solo = req(f"rooms/{code}/deck?secret={hs}")["deck"]
        req(f"rooms/{code}/swipe", {"secret": hs, "itemId": solo[0]["id"], "choice": "like"})
        assert req(f"rooms/{code}")["status"] == "finished", "solo goal 1 reached"
        req(f"rooms/{code}/leave", {"secret": hs})
        req(f"rooms/{code}", expect=404)

        # Deck size: a random selection deals exactly that many (when the library has enough), "all" deals more
        sr = req("rooms", {"name": "Host", "settings": {"libraryIds": lib_ids, "goal": 1, "deckLimit": 3}}, token=token)
        req(f"rooms/{sr['code']}/start", {"secret": sr["secret"]})
        small = req(f"rooms/{sr['code']}/deck?secret={sr['secret']}")["deck"]
        assert len(small) == min(3, len(deck)), f"deckLimit 3 dealt {len(small)}"
        req(f"rooms/{sr['code']}/leave", {"secret": sr["secret"]})
        print(f"deck limit 3: {len(small)} cards (all titles: {len(deck)})")

        # Genre filter: every card must carry the chosen genre
        if genres:
            g = genres[0]
            gr = req("rooms", {"name": "Host", "settings": {"libraryIds": lib_ids, "goal": 1, "genreIds": [g["id"]], "genreNames": [g["name"]]}}, token=token)
            req(f"rooms/{gr['code']}/start", {"secret": gr["secret"]})
            gdeck = req(f"rooms/{gr['code']}/deck?secret={gr['secret']}")["deck"]
            assert gdeck and all(g["name"].lower() in (x.lower() for x in c["genres"]) for c in gdeck), "genre filter leaked other titles"
            print(f"genre '{g['name']}': {len(gdeck)} cards")
            req(f"rooms/{gr['code']}/leave", {"secret": gr["secret"]})
    finally:
        logout(token)
    print("\n✅ JellySwipe smoke test passed")


if __name__ == "__main__":
    try:
        main()
    except AssertionError as e:
        print("❌", e)
        sys.exit(1)
