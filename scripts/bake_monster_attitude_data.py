from __future__ import annotations

import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CONTENT_DIR = ROOT / "S3_content"
SOURCE = CONTENT_DIR / "data" / "monster-names-alphabetical.txt"


def normalize_name(value: str) -> str:
    text = re.sub(r"[^a-z0-9 ]", " ", value.lower())
    text = re.sub(r"\bthe\b", " ", text)
    return " ".join(part for part in text.split() if part)


def candidate_keys(name: str) -> set[str]:
    keys = {normalize_name(name)}
    if "," in name:
        parts = [part.strip() for part in name.split(",", 1)]
        if all(parts):
            keys.add(normalize_name(f"{parts[1]} {parts[0]}"))
            keys.add(normalize_name(parts[1]))
    return {key for key in keys if key}


def parse_source() -> dict[str, dict[str, object]]:
    records: dict[str, dict[str, object]] = {}
    lines = SOURCE.read_text(encoding="utf-8").splitlines()
    index = 0
    while index < len(lines):
        name = lines[index].strip()
        index += 1
        if not name:
            continue
        tags: list[str] = []
        diplomacy = "N"
        while index < len(lines) and lines[index].strip():
            line = lines[index].strip()
            if line.lower().startswith("tags:"):
                tags = [tag.strip() for tag in line.split(":", 1)[1].split(",") if tag.strip()]
            elif line.lower().startswith("diplomacy:"):
                value = line.split(":", 1)[1].strip()
                diplomacy = "Y" if value.lower().startswith("y") else "N"
            index += 1
        record = {"tags": tags, "diplomacy": diplomacy}
        for key in candidate_keys(name):
            records[key] = record
    return records


def main() -> None:
    records = parse_source()
    updated = 0
    matched = 0
    for path in sorted(CONTENT_DIR.glob("monsters-*.json")):
        data = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(data, list):
            continue
        changed = False
        for monster in data:
            if not isinstance(monster, dict):
                continue
            name = str(monster.get("Monster Name") or monster.get("name") or "").strip()
            record = next((records[key] for key in candidate_keys(name) if key in records), None)
            if record:
                matched += 1
                if record["tags"]:
                    monster["tags"] = record["tags"]
                monster["diplomacy"] = record["diplomacy"]
                changed = True
            elif "diplomacy" not in monster:
                monster["diplomacy"] = "N"
                changed = True
        if changed:
            path.write_text(json.dumps(data, indent=4, ensure_ascii=True), encoding="utf-8")
            updated += 1
    print(f"Updated {updated} monster tables; matched {matched} monster records.")


if __name__ == "__main__":
    main()
