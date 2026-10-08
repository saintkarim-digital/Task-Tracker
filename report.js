// Daily report: read-only. It only reads the "reports" collection (one public summary per day).
import { db } from "./firebase.js";
import { collection, onSnapshot, query, orderBy, limit }
  from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const MON = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const GROUPS = [["jiji", "Jiji listings"], ["website", "Website off-plan designs"], ["social", "Social posts"], ["other", "Other"]];
const parse = s => { const p = s.split("-"); return new Date(+p[0], +p[1] - 1, +p[2]); };
const ymd = d => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const safeUrl = u => /^https?:\/\//i.test(u || "") ? u : "";
const today = ymd(new Date());

const box = document.getElementById("weeks"), statusEl = document.getElementById("status");

function label(r) {
  const d = parse(r.date);
  return FULL[d.getDay()] + ", " + d.getDate() + " " + MON[d.getMonth()] + " " + d.getFullYear();
}
function stat(name, value) { return '<div class="stat"><dt>' + name + '</dt><dd class="num">' + value + "</dd></div>"; }

function render(days) {
  if (!days.length) {
    box.innerHTML = '<div class="empty">No days recorded yet. The first report appears here once work is logged.</div>';
    return;
  }
  box.innerHTML = days.map(r => {
    const isToday = r.date === today;
    let h = '<section class="week"><div class="week-top"><h2>' + label(r) + "</h2>" +
      (isToday ? '<span class="chip part">Today, in progress</span>' : "") + "</div>";
    h += '<dl class="stats">' + stat("Social posts", +r.social || 0) + stat("Jiji listings", +r.jiji || 0) + stat("Off-plan designs added", +r.website || 0);
    if (+r.meqasa) h += stat("Meqasa listings", +r.meqasa);
    if (r.sms) h += stat("SMS campaign", "Sent");
    h += "</dl>";
    const links = Array.isArray(r.links) ? r.links.filter(l => safeUrl(l.url)) : [];
    GROUPS.forEach(([type, title]) => {
      const set = links.filter(l => (l.type || "other") === type || (type === "other" && !GROUPS.some(g => g[0] === l.type)));
      if (!set.length) return;
      h += "<div><h3>" + title + '</h3><ul class="linklist">' + set.map(l =>
        '<li><a href="' + esc(l.url) + '" target="_blank" rel="noopener">' + esc(l.label || l.url) + "</a></li>").join("") + "</ul></div>";
    });
    return h + "</section>";
  }).join("");
}

onSnapshot(query(collection(db, "reports"), orderBy("date", "desc"), limit(60)), snap => {
  const days = []; snap.forEach(d => days.push(d.data()));
  render(days);
  statusEl.textContent = "Up to date";
}, () => {
  statusEl.textContent = "Could not load the report. Reload to try again.";
  statusEl.className = "status bad";
});
