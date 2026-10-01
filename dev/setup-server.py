#!/usr/bin/env python3
"""Completes the Jellyfin startup wizard (admin/test), adds dev media as a Movies library and waits for the scan."""
import json, sys, time, urllib.request, urllib.error

U = sys.argv[1].rstrip("/")
AUTH = 'MediaBrowser Client="JellySwipe dev", Device="cli", DeviceId="jellyswipe-dev", Version="1.0"'


def call(path, body=None, token=None, method=None):
    h = {"Content-Type": "application/json", "Authorization": AUTH + (f', Token="{token}"' if token else "")}
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(U + path, data=data, headers=h, method=method or ("POST" if data is not None else "GET"))
    for attempt in range(30):
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                raw = r.read()
                return json.loads(raw) if raw[:1] in (b"{", b"[") else None
        except urllib.error.HTTPError as e:
            if e.code == 503:  # still starting
                time.sleep(2)
                continue
            raise
        except (urllib.error.URLError, ConnectionError, TimeoutError):
            time.sleep(2)
    raise RuntimeError(f"{path} never became available")


call("/Startup/Configuration", {"UICulture": "en-US", "MetadataCountryCode": "US", "PreferredMetadataLanguage": "en"})
call("/Startup/User")
call("/Startup/User", {"Name": "admin", "Password": "test"})
call("/Startup/Complete", {}, method="POST")
token = call("/Users/AuthenticateByName", {"Username": "admin", "Pw": "test"})["AccessToken"]
if "--no-library" in sys.argv:
    print("    server ready (no library)")
    sys.exit(0)
call("/Library/VirtualFolders?name=Movies&collectionType=movies&paths=%2Fmedia%2Fmovies&refreshLibrary=true", {"LibraryOptions": {}}, token)
for i in range(90):
    time.sleep(2)
    if i in (10, 40):  # some 12.x first boots don't start the initial scan by themselves
        call("/Library/Refresh", {}, token, method="POST")
    n = call("/Items?recursive=true&includeItemTypes=Movie&hasOverview=true&limit=0", token=token, method="GET")["TotalRecordCount"]
    imgs = call("/Items?recursive=true&includeItemTypes=Movie&imageTypes=Primary&limit=0", token=token, method="GET")["TotalRecordCount"]
    if n >= 15 and imgs >= 15:
        break
print(f"    server ready, {n} movies with metadata, {imgs} with posters")
