# data/fetch_models.py
# Haalt uurlijkse wind (10m), vlagen en richting op in KNOPEN voor Schokkerhaven
# Modellen: GFS, ICON, ECMWF/IFS, JMA (pakt wat beschikbaar is, geen key nodig)
# Schrijft naar data/latest.json in een uniforme tijdlijn.

import json, time, sys, os, urllib.request

# --- LOCATIE (Schokkerhaven) ---
LAT = 52.623
LON = 5.783

# --- VARIABELE KEUZE ---
HOURS = "wind_speed_10m,wind_gusts_10m,wind_direction_10m"
UNIT = "kn"  # knopen

# Per "kanonieke" modelnaam meerdere aliassen proberen; 1e die werkt wordt gebruikt
MODEL_ALIASES = {
    "gfs":   ["gfs"],
    "icon":  ["icon_eu", "icon_seamless", "icon"],
    "ecmwf": ["ecmwf_ifs", "ecmwf"],
    "jma":   ["jma_msm", "jma_seamless"],
    # "gem": ["gem_global"],  # optioneel, kun je aanzetten
}

def fetch_alias(alias: str):
    url = (
        "https://api.open-meteo.com/v1/forecast"
        f"?latitude={LAT}&longitude={LON}"
        f"&hourly={HOURS}"
        f"&forecast_days=3"
        f"&windspeed_unit={UNIT}"
        f"&models={alias}"
    )
    with urllib.request.urlopen(url, timeout=30) as r:
        return json.loads(r.read().decode("utf-8"))

def norm_time(ts: str) -> str:
    # Zorg voor 'Z' (UTC) aan het eind zodat de front-end het eenduidig leest
    return ts if ts.endswith("Z") else ts + "Z"

def main():
    os.makedirs("data", exist_ok=True)

    # Verzamel per kanonieke naam (gfs/icon/ecmwf/jma) precies 1 dataset
    model_data = {}   # bv. { "gfs": {...}, "icon": {...} }
    used_alias = {}   # bv. { "gfs": "gfs", "icon": "icon_eu" }
    for canon, aliases in MODEL_ALIASES.items():
        for alias in aliases:
            try:
                d = fetch_alias(alias)
                if "hourly" in d and d["hourly"].get("time"):
                    model_data[canon] = d
                    used_alias[canon] = alias
                    break
            except Exception as e:
                print(f"[warn] {canon}/{alias} failed: {e}", file=sys.stderr)

    if not model_data:
        print("No models fetched; exiting with error", file=sys.stderr)
        sys.exit(1)

    # Bouw de unie van alle tijdstempels
    all_times = set()
    for d in model_data.values():
        for ts in d["hourly"]["time"]:
            all_times.add(norm_time(ts))
    times_sorted = sorted(all_times)

    # Snelkoppelingen: per model een {norm_time: index} map
    index_maps = {}
    for canon, d in model_data.items():
        idx_map = {}
        for i, ts in enumerate(d["hourly"]["time"]):
            idx_map[norm_time(ts)] = i
        index_maps[canon] = idx_map

    out = {
        "meta": {
            "location": "Schokkerhaven",
            "lat": LAT,
            "lon": LON,
            # Laat de kanonieke namen zien die gelukt zijn (front-end gebruikt deze)
            "models": list(model_data.keys()),
            "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "aliases": used_alias  # info: welke alias is gebruikt per model
        },
        "hours": []
    }

    # Vul per uur de waarden voor elk geslaagd model
    for ts in times_sorted:
        hour = {"time": ts}
        for canon, d in model_data.items():
            i = index_maps[canon].get(ts)
            if i is None:
                continue
            hh = d["hourly"]
            try:
                wind = hh["wind_speed_10m"][i]
                gust = hh["wind_gusts_10m"][i]
                dire = hh["wind_direction_10m"][i]
            except Exception:
                continue
            if wind is None or gust is None or dire is None:
                continue
            hour[canon] = {
                "wind": round(float(wind), 1),
                "gust": round(float(gust), 1),
                "dir": int(round(float(dire)))
            }
        out["hours"].append(hour)

    with open("data/latest.json", "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)

    print("OK models:", ", ".join(out["meta"]["models"]))
    for k, v in used_alias.items():
        print(f"  using alias {k}: {v}")

if __name__ == "__main__":
    main()
