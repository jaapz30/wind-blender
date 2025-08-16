async function loadData() {
  try {
    const res = await fetch("data/latest.json?ts=" + Date.now(), { cache: "no-store" });
    const data = await res.json();
    let out = "<h2>Laatste update: " + data.meta.generated_at + "</h2>";
    out += "<p>Modellen: " + data.meta.models.join(", ") + "</p>";
    out += "<table border='1' cellspacing='0' cellpadding='4'><tr><th>Tijd</th><th>Gem. wind (kn)</th><th>Richting</th></tr>";
    for (let h of data.hours.slice(0, 12)) {
      let winds = [];
      for (let m of Object.keys(h)) {
        if (m !== "time") winds.push(h[m].wind);
      }
      let avg = winds.length ? (winds.reduce((a,b)=>a+b,0)/winds.length).toFixed(1) : "-";
      out += `<tr><td>${h.time}</td><td>${avg}</td><td>${winds.length ? h[Object.keys(h)[1]].dir : "-"}</td></tr>`;
    }
    out += "</table>";
    document.getElementById("forecast").innerHTML = out;
  } catch(e) {
    document.getElementById("forecast").innerHTML = "Fout bij laden.";
  }
}
loadData();