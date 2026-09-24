"""Exercise equipment, light, and unarmed controls against an isolated Flask app."""
import json
import os
from pathlib import Path
import statistics
import sys
import tempfile
import threading
import time

from playwright.sync_api import sync_playwright, expect
from werkzeug.serving import make_server

from audit_game_performance import QuietHandler

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "tests"))

HOOKS = """
window.__equipmentAudit = {
  formatTalent: text => formatTalentSpellTextForSheet(text),
  snapshot: () => serializeDungeonState(state),
  open: index => openCharacterSheet(state.characters[index]),
  active: index => { setActiveCharacter(state, state.characters[index].id); syncPlayerToActiveCharacter(); updatePanels(); },
  nextMove: () => {const {x,y} = state.player; return [[1,0,'ArrowRight'],[-1,0,'ArrowLeft'],[0,1,'ArrowDown'],[0,-1,'ArrowUp']]
    .find(([dx,dy]) => canMoveBetweenTiles(state,x,y,x+dx,y+dy).ok)?.[2];},
  load: raw => { state=hydrateDungeonState(raw); syncAllCharacterEquipmentDerivedStats();
    ensureCharacterPresentation(); syncPlayerToActiveCharacter(); recomputeVisibility(state); render(); updatePanels(); },
  attack: () => attackClickedMonster(state.entities.find(item => item.type === 'monster')),
};
"""


def run():
    out = ROOT / "browser-checks" / "equipment"
    out.mkdir(parents=True, exist_ok=True)
    report = {"errors": []}
    with tempfile.TemporaryDirectory(prefix="sd-equipment-") as tmp:
        os.environ.update(DATABASE_URL="sqlite:///" + str(Path(tmp) / "test.db"),
            SECRET_KEY="isolated-equipment-test", OAUTH_CLIENT_ID="test", OAUTH_CLIENT_SECRET="test",
            FLASK_ENV="development", SHADOWDARKLINGS_IMPORT_ENABLED="1", RATELIMIT_STORAGE_URI="memory://")
        from app import app, engine
        from test_game_runtime import fight
        app.config["TESTING"] = True
        server = make_server("127.0.0.1", 0, app, threaded=True, request_handler=QuietHandler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        base = f"http://127.0.0.1:{server.server_port}"
        gear_sets = [[], [{"name": "Bastard sword"}, {"name": "Shield"}, {"name": "Torch", "quantity": 2}, {"name": "Staff"}],
                     [{"name": "Lantern"}, {"name": "Oil, flask", "quantity": 2}]]
        try:
            with sync_playwright() as p:
                browser = p.chromium.launch(headless=True)
                page = browser.new_page(viewport={"width": 1440, "height": 1000})
                page.on("pageerror", lambda error: report["errors"].append(str(error)))
                page.route("**/site/src/main.js", lambda route: route.fulfill(
                    body=(ROOT / "S3_content/src/main.js").read_text(encoding="utf-8") + HOOKS,
                    content_type="text/javascript"))
                imports = []
                def import_hero(route):
                    index = len(imports)
                    hero = {"name": f"Tester {index}", "class": "Fighter", "level": 1, "hp": 20,
                        "stats": {key: 12 for key in ("STR", "DEX", "CON", "INT", "WIS", "CHA")},
                        "gear": gear_sets[index], "attacks": [], "gold": 2}
                    if index == 1:
                        hero["levels"] = [{"level": 1, "talentRolledName": "LongSword", "talentRolledDesc": ""}]
                    imports.append(hero)
                    route.fulfill(json={"character_json": json.dumps(hero)})
                page.route("**/api/shadowdarklings/import", import_hero)
                started = time.perf_counter()
                page.goto(base + "/site/")
                expect(page.locator("#status-text")).to_contain_text("Generated", timeout=90000)
                report["startup_ms"] = round((time.perf_counter() - started) * 1000, 1)
                page.locator("#seed-input").fill("12345")
                page.locator("#generate-btn").click()
                expect(page.locator("#status-text")).to_contain_text("seed 12345.")
                for index in range(3):
                    page.locator("#import-character-btn").click()
                    expect(page.locator(".character-card")).to_have_count(index + 1)
                state = page.evaluate("__equipmentAudit.snapshot()")
                assert [hero["lightRadius"] for hero in state["characters"]] == [0, 6, 12]
                assert all(hero["roomId"] == state["generation"]["entranceRoomId"] for hero in state["characters"])
                page.evaluate("__equipmentAudit.open(1)")
                sheet = page.locator("#character-sheet-content")
                expect(sheet).to_contain_text("Fighter 1: Long Sword mastery")
                expect(sheet.locator(".sd-attacks-panel input[type=checkbox]")).to_have_count(0)
                expect(sheet.locator(".sd-gear-lines input[type=checkbox]")).to_have_count(5)
                for source, expected in [
                    ("Fighter 1: Longbow", "Fighter 1: Longbow mastery"),
                    ("Fighter 3: Long Sword", "Fighter 3: Long Sword mastery"),
                    ("Fighter 1: Weapon Mastery: Staff", "Fighter 1: Staff mastery"),
                    ("Fighter 1: War Hammer: Mastery", "Fighter 1: War Hammer mastery"),
                    ("Fighter 1: Armor Mastery: Shield", "Fighter 1: Armor Mastery: +1 AC from Shields"),
                ]:
                    assert page.evaluate("text => __equipmentAudit.formatTalent(text)", source) == expected
                sword = sheet.get_by_role("checkbox", name="Equip Bastard sword", exact=True)
                staff = sheet.get_by_role("checkbox", name="Equip Staff", exact=True)
                shield = sheet.get_by_role("checkbox", name="Equip Shield", exact=True)
                torch = sheet.get_by_role("checkbox", name="Equip Torch", exact=True).first
                expect(torch).to_be_checked()
                expect(shield).to_be_checked()
                expect(sword).not_to_be_checked()
                expect(sheet.get_by_role("button", name="Bastard sword", exact=True)).to_be_disabled()
                sword.check()
                expect(torch).not_to_be_checked()
                expect(sword).to_be_checked()
                expect(shield).to_be_checked()
                shield.uncheck()
                expect(sheet).to_contain_text("1d10")
                torch.check()
                expect(sheet).to_contain_text("1d8")
                staff.check()
                expect(torch).not_to_be_checked()
                expect(sword).not_to_be_checked()
                assert page.evaluate("__equipmentAudit.snapshot().characters[1].lightRadius") == 0
                torch.check()
                expect(staff).not_to_be_checked()
                assert page.evaluate("__equipmentAudit.snapshot().characters[1].lightRadius") == 6
                spare_torch = sheet.get_by_role("checkbox", name="Equip Torch", exact=True).nth(1)
                spare_row = spare_torch.locator("xpath=../..")
                spare_row.hover()
                spare_row.get_by_role("button", name="Light", exact=True).click()
                page.locator("#extinguish-old-no-btn").click()
                expect(spare_torch).to_be_checked()
                expect(torch).not_to_be_checked()
                lights = page.evaluate("__equipmentAudit.snapshot().characters[1].gear.filter(item => item.name === 'Torch')")
                assert all(item["lit"] for item in lights)
                assert page.evaluate("__equipmentAudit.snapshot().characters[1].lightRadius") == 6
                page.screenshot(path=str(out / "desktop.png"))
                page.set_viewport_size({"width": 390, "height": 844})
                shield.check()
                shield.uncheck()
                assert page.evaluate("""() => [...document.querySelectorAll('#character-sheet-content .sd-equipment-toggle input')].every(el => {
                    const r=el.getBoundingClientRect(); const hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
                    return r.top < 0 || r.bottom > innerHeight || hit === el;
                })"""), "Equipment checkboxes overlap other controls"
                page.screenshot(path=str(out / "mobile.png"))
                page.locator("#character-sheet-close").click()
                page.set_viewport_size({"width": 1440, "height": 1000})
                page.evaluate("__equipmentAudit.active(1)")
                direction = page.evaluate("__equipmentAudit.nextMove()")
                assert direction
                reverse = {"ArrowLeft": "ArrowRight", "ArrowRight": "ArrowLeft", "ArrowUp": "ArrowDown", "ArrowDown": "ArrowUp"}
                page.locator("#map-host").focus()
                durations = []
                for index in range(20):
                    before = page.evaluate("__equipmentAudit.snapshot().player")
                    started = time.perf_counter()
                    page.keyboard.press(direction if index % 2 == 0 else reverse[direction])
                    after = page.evaluate("__equipmentAudit.snapshot().player")
                    durations.append((time.perf_counter() - started) * 1000)
                    assert (before["x"], before["y"]) != (after["x"], after["y"])
                report["keypress_to_observed_position_median_ms"] = round(statistics.median(durations), 1)
                combat = fight()
                combat["characters"][0].update(gear=[{"name": "Torch"}], attacks=["SPELLS: roll 1d20+3 vs DC 11"],
                    className="Wizard", **{"class": "Wizard"})
                combat["entities"][-1]["ac"] = 0
                for _ in range(5):
                    page.evaluate("raw => __equipmentAudit.load(raw)", combat)
                    result = page.evaluate("__equipmentAudit.attack()")
                    assert "hit for 1 damage" in result["message"], result
                    assert page.evaluate("__equipmentAudit.snapshot().entities.at(-1).hp") == 99
                report["local_unarmed_hits"] = 5
                assert not report["errors"], report["errors"]
                browser.close()
        finally:
            server.shutdown()
            thread.join(timeout=5)
            engine.dispose()
        (out / "report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
        print(json.dumps(report, indent=2))


if __name__ == "__main__":
    run()
