#!/usr/bin/env python3
"""
WISP REAL relay client — a provider node that actually relays buyer traffic.

Registers with the coordinator, then long-polls for fetch jobs. For each job it
performs the HTTP request FROM ITS OWN CONNECTION (so the target sees this machine's
IP) and returns the response + real byte count. The coordinator meters those bytes
and credits this node. This is the real bandwidth-sharing path (browsers can't do
this due to CORS; a CLI/native client or extension can).

Usage:
  python3 relay_client.py --wallet 0xYourWallet --ip residential

Requires holding 250,000 $WISP in the wallet you register with. Your region is
auto-detected from your connection; override with --geo / --lat / --lng if needed.
"""
import argparse, hashlib, json, os, secrets, time, urllib.request, urllib.parse

KEYFILE = os.path.join(os.path.dirname(__file__), "relay_node.key")
BODY_CAP = 4000  # chars of body returned for transport/preview (bytes metered = full length)

def node_id():
    if os.path.exists(KEYFILE): return open(KEYFILE).read().strip()
    nid = "relay-" + hashlib.sha256(secrets.token_bytes(16)).hexdigest()[:16]
    open(KEYFILE, "w").write(nid); os.chmod(KEYFILE, 0o600); return nid

def jpost(url, payload, timeout=15):
    data = json.dumps(payload).encode()
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
    try: return json.load(urllib.request.urlopen(req, timeout=timeout))
    except Exception as e: return {"ok": False, "err": str(e)}

def jget(url, timeout=35):
    try: return json.load(urllib.request.urlopen(url, timeout=timeout))
    except Exception as e: return {"ok": False, "err": str(e)}

def measure_speed():
    return 100.0  # a CLI relay advertises a fixed capacity; real bytes are what get metered

def do_fetch(url):
    """Perform the real HTTP request from THIS machine's connection."""
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "WISP-Relay/1.0"})
        MAX_BYTES = 8 * 1024 * 1024  # 8MB cap per fetch
        with urllib.request.urlopen(req, timeout=25) as r:
            raw = r.read(MAX_BYTES); code = r.getcode()
        text = raw.decode("utf-8", "replace")
        return {"code": code, "bytes": len(raw), "body": text[:BODY_CAP]}
    except Exception as e:
        return {"code": 0, "bytes": 0, "body": "fetch error: " + str(e)[:200]}

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--coordinator", default="https://wispnodes.net/api")
    ap.add_argument("--wallet", default=None)
    ap.add_argument("--geo", default=None, help="region code (auto-detected from your IP if omitted)")
    ap.add_argument("--lat", type=float, default=None)
    ap.add_argument("--lng", type=float, default=None)
    ap.add_argument("--ip", default="residential", choices=["residential", "mobile", "datacenter"])
    ap.add_argument("--tier", type=int, default=1)
    ap.add_argument("--ref", default=None)
    a = ap.parse_args()

    # auto-detect this node's real location so it plots on the right spot of the globe
    geo, lat, lng = a.geo, a.lat, a.lng
    if geo is None or lat is None or lng is None:
        for url in ("https://ipwho.is/", "https://ipapi.co/json/"):
            try:
                d = jget(url, timeout=6) or {}
                cc = d.get("country_code") or d.get("country")
                la = d.get("latitude"); lo = d.get("longitude")
                if geo is None and cc: geo = str(cc).upper()
                if lat is None and la is not None: lat = float(la)
                if lng is None and lo is not None: lng = float(lo)
                if geo and lat is not None and lng is not None: break
            except Exception:
                continue
    if geo is None: geo = "US"
    print("node location:", geo, (lat, lng) if lat is not None else "(region centre)")

    nid = node_id(); coord = a.coordinator.rstrip("/")
    reg = jpost(coord + "/register", {"node_id": nid, "speed_mbps": measure_speed(),
                "ip_type": a.ip, "geo": geo, "lat": lat, "lng": lng,
                "tier": a.tier, "wallet": a.wallet, "ref": a.ref})
    print("registered relay node:", nid, "| mult", reg.get("mult"))
    print("polling for real fetch jobs… (Ctrl-C to stop)")
    last_hb = 0
    while True:
        if time.time() - last_hb > 25:
            jpost(coord + "/heartbeat", {"node_id": nid}); last_hb = time.time()
        job = jget(coord + "/job?node_id=" + nid)
        jobid = job.get("job_id")
        if jobid:
            url = job.get("url")
            print("  job", jobid[:8], "-> fetching", url)
            res = do_fetch(url)
            jpost(coord + "/job-result", {"job_id": jobid, "code": res["code"],
                  "bytes": res["bytes"], "body": res["body"]})
            print("    served", res["bytes"], "bytes (code", str(res["code"]) + ")")
        else:
            time.sleep(1)

if __name__ == "__main__":
    main()
