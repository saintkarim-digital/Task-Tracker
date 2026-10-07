// Weekly report: read-only. It only reads the "weeks" collection (weekly totals and links).
import { db } from "./firebase.js";
import { collection, onSnapshot, query, orderBy, limit }
  from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const GROUPS = [["jiji", "Jiji listings"], ["website", "Website off-plan designs"], ["social", "Social posts"], ["other", "Other"]];
const parse = s => { const p = s.split("-"); return new Date(+p[0], +p[1] - 1, +p[2]); };
const ymd = d => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const safeUrl = u => /^https?:\/\//i.test(u || "") ? u : "";
const today = ymd(new Date());

const box = document.getElementById("weeks"), statusEl = document.getElementById("status");

function range(w) {
  const a = parse(w.weekStart), b = parse(w.weekEnd);
  const left = a.getDate() + (a.getMonth() === b.getMonth() ? "" : " " + MON[a.getMonth()]);
  return left + " to " + b.getDate() + " " + MON[b.getMonth()] + " " + b.getFullYear();
}
function stat(label, value) { return '<div class="stat"><dt>' + label + "</dt><dd class=\"num\">" + value + "</dd></div>"; }

function render(weeks) {
  if (!weeks.length) {
    box.innerHTML = '<div class="empty">No weeks recorded yet. The first report appears here once work is logged.</div>';
    return;
  }
  box.innerHTML = weeks.map(w => {
    const current = today >= w.weekStart && today <= w.weekEnd;
    let h = '<section class="week"><div class="week-top"><h2>Week of ' + range(w) + "</h2>" +
      (current ? '<span class="chip part">In progress</span>' : '<span class="chip done">Complete</span>') + "</div>";
    h += '<dl class="stats">' + stat("Social posts", +w.social || 0) + stat("Jiji listings", +w.jiji || 0) + stat("Off-plan designs added", +w.website || 0);
    if (+w.meqasa) h += stat("Meqasa listings", +w.meqasa);
    h += stat("SMS campaign", w.sms ? "Sent" : (current ? "Due" : "Not sent")) + "</dl>";
    const links = Array.isArray(w.links) ? w.links.filter(l => safeUrl(l.url)) : [];
    GROUPS.forEach(([type, title]) => {
      const set = links.filter(l => (l.type || "other") === type || (type === "other" && !GROUPS.some(g => g[0] === l.type)));
      if (!set.length) return;
      h += "<div><h3>" + title + '</h3><ul class="linklist">' + set.map(l =>
        '<li><a href="' + esc(l.url) + '" target="_blank" rel="noopener">' + esc(l.label || l.url) + "</a></li>").join("") + "</ul></div>";
    });
    return h + "</section>";
  }).join("");
}

onSnapshot(query(collection(db, "weeks"), orderBy("weekStart", "desc"), limit(26)), snap => {
  const weeks = []; snap.forEach(d => weeks.push(d.data()));
  render(weeks);
  statusEl.textContent = "Up to date";
}, () => {
  statusEl.textContent = "Could not load the report. Reload to try again.";
  statusEl.className = "status bad";
});
