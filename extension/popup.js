const $ = id => document.getElementById(id);
const send = msg => new Promise(r => chrome.runtime.sendMessage(msg, r));
const COORD = "https://wispnodes.net/api";

function fmtData(b) {
  b = Number(b) || 0;
  if (b < 1024) return b + " B";
  if (b < 1048576) return (b / 1024).toFixed(1) + " KB";
  if (b < 1073741824) return (b / 1048576).toFixed(2) + " MB";
  return (b / 1073741824).toFixed(2) + " GB";
}
function fmtUptime(ms) {
  if (!ms) return "—";
  const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  if (h) return h + "h " + m + "m";
  if (m) return m + "m " + (s % 60) + "s";
  return s + "s";
}

let provTimer = 0, lastProv = { pts: 0, share: 0, nvda: 0 };

async function fetchProvider(wallet) {
  if (!wallet) return;
  try {
    const r = await (await fetch(COORD + "/provider/" + wallet)).json();
    const s = (r && r.summary) || {};
    lastProv = { pts: s.points || 0, share: s.share || 0, nvda: s.est_nvda || 0, claim: s.claimable_nvda || 0 };
  } catch (e) {}
}

async function refresh() {
  const s = await send({ type: "status" });
  if (!s) return;
  const on = !!s.running;
  if (s.wallet && document.activeElement !== $("wallet")) $("wallet").value = s.wallet;

  $("dot").classList.toggle("on", on);
  $("ststr").textContent = on ? "sharing" : "offline";
  $("toggle").textContent = on ? "Stop sharing" : "Start sharing";
  $("toggle").classList.toggle("off", !on);
  $("stream").classList.toggle("on", on);

  $("gb").textContent = fmtData(s.bytesServed);
  $("jobs").textContent = s.jobsServed || 0;
  $("geo").textContent = s.geo || "—";
  $("up").textContent = on && s.startedAt ? fmtUptime(Date.now() - s.startedAt) : "—";

  $("nvda").textContent = (lastProv.nvda || 0).toFixed(4);
  $("pts").textContent = (lastProv.pts || 0).toFixed(2);
  $("share").textContent = (lastProv.share || 0) + "%";
  $("csub").textContent = s.regError ? s.regError
    : (on ? "sharing · " + (lastProv.share || 0) + "% of the network" : (s.wallet ? "ready · offline" : "connect wallet · offline"));

  if (s.wallet && /^0x[a-fA-F0-9]{40}$/.test(s.wallet)) {
    $("reflink").value = "wispnodes.net/app?ref=" + s.wallet;
  }
}

$("wallet").addEventListener("change", async () => {
  const w = $("wallet").value.trim();
  if (w && !/^0x[a-fA-F0-9]{40}$/.test(w)) { $("msg").textContent = "Enter a valid 0x wallet address."; $("msg").className = "msg err"; return; }
  await send({ type: "setWallet", wallet: w });
  $("msg").className = "msg"; $("msg").textContent = w ? "Wallet saved." : "";
  fetchProvider(w).then(refresh);
});

$("toggle").addEventListener("click", async () => {
  const s = await send({ type: "status" });
  if (s.running) { await send({ type: "stop" }); $("msg").className = "msg"; $("msg").textContent = "Stopped."; }
  else {
    const w = $("wallet").value.trim();
    if (!/^0x[a-fA-F0-9]{40}$/.test(w)) { $("msg").className = "msg err"; $("msg").textContent = "Enter your wallet first."; return; }
    await send({ type: "setWallet", wallet: w });
    const r = await send({ type: "start" });
    $("msg").className = r.ok ? "msg" : "msg err";
    $("msg").textContent = r.ok ? "Sharing — earning NVDA." : ("Could not start: " + (r.err || ""));
  }
  refresh();
});

$("copy").addEventListener("click", () => {
  const v = $("reflink").value;
  if (v.startsWith("wispnodes")) { navigator.clipboard.writeText("https://" + v); $("copy").textContent = "Copied"; setTimeout(() => $("copy").textContent = "Copy", 1200); }
});

async function tick() {
  const s = await send({ type: "status" });
  if (s && s.wallet) await fetchProvider(s.wallet);
  refresh();
}
tick();
setInterval(refresh, 1000);
setInterval(tick, 6000);
