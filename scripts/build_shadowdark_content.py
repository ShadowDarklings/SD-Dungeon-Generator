from __future__ import annotations

import concurrent.futures as futures
import datetime as dt
import json
import re
import urllib.request
from pathlib import Path
from typing import Any

BASE_URL = "https://shadowdark.dnddeutsch.de/api"
OUTPUT_PATH = Path(__file__).resolve().parents[1] / "S3_content" / "data" / "shadowdark-content.json"
MONSTER_TABLES_DIR = Path(__file__).resolve().parents[1] / "S3_content"
CATEGORY_ENDPOINTS = {
    "monsters": "monster",
    "gear": "gear",
    "armor": "armor",
    "weapons": "weapon",
    "magicItems": "magic-item",
}
SAFE_SLUG = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")


def fetch_json(url: str) -> Any:
    with urllib.request.urlopen(url, timeout=30) as response:
        payload = response.read().decode("utf-8")
    return json.loads(payload)


def coerce_sources(source: Any) -> list[str]:
    if source is None:
        return []
    if isinstance(source, list):
        return [str(value) for value in source if value is not None]
    return [str(source)]


def extract_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, dict):
        for key in ("en", "de", "string", "text", "value"):
            if value.get(key):
                return extract_text(value[key])
        return ""
    if isinstance(value, list):
        pieces = [extract_text(item) for item in value]
        return " ".join(piece for piece in pieces if piece)
    return str(value).strip()


def extract_number(value: Any, default: int = 0) -> int:
    if value is None:
        return default
    if isinstance(value, (int, float)):
        return int(value)
    match = re.search(r"-?\d+", str(value))
    return int(match.group(0)) if match else default


def normalize_monster_name(name: str) -> str:
    lowered = re.sub(r"[^a-z0-9 ]", " ", name.lower())
    lowered = re.sub(r"\bthe\b", " ", lowered)
    tokens = sorted(part for part in lowered.split() if part)
    return " ".join(tokens)


def load_monster_stat_lookup() -> dict[str, dict[str, str]]:
    lookup: dict[str, dict[str, str]] = {}
    for path in sorted(MONSTER_TABLES_DIR.glob("monsters-*.json")):
        entries = json.loads(path.read_text(encoding="utf-8"))
        for entry in entries:
            if not isinstance(entry, dict):
                continue
            name = str(entry.get("Monster Name") or "").strip()
            if not name:
                continue
            stats = {
                "S": str(entry.get("**S**") or ""),
                "D": str(entry.get("**D**") or ""),
                "C": str(entry.get("**C**") or ""),
                "I": str(entry.get("**I**") or ""),
                "W": str(entry.get("**W**") or ""),
                "Ch": str(entry.get("**CH**") or ""),
                "AL": str(entry.get("**AL**") or ""),
            }
            candidate_names = {name}
            if "," in name:
                suffix = name.split(",", 1)[1].strip()
                if suffix:
                    candidate_names.add(suffix)
            for candidate in candidate_names:
                lookup.setdefault(normalize_monster_name(candidate), stats)
    return lookup


def fetch_detail_map(category: str) -> list[dict[str, Any]]:
    listing = fetch_json(f"{BASE_URL}/{category}/")
    if not isinstance(listing, dict):
        raise RuntimeError(f"Unexpected listing payload for {category}: {type(listing)!r}")
    entries = []
    for slug, url in listing.items():
        if not isinstance(url, str):
            continue
        if not SAFE_SLUG.fullmatch(str(slug)):
            continue
        if not url.startswith(f"{BASE_URL}/{category}/"):
            continue
        entries.append({"slug": slug, "url": f"{url}/json"})
    return entries


def fetch_all_details(category: str) -> list[dict[str, Any]]:
    entries = fetch_detail_map(category)
    results: list[dict[str, Any]] = []
    with futures.ThreadPoolExecutor(max_workers=12) as pool:
        future_map = {pool.submit(fetch_json, entry["url"]): entry for entry in entries}
        for future in futures.as_completed(future_map):
            entry = future_map[future]
            try:
                data = future.result()
            except Exception as exc:  # pragma: no cover - one-off data generation helper
                raise RuntimeError(f"Failed to fetch {category}:{entry['slug']}") from exc
            results.append({"slug": entry["slug"], "data": data})
    results.sort(key=lambda item: item["slug"])
    return results


def normalize_monster(item: dict[str, Any], stat_lookup: dict[str, dict[str, str]]) -> dict[str, Any]:
    data = item["data"]
    name = extract_text(data.get("name")) or item["slug"].replace("-", " ").title()
    ac = data.get("ac")
    if isinstance(ac, dict):
        ac_value = ac.get("numeric") or ac.get("string") or ac.get("type")
    else:
        ac_value = ac
    stats = stat_lookup.get(normalize_monster_name(name), {})
    return {
        "slug": item["slug"],
        "name": name,
        "level": extract_number(data.get("lv") or data.get("level"), 1),
        "ac": extract_number(ac_value, 0) or None,
        "hp": extract_number(data.get("hp"), 0) or None,
        "attack": extract_text(data.get("atk")),
        "movement": extract_text(data.get("mv")),
        "S": stats.get("S", ""),
        "D": stats.get("D", ""),
        "C": stats.get("C", ""),
        "I": stats.get("I", ""),
        "W": stats.get("W", ""),
        "Ch": stats.get("Ch", ""),
        "AL": stats.get("AL", ""),
        "talents": [extract_text(talent) for talent in data.get("talents", []) if extract_text(talent)],
        "tags": [str(tag) for tag in data.get("tags", []) if tag is not None],
        "source": coerce_sources(data.get("source")),
        "page": data.get("page"),
    }


def normalize_gear(item: dict[str, Any], kind: str) -> dict[str, Any]:
    data = item["data"]
    name = extract_text(data.get("name")) or item["slug"].replace("-", " ").title()
    description = extract_text(data.get("description"))
    benefit = extract_text(data.get("benefit"))
    body = " ".join(part for part in [description, benefit] if part)
    slots = extract_number(data.get("slots") or data.get("slot") or data.get("gearSlots"), 0)
    if slots <= 0:
        slots = 1
    cost = extract_number(data.get("cost") or data.get("price") or data.get("gp"), 0)
    bonus_slots = 0
    if kind == "magic-item":
        cost = 0
        match = re.search(r"hold up to (\d+) gear slots", body, re.IGNORECASE)
        if match:
            bonus_slots = int(match.group(1))
        if name.lower() == "bag of holding":
            bonus_slots = 10
            cost = 0
    return {
        "slug": item["slug"],
        "kind": kind,
        "name": name,
        "slots": slots,
        "bonusSlots": bonus_slots,
        "cost": cost,
        "description": body,
        "priceless": kind == "magic-item",
        "source": coerce_sources(data.get("source")),
        "page": data.get("page"),
        "tags": [str(tag) for tag in data.get("tags", []) if tag is not None],
    }


def build_snapshot() -> dict[str, Any]:
    stat_lookup = load_monster_stat_lookup()
    monsters = [normalize_monster(item, stat_lookup) for item in fetch_all_details("monster")]
    loot = {
        "gear": [normalize_gear(item, "gear") for item in fetch_all_details("gear")],
        "armor": [normalize_gear(item, "armor") for item in fetch_all_details("armor")],
        "weapons": [normalize_gear(item, "weapon") for item in fetch_all_details("weapon")],
        "magicItems": [normalize_gear(item, "magic-item") for item in fetch_all_details("magic-item")],
    }
    return {
        "generatedAt": dt.datetime.now(dt.timezone.utc).isoformat(),
        "source": BASE_URL,
        "monsters": monsters,
        "loot": loot,
    }


def main() -> None:
    snapshot = build_snapshot()
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(snapshot, indent=2, ensure_ascii=True), encoding="utf-8")
    print(f"Wrote {OUTPUT_PATH}")
    print(f"Monsters: {len(snapshot['monsters'])}")
    print(
        "Loot: "
        + ", ".join(
            f"{kind}={len(values)}" for kind, values in snapshot["loot"].items()
        )
    )


if __name__ == "__main__":
    main()
