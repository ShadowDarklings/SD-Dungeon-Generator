from copy import deepcopy
import pytest
from game_runtime import game_runtime
from test_rooms import dungeon, character


def fight():
    state = dungeon()
    state["characters"][0].update(hp=100, maxHitPoints=100, lightSource="torch", lightRadius=6, gear=[{"name": "Torch", "quantity": 3}, {"name": "Sword", "quantity": 1}])
    state["player"].update(torchLit=True, lightSource="torch", lightRadius=6)
    state["visibility"] = {"visibleNow": [f"{x},{y}" for x in range(7) for y in range(7)]}
    state["entities"].append({"id": "m1", "type": "monster", "name": "Test Monster", "hp": 100,
        "maxHp": 100, "ac": 1, "x": 3, "y": 2, "roomId": "r1", "level": 1,
        "attack": "1 claw +99 (1d4)", "hostile": True, "visible": True, "attitude": "hostile"})
    state["combat"] = {"active": True, "round": 1, "turnIndex": 0, "movementRemaining": 6, "actionUsed": False,
        "playerOrderIds": ["host-char"], "monsterIds": ["m1"], "turnOrder": [{"type": "character", "id": "host-char"}, {"type": "monster", "id": "m1"}]}
    return state


def test_movement_is_applied_to_the_command_character():
    result = game_runtime.apply(dungeon(), {"type": "move", "character_id": "host-char", "dx": 1, "dy": 0})
    assert (result["state_json"]["characters"][0]["x"], result["state_json"]["characters"][0]["y"]) == (3, 2)
    with pytest.raises(ValueError, match="adjacent"):
        game_runtime.apply(dungeon(), {"type": "move", "character_id": "host-char", "dx": 20, "dy": 0})


def test_combat_attack_uses_action_and_monster_turn_completes():
    state = fight()
    attack = game_runtime.apply(state, {"type": "attack", "character_id": "host-char", "monster_id": "m1", "attack_index": 0})
    assert "attacks" in attack["message"], attack["message"]
    assert attack["state_json"]["combat"]["actionUsed"] is True
    assert attack["state_json"]["entities"][-1]["hp"] < 100
    turn = game_runtime.apply(attack["state_json"], {"type": "end_turn", "character_id": "host-char", "online_character_ids": ["host-char"]})
    assert turn["state_json"]["combat"]["round"] == 2, turn["message"]
    assert turn["state_json"]["characters"][0]["hp"] < 100
    assert turn["state_json"]["combat"]["turnOrder"][turn["state_json"]["combat"]["turnIndex"]]["id"] == "host-char"


def test_wrong_combat_turn_cannot_move_and_rolls_are_bounded():
    state = fight()
    state["combat"]["turnIndex"] = 1
    with pytest.raises(ValueError, match="turn"):
        game_runtime.apply(state, {"type": "move", "character_id": "host-char", "dx": 1, "dy": 0})
    roll = game_runtime.apply(dungeon(), {"type": "roll", "character_id": "host-char", "sides": 6, "count": 2, "modifier": 3})
    assert 5 <= roll["dice"]["total"] <= 15
    with pytest.raises(ValueError, match="dice"):
        game_runtime.apply(dungeon(), {"type": "roll", "character_id": "host-char", "sides": 6, "count": 100000, "modifier": 0})


def test_sheet_edit_cannot_change_position_or_resurrect_dead_characters():
    state = dungeon()
    state["characters"][0].update(dead=True, slain=True, hp=0)
    result = game_runtime.apply(state, {"type": "edit_character", "character_id": "host-char", "character_json": {
        "x": 6, "y": 6, "dead": False, "slain": False, "hp": 8, "name": "Updated", "raw": {"dead": False}}})
    char = result["state_json"]["characters"][0]
    assert char["x"] == 2 and char["y"] == 2
    assert char["dead"] is True and char["hp"] == 0


def test_shared_damage_roll_is_logged_and_bounded():
    result = game_runtime.apply(dungeon(), {"type": "roll", "character_id": "host-char", "expression": "2d6+3x2"})
    assert 10 <= result["dice"]["total"] <= 30
    assert "2d6+3x2" in result["state_json"]["activity"][-1]["message"]
    for expression in ("999999d6", "1d0", "0d6", "100d6+100d6", "1d6x999999", "process.exit()"):
        with pytest.raises(ValueError, match="dice"):
            game_runtime.apply(dungeon(), {"type": "roll", "character_id": "host-char", "expression": expression})
