# data/fetch_models.py
# Bouwt data/latest.json met uurlijkse wind/vlagen/richting in KNOPEN voor Schokkerhaven.
# Modellen: GFS, ICON, ECMWF/IFS, JMA (pakt wat beschikbaar is, zonder API-key).
# Output is één uniforme tijdlijn die je front-end kan mixen en scoren.

import json, time, sys, os, urllib.request

# --- LOCATIE ---
LAT = 52.623   # Schokkerhaven
LON = 5.783

# --- VARIABELE KEUZE ---
HOURS = "wind_speed_10m,wind_gusts_10m,wind_direction_10m"
UNIT = "kn"  # knopen

# Aliassen per model; we gebruiken de eerste die werkt voor jouw locatie
MODEL_ALIASES = {
    "gfs":   ["gfs"],
    "icon":  ["icon_eu", "icon_seamless", "icon"],
    "ecmwf": ["ecmwf_ifs", "ecmwf"],
    "jma":   ["jma_msm", "jma_seamless"],
}

def fetch_alias(alias: str):
    url = (
        "https://api.open-meteo.com/v1/forecast"
        f"?latitude={LAT}&longitude={LON}"
        f"&hourly={HOURS}"
        f"&forecast_days=3"               # tot 72 uur, front-end pakt toch de komende 8/24
        f"&wind_speed_unit={UNIT}"        # LET OP: underscore, levert knopen
        f"&models={alias}"
    )
    with urllib.request.urlopen(url, timeout=30) as r:
        return json.loads(r.read().decode("utf-8"))

def norm_time(ts: str) -> str:
    # Zorg voor 'Z' (UTC) aan het eind
    return ts if ts.endswith("Z") else ts + "Z"

def main():
    os.makedirs("data", exist_ok=True)

    model_data = {}   # {"gfs": {...}, "icon": {...}, ...}
    used_alias = {}
    for canon, aliases in MODEL_ALIASES.items():
        for alias in aliases:
            try:
                d = fetch_alias(alias)
                if d.get("hourly", {}).get("time"):
                    model_data[canon] = d
                    used_alias[canon] = alias
                    break
            except Exception as e:
                print(f"[warn] {canon}/{alias} failed: {e}", file=sys.stderr)

    if not model_data:
        print("No models fetched; exiting with error", file=sys.stderr)
        sys.exit(1)

    # Unie van alle uurtijden
    all_times = set()
    for d in model_data.values():
        for ts in d["hourly"]["time"]:
            all_times.add(norm_time(ts))
    times_sorted = sorted(all_times)

    # Index per model {timestamp->index}
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
            "models": list(model_data.keys()),  # kan bv. ["gfs","icon","ecmwf","jma"] zijn
            "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "aliases": used_alias
        },
        "hours": []
    }

    # Schrijf alle uren (tot 72) zodat front-end 8/24 eruit kan kiezen
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
                "wind": round(float(wind), 1),  # knopen
                "gust": round(float(gust), 1),  # knopen
                "dir": int(round(float(dire)))  # graden: 0=N,90=O,180=Z,270=W
            }
        out["hours"].append(hour)

    with open("data/latest.json", "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)

    print("OK models:", ", ".join(out["meta"]["models"]))
    for k, v in used_alias.items():
        print(f"  using alias {k}: {v}")

if __name__ == "__main__":
    main()
