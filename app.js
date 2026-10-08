// Wenamy Daily: the owner's tracker. Daily ticks live in "days" (private).
// Every save also writes that day's public summary to "reports", which the report page reads.
import { app, db, OWNER } from "./firebase.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged }
  from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { collection, doc, getDoc, setDoc, onSnapshot, query, where }
  from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const TASKS = [
  { id: "social", name: "Social posts", sub: "Each post goes on Facebook, Instagram and TikTok. 3 is the goal; you can tick up to 10.", target: 10, goal: 3, unit: "post" },
  { id: "jiji", name: "Jiji listings", sub: "Properties on jiji.com.gh. 5 is the goal; you can tick up to 10.", target: 10, goal: 5, unit: "listing" },
  { id: "website", name: "Off-plan page", sub: "Properties on the Wenamy website off-plan page. 5 is the goal; you can tick up to 10.", target: 10, goal: 5, unit: "property" },
  { id: "meqasa", name: "Meqasa listings", sub: "5 properties on meqasa.com.", target: 5, unit: "listing" }
];
const LINK_TYPES = { jiji: "Jiji", website: "Website", social: "Social", other: "Other" };
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// One-time starting data: Jiji ads posted on 7 and 8 Oct 2026, before this app existed.
const J = "https://jiji.com.gh/accra-metropolitan/houses-apartments-for-sale/";
const SEEDS = [{
  date: "2026-10-07", jiji: 5,
  links: [
    { type: "jiji", label: "7-bedroom mansion", url: J + "7bdrm-mansion-in-accra-metropolitan-for-sale-BWAsVLXr21kHR2dKooKfmYi1.html" },
    { type: "jiji", label: "2-bedroom bungalow", url: J + "2bdrm-bungalow-in-accra-metropolitan-for-sale-zPre9uvsvgmJjdIxGAPn7EjF.html" },
    { type: "jiji", label: "3-bedroom bungalow", url: J + "3bdrm-bungalow-in-accra-metropolitan-for-sale-wdddpX2DkIf5KIShbr0Fy2Zt.html" },
    { type: "jiji", label: "6-bedroom villa duplex", url: J + "6bdrm-duplex-in-accra-metropolitan-for-sale-kHeXc1jxZurGHRaWHDlPXD8W.html" },
    { type: "jiji", label: "8-bedroom villa", url: J + "8bdrm-villa-in-accra-metropolitan-for-sale-m72tSHkwjp8sPPJRzXcSWrx8.html" }
  ]
}, {
  date: "2026-10-08", jiji: 2,
  links: [
    { type: "jiji", label: "2-bedroom courtyard bungalow", url: J + "2bdrm-bungalow-in-accra-metropolitan-for-sale-3CkucC8kz7c2LcHmndfJ2BaQ.html" },
    { type: "jiji", label: "3-bedroom curved-frame bungalow", url: J + "3bdrm-bungalow-in-accra-metropolitan-for-sale-7JKuuRbYA7zZ3RzjvLkS9WJY.html" }
  ]
}];

const ymd = d => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
const parse = s => { const p = s.split("-"); return new Date(+p[0], +p[1] - 1, +p[2]); };
const shift = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return ymd(d); };
const weekStart = s => { const d = parse(s); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return ymd(d); };
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const safeUrl = u => /^https?:\/\//i.test(u) ? u : "";

const today = ymd(new Date());
const S = { view: today, days: {}, paused: ["meqasa"], ready: false };
const dirty = new Set();
let inflight = null, saving = false, timer = null, unsubs = [];

const $ = id => document.getElementById(id);
const appEl = $("app"), statusEl = $("status");
const setStatus = (t, bad) => { statusEl.textContent = t; statusEl.className = "status" + (bad ? " bad" : ""); };

const day = d => S.days[d] || {};
const active = () => TASKS.filter(t => !S.paused.includes(t.id));
const need = t => t.goal || t.target;
function progress(d) {
  let got = 0, tot = 0; const x = day(d);
  active().forEach(t => { tot += need(t); got += Math.min(+x[t.id] || 0, need(t)); });
  return { got, tot, pct: tot ? got / tot : 0, full: tot > 0 && got >= tot };
}
function streak() {
  let n = 0, d = today;
  if (!progress(d).full) d = shift(d, -1);
  while (progress(d).full && n < 400) { n++; d = shift(d, -1); }
  return n;
}
function smsDay(d) {
  const w = weekStart(d);
  for (let i = 0; i < 7; i++) { const k = shift(w, i); if (day(k).sms) return k; }
  return null;
}
// One day's public summary. This is all the report page ever sees.
function daySummary(d) {
  const x = day(d), out = { date: d, sms: !!x.sms, links: [] };
  TASKS.forEach(t => { out[t.id] = +x[t.id] || 0; });
  (x.links || []).forEach(l => { if (safeUrl(l.url)) out.links.push({ type: l.type, label: l.label || "", url: l.url }); });
  out.updatedAt = new Date().toISOString();
  return out;
}

function render() {
  const v = S.view, x = day(v), p = progress(v), d = parse(v), st = streak();
  const title = (v === today ? "Today, " : v === shift(today, -1) ? "Yesterday, " : FULL[d.getDay()] + ", ") + d.getDate() + " " + MON[d.getMonth()];
  const left = p.tot - p.got;
  const line = p.full ? "Everything is done for this day." : (p.got === 0 ? "Nothing ticked yet." : left + " more to finish the day.");
  let h = '<div class="stack">';
  h += '<div class="daynav"><button class="arrow" id="prev" aria-label="Previous day">&#8592;</button><h1>' + title + "</h1>" +
    '<button class="arrow" id="next" aria-label="Next day"' + (v >= today ? " disabled" : "") + ">&#8594;</button></div>";
  if (v !== today) h += '<div><button class="back" id="totoday">Back to today</button></div>';
  h += '<div class="score"><div class="score-row"><div><div class="score-big num">' + p.got + "<small> of " + p.tot + '</small></div><div class="score-line">' + line + "</div></div>" +
    '<div class="streak"><b class="num">' + st + "</b>day" + (st === 1 ? "" : "s") + " in a row</div></div>" +
    '<div class="track"><i style="width:' + Math.round(p.pct * 100) + '%"></i></div></div>';

  h += '<div class="panel">';
  active().forEach(t => {
    const c = +x[t.id] || 0, n = need(t);
    const chip = c >= n ? '<span class="chip done">Done</span>' : c > 0 ? '<span class="chip part">' + (n - c) + " to go</span>" : '<span class="chip">Not started</span>';
    h += '<section class="task"><div class="task-head"><h2>' + t.name + "</h2>" + chip + '</div><p class="sub">' + t.sub + '</p><div class="pips">';
    for (let i = 1; i <= t.target; i++) {
      h += '<button class="pip' + (i <= c ? " on" : "") + (i > n ? " extra" : "") + '" id="pip-' + t.id + "-" + i + '" data-task="' + t.id + '" data-n="' + i + '" aria-pressed="' + (i <= c) + '" aria-label="' + i + " " + t.unit + (i > 1 ? "s" : "") + ' done">' + i + "</button>";
    }
    h += '</div><div class="task-foot"><span class="num">' + c + " of " + t.target + '</span><button class="link" data-pause="' + t.id + '">Pause this task</button></div></section>';
  });
  const sd = smsDay(v), mine = !!x.sms;
  const smsChip = sd ? '<span class="chip done">Sent ' + DOW[parse(sd).getDay()] + "</span>" : '<span class="chip part">Due this week</span>';
  h += '<section class="task"><div class="task-head"><h2>SMS campaign</h2>' + smsChip + '</div><p class="sub">One message to the client list every week, Monday to Sunday.</p>' +
    '<button class="sms-btn' + (mine ? " on" : "") + '" id="sms" aria-pressed="' + mine + '">' + (mine ? "Sent on this day" : "Mark as sent on this day") + "</button></section>";
  h += "</div>";

  // Links that will appear on the daily report
  const links = x.links || [];
  h += '<div class="panel"><section class="task"><div class="task-head"><h2>Links for the report</h2><span class="chip">' + links.length + '</span></div>' +
    '<p class="sub">Paste the live ad or post so the daily report can link to it.</p>';
  if (links.length) {
    h += '<ul class="linklist">';
    links.forEach((l, i) => {
      h += '<li><span class="tag">' + esc(LINK_TYPES[l.type] || "Other") + '</span><a href="' + esc(safeUrl(l.url)) + '" target="_blank" rel="noopener">' + esc(l.label || l.url) + '</a><button class="link" data-rmlink="' + i + '">Remove</button></li>';
    });
    h += "</ul>";
  }
  h += '<form class="linkform" id="linkform"><select id="link-type" aria-label="Link type">' +
    Object.keys(LINK_TYPES).map(k => '<option value="' + k + '">' + LINK_TYPES[k] + "</option>").join("") +
    '</select><input id="link-label" type="text" placeholder="Name (optional)" aria-label="Link name" maxlength="80">' +
    '<input id="link-url" type="url" placeholder="https://…" aria-label="Link address" required><button class="btn" type="submit">Add</button></form></section></div>';

  const off = TASKS.filter(t => S.paused.includes(t.id));
  if (off.length) {
    h += '<div class="paused"><span>Paused, not counted:</span>';
    off.forEach(t => { h += "<span>" + t.name + ' <button class="link" data-resume="' + t.id + '">Resume</button></span>'; });
    h += "</div>";
  }

  let full = 0, bars = "";
  for (let k = 13; k >= 0; k--) {
    const dd = shift(today, -k), pp = progress(dd), dt = parse(dd);
    if (pp.full) full++;
    bars += '<button class="bar' + (pp.full ? " full" : "") + (dd === v ? " sel" : "") + '" data-day="' + dd + '" aria-label="' + DOW[dt.getDay()] + " " + dt.getDate() + ", " + pp.got + " of " + pp.tot + '">' +
      '<span class="col"><i style="height:' + Math.round(pp.pct * 100) + '%"></i></span><span>' + DOW[dt.getDay()].charAt(0) + '</span><span class="num">' + dt.getDate() + "</span></button>";
  }
  h += '<div class="hist"><h3>Last 14 days</h3><p>' + full + " of 14 days fully done. Tap a day to open it.</p><div class=\"bars\">" + bars + "</div></div>";
  h += "</div>";
  appEl.innerHTML = h;
}

function touch(d) {
  dirty.add(d);
  setStatus("Saving…");
  clearTimeout(timer); timer = setTimeout(flush, 500);
}
async function flush() {
  if (saving) return;
  saving = true; let ok = true;
  try {
    while (dirty.size) {
      const d = dirty.values().next().value; dirty.delete(d); inflight = d;
      await setDoc(doc(db, "days", d), Object.assign({}, S.days[d], { date: d, updatedAt: new Date().toISOString() }));
      await setDoc(doc(db, "reports", d), daySummary(d));
    }
    inflight = null;
  } catch (e) {
    ok = false; if (inflight) dirty.add(inflight); inflight = null;
    setStatus(e && e.code === "permission-denied" ? "This account can't save. Sign in as the owner." : "Could not save. Check your connection, then tick again.", true);
  }
  saving = false;
  if (ok) setStatus("Saved");
}
async function saveSettings() {
  setStatus("Saving…");
  try {
    await setDoc(doc(db, "config", "settings"), { paused: S.paused });
    setStatus("Saved");
  } catch (e) { setStatus("Could not save that change.", true); }
}

appEl.addEventListener("click", e => {
  const b = e.target.closest("button"); if (!b) return;
  const v = S.view;
  if (b.id === "prev") { S.view = shift(v, -1); return render(); }
  if (b.id === "next") { if (v < today) S.view = shift(v, 1); return render(); }
  if (b.id === "totoday") { S.view = today; return render(); }
  if (b.dataset.day) { S.view = b.dataset.day; return render(); }
  if (b.dataset.task) {
    const x = Object.assign({}, day(v)), n = +b.dataset.n, cur = +x[b.dataset.task] || 0;
    x[b.dataset.task] = cur === n ? n - 1 : n;
    S.days[v] = x; render(); touch(v);
    const f = $(b.id); if (f) f.focus(); return;
  }
  if (b.id === "sms") { const y = Object.assign({}, day(v)); y.sms = !y.sms; S.days[v] = y; render(); touch(v); $("sms").focus(); return; }
  if (b.dataset.rmlink !== undefined) {
    const y = Object.assign({}, day(v)); y.links = (y.links || []).filter((_, i) => i !== +b.dataset.rmlink);
    S.days[v] = y; render(); touch(v); return;
  }
  const id = b.dataset.pause || b.dataset.resume;
  if (id) {
    S.paused = S.paused.filter(k => k !== id);
    if (b.dataset.pause) S.paused.push(id);
    render(); saveSettings();
  }
});
appEl.addEventListener("submit", e => {
  if (e.target.id !== "linkform") return;
  e.preventDefault();
  const url = $("link-url").value.trim();
  if (!safeUrl(url)) { setStatus("The link must start with http:// or https://", true); return; }
  const v = S.view, y = Object.assign({}, day(v));
  y.links = (y.links || []).concat([{ type: $("link-type").value, label: $("link-label").value.trim(), url }]);
  S.days[v] = y; render(); touch(v);
});

async function seedOnce() {
  for (const seed of SEEDS) {
    try {
      const ref = doc(db, "days", seed.date);
      const snap = await getDoc(ref);
      if (!snap.exists()) {
        await setDoc(ref, Object.assign({}, seed, { updatedAt: new Date().toISOString() }));
        S.days[seed.date] = Object.assign({}, seed);
        await setDoc(doc(db, "reports", seed.date), daySummary(seed.date));
      }
    } catch (e) { /* seeding is a convenience; ticking still works without it */ }
  }
  render();
}

function start() {
  if (unsubs.length) return;
  $("signin").hidden = true; appEl.hidden = false; $("foot").hidden = false;
  setStatus("Loading your record…");
  render();
  const from = shift(today, -45);
  unsubs.push(onSnapshot(query(collection(db, "days"), where("date", ">=", from)), snap => {
    snap.forEach(d => { if (!dirty.has(d.id) && inflight !== d.id) S.days[d.id] = Object.assign({}, d.data()); });
    if (!saving && !dirty.size) setStatus("Saved");
    render();
    if (!S.ready) { S.ready = true; seedOnce(); }
  }, e => setStatus(e.code === "permission-denied" ? "This account can't open the tracker." : "Lost the live connection. Reload to continue.", true)));
  unsubs.push(onSnapshot(doc(db, "config", "settings"), s => {
    const x = s.exists() ? s.data() : null;
    if (x && Array.isArray(x.paused)) { S.paused = x.paused.slice(); render(); }
  }, () => {}));
}
function stop() {
  unsubs.forEach(u => u()); unsubs = []; S.ready = false;
  appEl.hidden = true; $("foot").hidden = true; $("signin").hidden = false;
}

const auth = getAuth(app);
$("signin-btn").addEventListener("click", async () => {
  try { await signInWithPopup(auth, new GoogleAuthProvider()); }
  catch (e) { $("signin-msg").textContent = "Sign-in didn't finish (" + (e.code || "error") + "). Try again."; }
});
$("signout-btn").addEventListener("click", () => signOut(auth));
onAuthStateChanged(auth, user => {
  if (user && user.email === OWNER) return start();
  stop();
  if (user) {
    $("signin-msg").textContent = "You're signed in as " + user.email + ", which can't use this tracker. Sign in with the owner account.";
    setStatus("Wrong account", true);
    signOut(auth);
  } else {
    setStatus("Signed out");
  }
});
