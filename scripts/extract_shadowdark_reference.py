from __future__ import annotations

import argparse
import json
import re
from collections import defaultdict
from pathlib import Path
from typing import Iterable

from pypdf import PdfReader


PDF_PATH = Path(
    "c:/Users/Dungeon Master/Desktop/Coding stuff/GCSDE/506/SD-website/Shadowdark_RPG_-_V4-9-1.pdf"
)
MONSTER_OUTPUT_DIR = Path(__file__).resolve().parents[1] / "S3_content"
SPELL_OUTPUT_DIR = MONSTER_OUTPUT_DIR / "spells"
MONSTER_START_PAGE_INDEX = 197
SPELL_START_PAGE_INDEX = 57
SPELL_END_PAGE_INDEX = 77
STAT_KEYS = ("AC", "HP", "ATK", "MV", "S", "D", "C", "I", "W", "CH", "AL", "LV")
MIN_PAGE_HEADERS = {
    "MONSTER STATISTICS",
    "MONSTERS",
    "ROLLING RANDOM MONSTERS",
    "SPECIAL ABILITIES",
    "SPECIAL TRAITS",
    "SPELLS",
}

DAMAGE_PATTERN = re.compile(
    r"\b(?:\d+d\d+(?:\s*(?:\+\s*\d+|x\s*\d+|\*\s*\d+))*|d\d+)\b",
    re.IGNORECASE,
)


def normalize_spaces(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def slugify(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")


def normalize_damage_expression(expression: str) -> str:
    compact = normalize_spaces(expression).lower()
    if compact.startswith("d"):
        compact = f"1{compact}"
    compact = compact.replace(" ", "")
    compact = compact.replace("*", "x")
    return compact


def dedupe_dicts(items: Iterable[dict]) -> list[dict]:
    seen = set()
    output = []
    for item in items:
        key = json.dumps(item, sort_keys=True, ensure_ascii=True)
        if key in seen:
            continue
        seen.add(key)
        output.append(item)
    return output


def extract_damage_references(text: str) -> list[dict[str, str]]:
    normalized = normalize_spaces(text)
    if not normalized:
        return []

    references = []
    sentence_parts = re.split(r"(?<=[.!?])\s+", normalized)
    for index, sentence in enumerate(sentence_parts):
        matches = list(DAMAGE_PATTERN.finditer(sentence))
        if not matches:
            continue
        previous_sentence = sentence_parts[index - 1].lower() if index > 0 else ""
        for match in matches:
            expression = normalize_damage_expression(match.group(0))
            display = expression
            lower_sentence = sentence.lower()
            if ("instantly dies" in lower_sentence or "instantly dies" in previous_sentence) and "damage" in lower_sentence:
                display = f"Death / {expression}"
            references.append(
                {
                    "expression": expression,
                    "display": display,
                    "context": sentence,
                }
            )
    return dedupe_dicts(references)


def is_monster_name_line(line: str) -> bool:
    if len(line) < 2 or len(line) > 42:
        return False
    if line != line.upper():
        return False
    if any(ch.isdigit() for ch in line):
        return False
    if not re.match(r"^[A-Z0-9,'()\- /]+$", line):
        return False
    if re.search(r"\b(AC|HP|ATK|MV|AL|LV|CH|Ch)\b", line):
        return False
    return line not in MIN_PAGE_HEADERS


def parse_statline(statline: str) -> dict[str, str]:
    statline = re.sub(r"(HP\s+[^,]+?)\s+(ATK\s+)", r"\1, \2", statline)
    parsed: dict[str, str] = {key: "" for key in STAT_KEYS}
    for segment in [normalize_spaces(piece) for piece in statline.split(",")]:
        if not segment:
            continue
        match = re.match(r"^(AC|HP|ATK|MV|S|D|C|I|W|Ch|CH|AL|LV)\s+(.+)$", segment)
        if not match:
            for back_key in ("LV", "AL", "CH", "W", "I", "C", "D", "S", "MV", "ATK", "HP", "AC"):
                if parsed[back_key]:
                    parsed[back_key] = f"{parsed[back_key]} {segment}".strip()
                    break
            continue
        key = match.group(1).upper()
        parsed[key] = match.group(2).strip()
    return parsed


def parse_abilities(ability_lines: list[str]) -> dict[str, str]:
    abilities: dict[str, str] = {}
    current_name: str | None = None
    current_text: list[str] = []

    def is_ability_heading(name: str, tail: str) -> bool:
        normalized_name = normalize_spaces(name)
        if not normalized_name:
            return False
        lower_name = normalized_name.lower()
        if lower_name in {"focus", "self", "close", "near", "far", "touch", "instant"}:
            return False
        if current_name and not tail:
            if re.search(r"\d", normalized_name):
                return False
            if "(" not in normalized_name and len(normalized_name.split()) > 4:
                return False
            for word in normalized_name.split():
                if word.lower() in {"of", "the", "and", "to", "in", "on", "at", "for", "or"}:
                    continue
                if not word[:1].isupper():
                    return False
        return True

    for raw in ability_lines:
        line = normalize_spaces(raw)
        if not line or re.fullmatch(r"\d{1,3}", line):
            continue
        match = re.match(r"^([A-Z][A-Za-z0-9'()/\- +,]+?)\.\s*(.*)$", line)
        if match and not match.group(1).startswith("DC ") and is_ability_heading(match.group(1), match.group(2)):
            if current_name:
                abilities[f"**{current_name}**"] = normalize_spaces(" ".join(current_text))
            current_name = normalize_spaces(match.group(1))
            tail = match.group(2).strip()
            current_text = [tail] if tail else []
        elif current_name:
            current_text.append(line)
    if current_name:
        abilities[f"**{current_name}**"] = normalize_spaces(" ".join(current_text))
    return abilities


def extract_all_monsters(pdf_path: Path) -> list[dict]:
    reader = PdfReader(str(pdf_path))
    lines: list[str] = []
    for page in reader.pages[MONSTER_START_PAGE_INDEX:]:
        text = page.extract_text() or ""
        lines.extend([line.strip() for line in text.splitlines() if line.strip()])

    monsters: list[dict] = []
    index = 0
    while index < len(lines):
        line = lines[index]
        if not is_monster_name_line(line):
            index += 1
            continue

        name = normalize_spaces(line.title())
        index += 1
        chunk: list[str] = []
        while index < len(lines) and not is_monster_name_line(lines[index]):
            chunk.append(lines[index])
            index += 1

        stat_index = next((i for i, value in enumerate(chunk) if value.startswith("AC ")), -1)
        if stat_index == -1:
            continue

        stat_parts = [chunk[stat_index]]
        chunk_index = stat_index + 1
        while chunk_index < len(chunk) and " LV " not in f" {normalize_spaces(' '.join(stat_parts))} ":
            stat_parts.append(chunk[chunk_index])
            chunk_index += 1
        statline = normalize_spaces(" ".join(stat_parts))
        stats = parse_statline(statline)
        level_match = re.search(r"\bLV\s+(\d+)\b", statline)
        if not level_match:
            continue

        level = int(level_match.group(1))
        abilities = parse_abilities(chunk[chunk_index:])
        ability_details = [
            {
                "name": name_key.replace("*", ""),
                "text": text,
                "damage": extract_damage_references(text),
            }
            for name_key, text in abilities.items()
        ]
        attack_text = stats["ATK"]
        monsters.append(
            {
                "slug": slugify(name),
                "name": name,
                "level": level,
                "ac": stats["AC"],
                "hp": stats["HP"],
                "attack": attack_text,
                "movement": stats["MV"],
                "stats": {
                    "STR": stats["S"],
                    "DEX": stats["D"],
                    "CON": stats["C"],
                    "INT": stats["I"],
                    "WIS": stats["W"],
                    "CHA": stats["CH"],
                },
                "alignment": stats["AL"],
                "damage": extract_damage_references(attack_text),
                "abilityDetails": ability_details,
                "Monster Name": name,
                "**AC**": stats["AC"],
                "**HP**": stats["HP"],
                "**ATK**": attack_text,
                "**MV**": stats["MV"],
                "**S**": stats["S"],
                "**D**": stats["D"],
                "**C**": stats["C"],
                "**I**": stats["I"],
                "**W**": stats["W"],
                "**CH**": stats["CH"],
                "**AL**": stats["AL"],
                "**LV**": str(level),
                "abilities": abilities,
            }
        )

    return monsters


def bucket_monsters(monsters: list[dict]) -> dict[int, list[dict]]:
    buckets = defaultdict(list)
    for monster in monsters:
        level = int(monster["level"])
        bucket = 10 if level >= 10 else level
        buckets[bucket].append(monster)
    return buckets


def is_spell_name_line(line: str) -> bool:
    stripped = normalize_spaces(line)
    if not stripped or stripped in MIN_PAGE_HEADERS:
        return False
    if re.fullmatch(r"\d{1,3}", stripped):
        return False
    if stripped != stripped.upper():
        return False
    if len(stripped) > 42:
        return False
    if stripped.startswith(("TIER ", "DURATION:", "RANGE:")):
        return False
    return bool(re.fullmatch(r"[A-Z0-9,'()\- /]+", stripped))


def cleaned_spell_lines(reader: PdfReader) -> list[str]:
    lines: list[str] = []
    for page in reader.pages[SPELL_START_PAGE_INDEX:SPELL_END_PAGE_INDEX]:
        text = page.extract_text() or ""
        page_lines = [line.strip() for line in text.splitlines()]
        for line in page_lines:
            normalized = normalize_spaces(line)
            if normalized in MIN_PAGE_HEADERS:
                continue
            if re.fullmatch(r"\d{1,3}", normalized):
                continue
            lines.append(line.strip())
    return lines


def build_paragraphs(lines: list[str]) -> list[str]:
    paragraphs: list[str] = []
    current: list[str] = []

    def flush() -> None:
        if not current:
            return
        paragraphs.append(
            normalize_spaces(
                " ".join(current)
                .replace("spell’s", "spell's")
                .replace("gods ", "god's ")
            )
        )
        current.clear()

    for line in lines:
        text = normalize_spaces(line)
        if not text:
            flush()
            continue
        current.append(text)
        if re.search(r"[.!?]$", text):
            flush()
    flush()
    return paragraphs


def parse_spell_meta(meta_line: str) -> tuple[int, list[str]]:
    match = re.match(r"^Tier\s+(\d+),\s*(.+)$", normalize_spaces(meta_line), re.IGNORECASE)
    if not match:
        raise ValueError(f"Unexpected spell tier line: {meta_line!r}")
    tier = int(match.group(1))
    classes = [normalize_spaces(piece).lower() for piece in match.group(2).split(",") if normalize_spaces(piece)]
    return tier, classes


def normalize_range_band(range_value: str) -> str:
    normalized = normalize_spaces(range_value).lower()
    for key in ("self", "close", "near", "far"):
        if normalized.startswith(key):
            return key
    return normalized


def extract_spells(pdf_path: Path) -> list[dict]:
    reader = PdfReader(str(pdf_path))
    lines = cleaned_spell_lines(reader)

    entries: list[dict] = []
    index = 0
    while index < len(lines):
        line = normalize_spaces(lines[index])
        if not is_spell_name_line(line):
            index += 1
            continue

        name = normalize_spaces(line.title())
        index += 1
        chunk: list[str] = []
        while index < len(lines) and not is_spell_name_line(normalize_spaces(lines[index])):
            chunk.append(lines[index])
            index += 1

        chunk = [line for line in chunk if line is not None]
        if len(chunk) < 3:
            continue

        meta_index = next((i for i, value in enumerate(chunk) if normalize_spaces(value).lower().startswith("tier ")), -1)
        duration_index = next((i for i, value in enumerate(chunk) if normalize_spaces(value).lower().startswith("duration:")), -1)
        range_index = next((i for i, value in enumerate(chunk) if normalize_spaces(value).lower().startswith("range:")), -1)
        if meta_index == -1 or duration_index == -1 or range_index == -1:
            continue

        tier, classes = parse_spell_meta(chunk[meta_index])
        duration = normalize_spaces(chunk[duration_index].split(":", 1)[1])
        range_value = normalize_spaces(chunk[range_index].split(":", 1)[1])
        body_lines = [
            value
            for offset, value in enumerate(chunk)
            if offset > range_index
        ]
        paragraphs = build_paragraphs(body_lines)
        body_text = "\n\n".join(paragraphs)
        damage = extract_damage_references(body_text)
        entries.append(
            {
                "slug": slugify(name),
                "name": name,
                "tier": tier,
                "classes": classes,
                "duration": duration,
                "range": range_value,
                "rangeBand": normalize_range_band(range_value),
                "description": body_text,
                "paragraphs": paragraphs,
                "damage": damage,
            }
        )

    return entries


def write_monster_files(monsters: list[dict], output_dir: Path) -> list[Path]:
    output_dir.mkdir(parents=True, exist_ok=True)
    bucketed = bucket_monsters(monsters)
    written = []
    for bucket in range(3, 11):
        values = sorted(bucketed.get(bucket, []), key=lambda item: (int(item["level"]), item["name"]))
        output_path = output_dir / f"monsters-{bucket}.json"
        output_path.write_text(json.dumps(values, indent=2, ensure_ascii=False), encoding="utf-8")
        written.append(output_path)
    return written


def write_spell_files(spells: list[dict], output_dir: Path) -> list[Path]:
    output_dir.mkdir(parents=True, exist_ok=True)
    written = []
    for tier in range(1, 6):
        values = sorted(
            [spell for spell in spells if int(spell["tier"]) == tier],
            key=lambda item: item["name"],
        )
        output_path = output_dir / f"tier-{tier}.json"
        output_path.write_text(json.dumps(values, indent=2, ensure_ascii=False), encoding="utf-8")
        written.append(output_path)
    return written


def main() -> None:
    parser = argparse.ArgumentParser(description="Extract Shadowdark monsters and spells from the local PDF.")
    parser.add_argument("--pdf", type=Path, default=PDF_PATH)
    parser.add_argument("--skip-monsters", action="store_true")
    parser.add_argument("--skip-spells", action="store_true")
    args = parser.parse_args()

    if not args.skip_monsters:
        monsters = extract_all_monsters(args.pdf)
        written_monsters = write_monster_files(monsters, MONSTER_OUTPUT_DIR)
        print(f"Wrote {len(written_monsters)} monster files.")
        for path in written_monsters:
            print(f"  - {path.name}")

    if not args.skip_spells:
        spells = extract_spells(args.pdf)
        written_spells = write_spell_files(spells, SPELL_OUTPUT_DIR)
        print(f"Wrote {len(written_spells)} spell files.")
        for path in written_spells:
            print(f"  - spells/{path.name}")


if __name__ == "__main__":
    main()
