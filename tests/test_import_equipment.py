import pytest

from game_runtime import game_runtime
from test_rooms import dungeon, character


def import_hero(gear, *, lit=False, strength=10, dexterity=10, mastery=None, class_name="Fighter", saved=False, wall=False):
    state = dungeon()
    if lit:
        state["characters"][0].update(equipmentInitialized=True, lightSource="torch", lightRadius=6,
            gear=[{"name": "Torch", "lit": True, "equipped": True}])
    if wall:
        state["characters"][0].update(x=0, y=0)
        for tile in state["tiles"]:
            if tile["x"] == 1:
                tile["type"] = "wall"
            if tile["x"] < 2:
                tile["roomId"] = "other"
    hero = character("Incoming", "incoming")
    hero.update(gear=gear, attacks=[], className=class_name, **{"class": class_name}, equipmentInitialized=saved)
    hero["stats"].update(STR=strength, DEX=dexterity)
    if mastery:
        hero["levels"] = [{"level": 1, "talentRolledName": mastery, "talentRolledDesc": ""}]
    result = game_runtime.apply(state, {"type": "import", "new_character_id": "incoming", "character_json": hero})
    return result["state_json"]["characters"][-1]


def held(hero):
    return [item["name"] for item in hero["gear"] if item.get("equipped")]


@pytest.mark.parametrize("lit,expected", [(False, ["Shield", "Torch"]), (True, ["Greatsword"])])
def test_room_light_changes_two_handed_mastery_priority(lit, expected):
    hero = import_hero([{"name": name} for name in ("Shield", "Greatsword", "Torch")], mastery="Greatsword", lit=lit)
    assert held(hero) == expected
    assert hero["lightRadius"] == (0 if lit else 6)
    assert any("1d12+1" in attack for attack in hero["attacks"])


def test_lantern_requires_fuel_and_is_preferred_to_torch():
    names = [{"name": "Torch"}, {"name": "Lantern"}, {"name": "Shield"}]
    assert held(import_hero(names)) == ["Torch", "Shield"]
    hero = import_hero(names + [{"name": "Oil, flask", "quantity": 2}])
    assert held(hero) == ["Lantern", "Shield"]
    assert hero["lightRadius"] == 12


def test_lit_room_dex_tie_prefers_bow_over_shield_and_finesse():
    hero = import_hero([{"name": name} for name in ("Shield", "Dagger", "Longbow", "Torch")] +
                       [{"name": "Arrows", "quantity": 20}], lit=True)
    assert held(hero) == ["Longbow"]


def test_no_ammunition_skips_bow_and_unusable_class_gear():
    hero = import_hero([{"name": name} for name in ("Shield", "Greatsword", "Longbow", "Dagger", "Torch")],
                       lit=True, class_name="Wizard")
    assert held(hero) == ["Dagger", "Torch"]
    hero = import_hero([{"name": name} for name in ("Shield", "Longbow", "Dagger")], lit=True)
    assert held(hero) == ["Shield", "Dagger"]


def test_strong_character_chooses_maximum_damage_even_with_shield_available():
    hero = import_hero([{"name": name} for name in ("Shield", "Mace", "Greatsword", "Dagger")],
                       lit=True, strength=16)
    assert held(hero) == ["Greatsword"]


def test_named_mastery_and_class_restrictions_override_ability_preference():
    hero = import_hero([{"name": name} for name in ("Longsword", "Longbow", "Shield", "Torch")] +
                       [{"name": "Arrows", "quantity": 20}], lit=True, mastery="LongSword", dexterity=16)
    assert held(hero) == ["Longsword", "Shield"]
    assert any("1d8+1" in attack for attack in hero["attacks"])
    hero = import_hero([{"name": name} for name in ("Greatsword", "Shield", "Dagger", "Torch")], class_name="Wizard")
    assert held(hero) == ["Dagger", "Torch"]


def test_saved_loadout_and_unlit_status_are_preserved():
    hero = import_hero([{"name": "Greatsword", "equipped": True}, {"name": "Torch", "equipped": False, "lit": False}], saved=True)
    assert held(hero) == ["Greatsword"]
    assert hero["lightRadius"] == 0


def test_a_light_behind_a_wall_does_not_make_starting_room_illuminated():
    hero = import_hero([{"name": name} for name in ("Shield", "Greatsword", "Torch")], lit=True, wall=True, strength=16)
    assert held(hero) == ["Shield", "Torch"]
    assert hero["lightRadius"] == 0
