"""Bounds for untrusted JSON crossing save and game-command boundaries."""

import json
import math
import re


def validate_json(value, *, max_bytes=5 * 1024 * 1024):
    if not isinstance(value, dict):
        raise ValueError("Request body must be a JSON object.")
    pending = [(value, 0)]
    count = 0
    while pending:
        item, depth = pending.pop()
        count += 1
        if depth > 32 or count > 500000:
            raise ValueError("The submitted data is too complex.")
        if isinstance(item, dict):
            for key, child in item.items():
                if key in {"__proto__", "prototype", "constructor"} or len(key) > 200:
                    raise ValueError("The submitted data contains an invalid field.")
                pending.append((child, depth + 1))
        elif isinstance(item, list):
            if len(item) > 65536:
                raise ValueError("A submitted collection is too large.")
            pending.extend((child, depth + 1) for child in item)
        elif isinstance(item, str):
            if len(item) > 16384:
                raise ValueError("A submitted text field is too long.")
            for dice_count in re.findall(r"(?<!\w)(\d+)d\d+(?=$|[^\w]|x\d)", item, flags=re.I):
                if int(dice_count) > 100:
                    raise ValueError("Dice expressions may contain at most 100 dice.")
        elif isinstance(item, (int, float)) and not isinstance(item, bool):
            if abs(item) > 2**53 - 1 or not math.isfinite(item):
                raise ValueError("A submitted number is outside the supported range.")
        elif item is not None and not isinstance(item, bool):
            raise ValueError("Unsupported data type.")
    if len(json.dumps(value, ensure_ascii=False, allow_nan=False).encode("utf-8")) > max_bytes:
        raise ValueError("The submitted data is too large.")
    return value


def validate_state(value, *, require_map=False):
    validate_json(value)
    if require_map and ("seed" not in value or "level" not in value):
        raise ValueError("A dungeon seed and level are required.")
    if "seed" in value and (type(value["seed"]) is not int or abs(value["seed"]) > 2**32 - 1):
        raise ValueError("Invalid dungeon seed.")
    if "level" in value and (type(value["level"]) is not int or not 1 <= value["level"] <= 10):
        raise ValueError("Dungeon level must be between 1 and 10.")
    for key, limit in (("entities", 4096), ("rooms", 512), ("halls", 2048)):
        if key in value and (not isinstance(value[key], list) or len(value[key]) > limit or any(not isinstance(item, dict) for item in value[key])):
            raise ValueError(f"Invalid dungeon {key}.")
    characters = value.get("characters", [])
    if not isinstance(characters, list) or len(characters) > 16:
        raise ValueError("A dungeon can contain at most 16 characters.")
    seen = set()
    for character in characters:
        if not isinstance(character, dict):
            raise ValueError("Each character must be an object.")
        character_id = character.get("id")
        if not isinstance(character_id, str) or not 1 <= len(character_id) <= 120 or character_id in seen:
            raise ValueError("Character IDs must be unique, nonempty strings.")
        seen.add(character_id)
    if require_map or "map" in value:
        map_data = value.get("map")
        if not isinstance(map_data, dict):
            raise ValueError("A dungeon map is required.")
        width, height = map_data.get("width"), map_data.get("height")
        if any(type(size) is not int or not 1 <= size <= 256 for size in (width, height)):
            raise ValueError("Invalid dungeon dimensions.")
        tiles = value.get("tiles")
        if not isinstance(tiles, list) or len(tiles) != width * height:
            raise ValueError("Dungeon tiles do not match its dimensions.")
        if any(not isinstance(tile, dict) for tile in tiles):
            raise ValueError("Each tile must be an object.")
    return value
