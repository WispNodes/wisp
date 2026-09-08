// WISP relay — MV3 service worker. Registers with the coordinator, long-polls for
// fetch jobs, performs each request FROM THIS BROWSER's connection (so the target sees
// the user's residential IP), and reports the real byte count. Bandwidth only — never
// reads the user's tabs, files, or browsing.

const COORD = "https://wispnodes.net/api";
const MAX_BYTES = 8 * 1024 * 1024;   // 8MB cap per fetch

let running = false;
let loopActive = false;

async function get(k, d) { return (await chrome.storage.local.get(k))[k] ?? d; }
async function set(o) { return chrome.storage.local.set(o); }

async function nodeId() {
  let id = await get("nodeId");
  if (!id) { id = "bn" + Math.random().toString(16).slice(2, 10) + Date.now().toString(16).slice(-4); await set({ nodeId: id }); }
  return id;
}

async function detectGeo() {
  for (const url of ["https://ipwho.is/", "https://ipapi.co/json/"]) {
    try {
      const d = await (await fetch(url)).json();
      return { geo: (d.country_code || d.country || "US"), lat: d.latitude, lng: d.longitude };
    } catch (e) {}
  }
  return { geo: "US" };
}

async function jpost(path, body) {
  try {
    const r = await fetch(COORD + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return await r.json();
  } catch (e) { return { ok: false, err: String(e) }; }
}

async function doFetch(url) {
  try {
    const r = await fetch(url, { headers: { "User-Agent": "WISP-Relay/1.0" } });
    const buf = await r.arrayBuffer();
    const bytes = Math.min(buf.byteLength, MAX_BYTES);
    const body = new TextDecoder("utf-8").decode(new Uint8Array(buf.slice(0, 4000)));
    return { code: r.status, bytes, body };
  } catch (e) {
    return { code: 0, bytes: 0, body: "fetch error: " + String(e).slice(0, 200) };
  }
}

async function register() {
  const id = await nodeId();
  const wallet = await get("wallet", null);
  const ref = await get("ref", null);
  const g = await detectGeo();
  await set({ geo: g.geo });
  const r = await jpost("/register", { node_id: id, wallet, geo: g.geo, lat: g.lat, lng: g.lng,
    ip_type: "residential", tier: 1, speed_mbps: 60, browser: true, ref });
  await set({ regError: (r && r.ok) ? null : ((r && r.err) || null) });
  return id;
}

async function relayLoop() {
  if (loopActive) return;
  loopActive = true;
  const id = await register();
  let lastHb = 0;
  while (running) {
    try {
      const t = Date.now();
      if (t - lastHb > 25000) { await jpost("/heartbeat", { node_id: id }); lastHb = t; }
      const job = await (await fetch(COORD + "/job?node_id=" + id)).json();
      if (job && job.job_id) {
        const res = await doFetch(job.url);
        await jpost("/job-result", { job_id: job.job_id, code: res.code, bytes: res.bytes, body: res.body });
        const served = (await get("bytesServed", 0)) + res.bytes;
        const jobs = (await get("jobsServed", 0)) + 1;
        await set({ bytesServed: served, jobsServed: jobs, lastActive: t });
      } else {
        await new Promise(r => setTimeout(r, 1500));
      }
    } catch (e) {
      await new Promise(r => setTimeout(r, 3000));
    }
  }
  loopActive = false;
}

async function start() {
  const wallet = await get("wallet", null);
  if (!wallet) return { ok: false, err: "no wallet" };
  running = true; await set({ running: true, startedAt: Date.now() });
  relayLoop();
  chrome.alarms.create("wisp-keepalive", { periodInMinutes: 0.5 });
  return { ok: true };
}
async function stop() { running = false; await set({ running: false }); chrome.alarms.clear("wisp-keepalive"); return { ok: true }; }

// resume on SW wake if the user had it running
chrome.runtime.onStartup.addListener(async () => { if (await get("running", false)) { running = true; relayLoop(); } });
chrome.alarms.onAlarm.addListener(async () => { if (await get("running", false)) { running = true; if (!loopActive) relayLoop(); } });

chrome.runtime.onMessage.addListener((msg, _s, reply) => {
  (async () => {
    if (msg.type === "start") reply(await start());
    else if (msg.type === "stop") reply(await stop());
    else if (msg.type === "status") reply({
      running: await get("running", false),
      wallet: await get("wallet", null),
      bytesServed: await get("bytesServed", 0),
      jobsServed: await get("jobsServed", 0),
      nodeId: await get("nodeId", null),
      geo: await get("geo", null),
      startedAt: await get("startedAt", 0),
      regError: await get("regError", null)
    });
    else if (msg.type === "setWallet") { await set({ wallet: msg.wallet }); reply({ ok: true }); }
  })();
  return true;
});
