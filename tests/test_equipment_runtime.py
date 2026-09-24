from copy import deepcopy

import pytest

from game_runtime import game_runtime
from test_rooms import dungeon, character, clients, create, join, command
from test_game_runtime import fight


def apply(state, action, **kwargs):
    return game_runtime.apply(state, {"type": action, "character_id": "host-char", **kwargs})


def import_character(state, name, gear):
    raw = character(name, name)
    raw.update(gear=gear, attacks=[])
    return apply(state, "import", character_json=raw, new_character_id=name)["state_json"]


def test_first_actual_light_after_torchless_import_and_subsequent_lantern():
    state = dungeon()
    state["characters"] = []
    state["player"].update(torchLit=True, lightSource="torch", lightRadius=6)
    state = import_character(state, "no-light", [])
    assert state["characters"][0]["lightRadius"] == 0
    assert not state["timers"]["lightEverLit"]
    state = import_character(state, "torch-bearer", [{"name": "Torch", "quantity": 2}])
    assert state["characters"][1]["lightRadius"] == 6
    assert state["characters"][1]["gear"][0]["lit"]
    assert state["timers"]["lightEverLit"]
    state = import_character(state, "lantern-bearer", [{"name": "Lantern"}, {"name": "Oil, flask", "quantity": 2}])
    assert state["characters"][2]["lightRadius"] == 12
    assert state["characters"][1]["lightRadius"] == 6


def test_all_sixteen_imports_stay_in_small_starting_room():
    state = dungeon()
    state["characters"] = []
    for tile in state["tiles"]:
        tile["roomId"] = "r1" if tile["x"] in (2, 3) and tile["y"] in (2, 3) else "hall"
    for index in range(16):
        state = import_character(state, f"hero-{index}", [])
    assert len(state["characters"]) == 16
    assert all(c["roomId"] == "r1" and c["x"] in (2, 3) and c["y"] in (2, 3) for c in state["characters"])


@pytest.mark.parametrize("personal,party,expected_personal,expected_party,bought", [
    (20, 40, 0, 10, True), (50, 100, 0, 100, True), (100, 0, 50, 0, True),
    (20, 29, 20, 29, False), (20, 30, 0, 0, True),
])
def test_shop_spends_personal_then_party_without_spending_xp(personal, party, expected_personal, expected_party, bought):
    state = dungeon()
    state["characters"][0].update(gold=0, silver=0, copper=personal, xp=7)
    state["partyAssets"] = {"gold": 0, "silver": 0, "copper": party}
    result = apply(state, "buy_gear", item_id="torch")["state_json"]
    hero = result["characters"][0]
    copper = lambda money: money.get("gold", 0) * 100 + money.get("silver", 0) * 10 + money.get("copper", 0)
    assert copper(hero) == expected_personal
    assert copper(result["partyAssets"]) == expected_party
    assert hero["XP"] == 7
    assert any(item["name"] == "Torch" for item in hero["gear"]) is bought


def test_purchased_first_torch_lights_without_flint_or_darkness_check():
    state = dungeon()
    state["characters"][0].update(gold=1, gear=[], attacks=[])
    state = apply(state, "buy_gear", item_id="torch")["state_json"]
    state = apply(state, "light", source="torch", gear_index=0)["state_json"]
    assert state["characters"][0]["gear"][0]["lit"]
    assert state["characters"][0]["lightRadius"] == 6
    assert state["timers"]["lightEverLit"]


def test_equipment_updates_ac_versatile_damage_and_light():
    state = dungeon()
    state["characters"][0].update(gear=[{"name": "Bastard sword"}, {"name": "Shield"}, {"name": "Torch", "lit": True}],
                                    equipmentInitialized=True, attacks=[])
    state = apply(state, "equip", gear_index=0, equipped=True)["state_json"]
    assert "1d10" in state["characters"][0]["attacks"][0]
    state = apply(state, "equip", gear_index=2, equipped=True)["state_json"]
    assert "1d8" in state["characters"][0]["attacks"][0]
    assert state["characters"][0]["lightRadius"] == 6
    state = apply(state, "equip", gear_index=1, equipped=True)["state_json"]
    assert state["characters"][0]["armorClass"] == 12
    assert state["characters"][0]["lightRadius"] == 0
    assert state["characters"][0]["gear"][2]["lit"]
    state = apply(state, "equip", gear_index=1, equipped=False)["state_json"]
    assert state["characters"][0]["armorClass"] == 10
    assert "1d10" in state["characters"][0]["attacks"][0]


def test_stowed_torch_expires_and_cannot_be_re_equipped_to_relight():
    state = dungeon()
    state["characters"][0].update(equipmentInitialized=True, gear=[{"name": "Torch", "lit": True, "equipped": False, "quantity": 2}])
    state["timers"] = {"torchDurationMs": 3600000, "torchElapsedMs": 3599999, "nextWanderingCheckMs": 7200000}
    state = apply(state, "tick", elapsed_ms=100)["state_json"]
    assert not state["characters"][0]["gear"][0]["lit"]
    state = apply(state, "equip", gear_index=0, equipped=True)["state_json"]
    assert state["characters"][0]["lightRadius"] == 0


def test_stowed_lit_torch_illuminates_when_dropped_and_picked_up():
    state = dungeon()
    state["characters"][0].update(equipmentInitialized=True, gear=[{"name": "Torch", "lit": True, "equipped": False}])
    state = apply(state, "drop_gear", gear_index=0)["state_json"]
    dropped = next(item for item in state["entities"] if item.get("subtype") == "dropped-equipment")
    assert dropped["lightRadius"] == 6
    state = apply(state, "pickup", entity_id=dropped["id"])["state_json"]
    assert state["characters"][0]["lightRadius"] == 6
    assert state["characters"][0]["gear"][0]["lit"]


def test_unarmed_attack_is_not_the_spell_check_die_and_uses_strength():
    state = fight()
    hero = state["characters"][0]
    hero.update(className="Wizard", **{"class": "Wizard"}, gear=[{"name": "Torch"}],
                attacks=["SPELLS: To cast a Wizard spell, roll 1d20+3 vs a DC equal to 10 + the spell's tier."])
    hero["stats"]["STR"] = 18
    hero["stats"]["DEX"] = 3
    state["entities"][-1]["ac"] = 0
    names = set()
    for _ in range(40):
        result = apply(deepcopy(state), "attack", monster_id="m1", attack_index=1)
        assert result["state_json"]["entities"][-1]["hp"] == 99
        assert result["dice"]["total"] == 1
        message = result["message"]
        name = message.split(" with ")[1].split(":")[0]
        assert name in {"Punch", "Kick", "Headbutt", "Body block"}
        names.add(name)
        assert int(message.split(": ")[1].split(" vs AC")[0]) >= 5
    assert len(names) >= 2


def test_unequipped_weapon_rejected_but_unarmed_allowed():
    state = fight()
    state["characters"][0].update(equipmentInitialized=True,
        gear=[{"name": "Torch", "lit": True, "equipped": True}, {"name": "Sword", "equipped": False}])
    with pytest.raises(ValueError, match="Equip"):
        apply(state, "attack", monster_id="m1", attack_index=0)
    state["entities"][-1]["ac"] = 0
    result = apply(state, "attack", monster_id="m1", attack_index=1)
    assert result["state_json"]["entities"][-1]["hp"] == 99


def test_guests_cannot_equip_or_buy_for_other_players(clients):
    host, guest, _ = clients
    room = create(host, players_can_import=True)
    join(guest, room)
    assert command(guest, room, "equip", character_id="host-char", gear_index=0, equipped=True).status_code == 403
    assert command(guest, room, "buy_gear", character_id="host-char", item_id="torch").status_code == 403
