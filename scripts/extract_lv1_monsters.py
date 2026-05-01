import json
import re
import sys
from pathlib import Path

from pypdf import PdfReader


PDF_PATH = Path(
    "c:/Users/Dungeon Master/Desktop/Coding stuff/GCSDE/506/SD-website/Shadowdark_RPG_-_V4-9-1.pdf"
)
def normalize_spaces(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def is_name_line(line: str) -> bool:
    if len(line) < 2 or len(line) > 42:
        return False
    if line != line.upper():
        return False
    if any(ch.isdigit() for ch in line):
        return False
    if not re.match(r"^[A-Z0-9,'()\- ]+$", line):
        return False
    if re.search(r"\b(AC|HP|ATK|MV|AL|LV|CH|Ch)\b", line):
        return False
    banned = {
        "MONSTER STATISTICS",
        "MONSTERS",
        "ROLLING RANDOM MONSTERS",
        "SPECIAL ABILITIES",
        "SPECIAL TRAITS",
    }
    return line not in banned


def parse_statline(statline: str) -> dict[str, str]:
    # Some entries omit a comma between HP and ATK in PDF extraction.
    statline = re.sub(r"(HP\s+[^,]+?)\s+(ATK\s+)", r"\1, \2", statline)
    keys = ["AC", "HP", "ATK", "MV", "S", "D", "C", "I", "W", "CH", "AL", "LV"]
    parsed: dict[str, str] = {k: "" for k in keys}
    for seg in [normalize_spaces(s) for s in statline.split(",")]:
        if not seg:
            continue
        m = re.match(r"^(AC|HP|ATK|MV|S|D|C|I|W|Ch|CH|AL|LV)\s+(.+)$", seg)
        if not m:
            # Continuation of previous token (usually ATK or MV line wraps).
            for back_key in ("LV", "AL", "CH", "W", "I", "C", "D", "S", "MV", "ATK", "HP", "AC"):
                if parsed[back_key]:
                    parsed[back_key] = f"{parsed[back_key]} {seg}".strip()
                    break
            continue
        key = m.group(1).upper()
        if key == "CH":
            key = "CH"
        parsed[key] = m.group(2).strip()
    return parsed


def parse_abilities(ability_lines: list[str]) -> dict[str, str]:
    abilities: dict[str, str] = {}
    current_name: str | None = None
    current_text: list[str] = []
    for raw in ability_lines:
        line = normalize_spaces(raw)
        if not line or re.fullmatch(r"\d{1,3}", line):
            continue
        m = re.match(r"^([A-Z][A-Za-z0-9'()/\- ]+?)\.\s*(.*)$", line)
        if m and not m.group(1).startswith("DC "):
            if current_name:
                abilities[f"**{current_name}**"] = normalize_spaces(" ".join(current_text))
            current_name = normalize_spaces(m.group(1))
            tail = m.group(2).strip()
            current_text = [tail] if tail else []
        elif current_name:
            current_text.append(line)
    if current_name:
        abilities[f"**{current_name}**"] = normalize_spaces(" ".join(current_text))
    return abilities


def extract_monsters_by_level(pdf_path: Path, level: int) -> list[dict]:
    reader = PdfReader(str(pdf_path))

    # User-indicated section starts where Aboleth begins; in this file that's PDF page 198.
    lines: list[str] = []
    for page in reader.pages[197:]:
        text = page.extract_text() or ""
        lines.extend([ln.strip() for ln in text.splitlines() if ln.strip()])

    monsters: list[dict] = []
    i = 0
    while i < len(lines):
        line = lines[i]
        if not is_name_line(line):
            i += 1
            continue

        name = normalize_spaces(line.title())
        i += 1
        chunk: list[str] = []
        while i < len(lines) and not is_name_line(lines[i]):
            chunk.append(lines[i])
            i += 1

        # Build statline that can be wrapped across multiple PDF lines.
        stat_idx = -1
        for idx, c in enumerate(chunk):
            if c.startswith("AC "):
                stat_idx = idx
                break
        if stat_idx == -1:
            continue

        stat_parts = [chunk[stat_idx]]
        j = stat_idx + 1
        while j < len(chunk) and " LV " not in f" {normalize_spaces(' '.join(stat_parts))} ":
            stat_parts.append(chunk[j])
            j += 1
        statline = normalize_spaces(" ".join(stat_parts))
        if not re.search(rf"\bLV {level}\b", statline):
            continue
        stats = parse_statline(statline)
        stats["LV"] = str(level)

        abilities = parse_abilities(chunk[j:])
        monsters.append(
            {
                "Monster Name": name,
                "**AC**": stats["AC"],
                "**HP**": stats["HP"],
                "**ATK**": stats["ATK"],
                "**MV**": stats["MV"],
                "**S**": stats["S"],
                "**D**": stats["D"],
                "**C**": stats["C"],
                "**I**": stats["I"],
                "**W**": stats["W"],
                "**CH**": stats["CH"],
                "**AL**": stats["AL"],
                "**LV**": stats["LV"],
                "abilities": abilities,
            }
        )

    return monsters


def main() -> None:
    level = int(sys.argv[1]) if len(sys.argv) > 1 else 1
    output_path = Path(f"monsters-{level}.json")
    monsters = extract_monsters_by_level(PDF_PATH, level)
    output_path.write_text(json.dumps(monsters, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Wrote {len(monsters)} monsters to {output_path}")
    print("Names:")
    for m in monsters:
        print("-", m["Monster Name"])


if __name__ == "__main__":
    main()
