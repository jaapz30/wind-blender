// ------------------------------------------------------
// Wind Blender — duidelijke daggrafiek + 8u overzicht
// - Leest alleen data/latest.json (statisch)
// - Haalt bij elk openen een verse versie (cache-busting)
// - Betrouwbaarheid: hoger bij lage spreiding + meer modellen
// - Windrichting als woorden (Noord, Oost, Zuidwest, ...)
// ------------------------------------------------------

const JSON_PATH = "data/latest.json";

// UI refs
const modelsBadge = document.getElementById("modelsBadge");
const updatedBadge = document.getElementById("updatedBadge");
const reliabilityBadge = document.getElementById("reliabilityBadge");
const kpiWind = document.getElementById("kpiWind");
const kpiDir = document.getElementById("kpiDir");
const kpiGustiness = document.getElementById("kpiGustiness");
const fileInput = document.getElementById("fileInput");
const resetBtn = document.getElementById("resetBtn");

let dayChart;

// ---------- helpers ----------
async function loadJSON(path) {
  const url = path + (path.includes("?") ? "&" : "?") + "ts=" + Date.now();
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("Kan JSON niet laden: " + path);
  return await res.json();
}

function quantiles(arr, q) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a,b)=>a-b);
  const pos = (s.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  return s[base+1] !== undefined ? s[base] + rest * (s[base+1] - s[base]) : s[base];
}

function dirToWord(deg){
  if (deg == null) return "—";
  // 8 windstreken in woorden
  const words = ["Noord","Noordoost","Oost","Zuidoost","Zuid","Zuidwest","West","Noordwest"];
  return words[Math.round(deg / 45) % 8];
}

function computeBlend(hour, modelKeys) {
  const winds=[], gusts=[], dirs=[];
  modelKeys.forEach(m=>{
    if (hour[m]) {
      const v = hour[m];
      if (typeof v.wind === "number") winds.push(v.wind);
      if (typeof v.gust === "number") gusts.push(v.gust);
      if (typeof v.dir  === "number") dirs.push(v.dir);
    }
  });
  const mean = a => a.length ? a.reduce((x,y)=>x+y,0)/a.length : 0;
  const windBlend = mean(winds);
  const gustBlend = mean(gusts);

  // cirkelgemiddelde richting
  const dirBlend = (() => {
    if (!dirs.length) return null;
    const rad = dirs.map(d=>d*Math.PI/180);
    const x = rad.reduce((a,b)=>a+Math.cos(b),0)/dirs.length;
    const y = rad.reduce((a,b)=>a+Math.sin(b),0)/dirs.length;
    const ang = Math.atan2(y,x)*180/Math.PI;
    return (ang+360)%360;
  })();

  // spreiding + betrouwbaarheid
  const q25 = quantiles(winds, 0.25);
  const q75 = quantiles(winds, 0.75);
  const iqr = q75 - q25;
  const range = winds.length ? Math.max(...winds) - Math.min(...winds) : 0;
  const count = winds.length;
  const spreadPenalty = Math.min(1, (iqr/10) + (range/20)); // lager bij meer spreiding
  const countBoost = Math.min(1, (count/4));                 // 4+ modellen ≈ max
  const reliability = Math.round(100 * Math.max(0, 0.65*(1 - spreadPenalty) + 0.35*countBoost));

  const gustiness = Math.round(100 * Math.max(0, (gustBlend - windBlend) / Math.max(windBlend, 1)));

  return { windBlend, gustBlend, dirBlend, reliability, gustiness, iqr, range };
}

// eerstvolgende uur >= nu
function nextHourIndex(hours){
  const now = Date.now();
  for (let i=0;i<hours.length;i++){
    if (new Date(hours[i].time).getTime() >= now) return i;
  }
  return 0;
}

// filter: alleen vandaag (lokale tijd)
function onlyToday(hours){
  const today = new Date();
  const y=today.getFullYear(), m=today.getMonth(), d=today.getDate();
  return hours.filter(h=>{
    const t = new Date(h.time);
    return t.getFullYear()===y && t.getMonth()===m && t.getDate()===d;
  });
}

// ---------- rendering ----------
function renderNext8(data, modelKeys){
  const i0 = nextHourIndex(data.hours);
  const slice = data.hours.slice(i0, i0+8);
  // KPI's
  if (slice.length){
    const first = computeBlend(slice[0], modelKeys);
    kpiWind.textContent = `${first.windBlend.toFixed(1)} kn`;
    kpiDir.textContent = `${dirToWord(first.dirBlend)} (${Math.round(first.dirBlend)}°)`;
    kpiGustiness.textContent = `${first.gustiness}%`;
  } else {
    kpiWind.textContent = "— kn";
    kpiDir.textContent = "—";
    kpiGustiness.textContent = "—%";
  }
  // betrouwbaarheid gemiddelde
  const r = slice.map(h=>computeBlend(h, modelKeys).reliability);
  const avgRel = r.length ? Math.round(r.reduce((a,b)=>a+b,0)/r.length) : 0;
  reliabilityBadge.textContent = `Betrouwbaarheid (8u): ${avgRel}%`;

  // tabel
  const rows = slice.map(h=>{
    const t = new Date(h.time);
    const r = computeBlend(h, modelKeys);
    return `<tr>
      <td>${t.toLocaleString([], {hour:"2-digit", minute:"2-digit"})}</td>
      <td>${r.windBlend.toFixed(1)} kn</td>
      <td>${r.gustBlend.toFixed(1)} kn</td>
      <td>${dirToWord(r.dirBlend)} (${Math.round(r.dirBlend)}°)</td>
      <td>${r.reliability}%</td>
    </tr>`;
  }).join("");
  document.getElementById("nextTable").innerHTML = `
    <table>
      <thead>
        <tr><th>Tijd</th><th>Wind</th><th>Vlagen</th><th>Richting</th><th>Betrouwb.</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function renderDayChart(data, modelKeys){
  const today = onlyToday(data.hours);
  const labels = today.map(h => new Date(h.time).toLocaleTimeString([], {hour:"2-digit"}));
  const wind = today.map(h => computeBlend(h, modelKeys).windBlend);
  const gust = today.map(h => computeBlend(h, modelKeys).gustBlend);

  if (dayChart) dayChart.destroy();
  const ctx = document.getElementById("dayChart").getContext("2d");
  dayChart = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        { label: "Wind (kn)", data: wind, fill:false, tension:0.25 },
        { label: "Vlagen (kn)", data: gust, borderDash:[6,4], fill:false, tension:0.25 }
      ]
    },
    options: {
      responsive:true,
      interaction:{ mode:"index", intersect:false },
      plugins:{
        legend:{ labels:{ color:"#dfe6ff" } },
        tooltip:{ callbacks:{
          afterLabel: (ctx)=>{
            const i = ctx.dataIndex;
            const r = computeBlend(today[i], modelKeys);
            return `Richting: ${dirToWord(r.dirBlend)} (${Math.round(r.dirBlend)}°)  •  Betrouwb.: ${r.reliability}%`;
          }
        }}
      },
      scales:{
        x:{ ticks:{ color:"#9aa7c4" }, grid:{ color:"#1d2a46" } },
        y:{ ticks:{ color:"#9aa7c4" }, grid:{ color:"#1d2a46" }, title:{ display:true, text:"kn" } }
      }
    }
  });
}

// ---------- load ----------
async function loadAndRender(path=JSON_PATH){
  const data = await loadJSON(path);
  const modelKeys = data.meta?.models ?? Object.keys(data.hours?.[0] ?? {}).filter(k=>k!=="time");
  modelsBadge.textContent = `Modellen: ${modelKeys.join(", ")}`;
  updatedBadge.textContent = data.meta?.generated_at ? `Snapshot: ${new Date(data.meta.generated_at).toLocaleString()}` : "Snapshot: onbekend";
  renderDayChart(data, modelKeys);
  renderNext8(data, modelKeys);
}

// upload eigen JSON
fileInput.addEventListener("change", async (e)=>{
  const f = e.target.files?.[0];
  if (!f) return;
  const text = await f.text();
  const json = JSON.parse(text);
  const blob = new Blob([JSON.stringify(json)], {type:"application/json"});
  const url = URL.createObjectURL(blob);
  loadAndRender(url);
});

// reset
resetBtn.addEventListener("click", ()=> loadAndRender(JSON_PATH));

// start
loadAndRender();
