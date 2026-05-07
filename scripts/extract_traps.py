import json
import re
from pathlib import Path

from pypdf import PdfReader


PDF_PATH = Path(
    "c:/Users/Dungeon Master/Desktop/Coding stuff/GCSDE/506/SD-website/Shadowdark_RPG_-_V4-9-1.pdf"
)
OUTPUT_PATH = Path("traps.json")


def normalize_spaces(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def extract_traps(pdf_path: Path) -> list[dict]:
    reader = PdfReader(str(pdf_path))
    page_text = reader.pages[117].extract_text() or ""
    traps: list[dict] = []

    for line in page_text.splitlines():
        line = normalize_spaces(line)
        match = re.match(
            r"^(\d{1,2})\s+(.+?)\s+(Tripwire|Pressure plate|Opening a door|Switch or button|False step on stairs|Closing a door|Breaking a light beam|Pulling a lever|A word is spoken|Hook on a thread|Removing an object|Casting a spell)\s+(.+)$",
            line,
        )
        if not match:
            continue
        traps.append(
            {
                "roll": int(match.group(1)),
                "name": match.group(2),
                "trigger": match.group(3),
                "effect": match.group(4),
            }
        )

    return traps


def main() -> None:
    traps = extract_traps(PDF_PATH)
    OUTPUT_PATH.write_text(json.dumps(traps, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Wrote {len(traps)} traps to {OUTPUT_PATH}")
    for trap in traps:
        print("-", trap["name"])


if __name__ == "__main__":
    main()
