#!/usr/bin/env python3
"""Checks the public plugin repository: every manifest entry must download and match its MD5 checksum.
    python3 dev/verify-release.py [manifest-url]"""
import hashlib, json, sys, urllib.request

URL = sys.argv[1] if len(sys.argv) > 1 else "https://raw.githubusercontent.com/marceljhuber/jellyswipe/main/manifest.json"
plugin = json.load(urllib.request.urlopen(f"{URL}?nocache={__import__('time').time():.0f}"))[0]
print(f"{plugin['name']}: {len(plugin['versions'])} versions | catalog changelog: {plugin.get('changelog', '')[:80]}")
bad = 0
for v in plugin["versions"]:
    try:
        data = urllib.request.urlopen(v["sourceUrl"], timeout=60).read()
        ok = hashlib.md5(data).hexdigest() == v["checksum"]
    except Exception as e:  # noqa: BLE001
        ok, data = False, b""
        print(f"  download failed: {v['sourceUrl']} ({e})")
    bad += not ok
    print(f"  {'OK ' if ok else 'BAD'} {v['version']:12} targetAbi {v['targetAbi']:10} {len(data):>8} bytes")
sys.exit(1 if bad else 0)
