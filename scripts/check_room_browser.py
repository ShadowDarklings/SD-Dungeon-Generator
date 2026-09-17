"""Two independent browser contexts against the isolated local preview."""
import json
import os
from pathlib import Path
import uuid
import re
from playwright.sync_api import sync_playwright, expect

root = Path(__file__).resolve().parents[1]
out = root / "browser-checks"
out.mkdir(exist_ok=True)
base = os.environ.get("SD_BROWSER_BASE", "http://127.0.0.1:5057").rstrip("/")

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    host_context = browser.new_context(viewport={"width": 1440, "height": 1000})
    guest_context = browser.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
    host, guest = host_context.new_page(), guest_context.new_page()
    errors = []
    for page in (host, guest):
        page.on("pageerror", lambda error: (errors.append(str(error)), print("Browser error:", error, flush=True)))
        page.route("**/api/shadowdarklings/import", lambda route: route.fulfill(json={"character_json": json.dumps({
            "name": "Browser Hero", "class": "Fighter", "stats": {key: 12 for key in ["STR", "DEX", "CON", "INT", "WIS", "CHA"]},
            "hp": 8, "maxHitPoints": 8, "armorClass": 12, "level": 1, "gear": [{"name": "Torch", "quantity": 3}], "attacks": ["Sword: +2, 1d6, close"]})}))
    host.goto(base + "/register")
    host.locator('[name="username"]').fill("browser-" + uuid.uuid4().hex[:10])
    host.locator('[name="password"]').fill("secret")
    host.locator('button[type="submit"]').click()
    host.wait_for_url("**/site/")
    expect(host.locator("#status-text")).to_contain_text("Generated", timeout=90000)
    host.locator("#import-character-btn").click()
    host.locator(".character-card").first.wait_for()
    host_character_id = host.locator(".character-card").first.get_attribute("data-character-id")
    host.locator("#multiplayer-btn").click()
    host.locator("#multiplayer-create-host-btn").click()
    host.wait_for_url("**/site/?room=*")
    code = host.locator("#multiplayer-invite-code").inner_text()
    assert len(code) == 4, code
    host.screenshot(path=str(out / "room-host.png"), full_page=True)
    guest.goto(base + "/site/?join=" + code)
    guest.wait_for_url("**/site/?room=*")
    assert guest.locator("#multiplayer-host-section").is_hidden()
    guest.locator("#multiplayer-close").click()
    guest.locator(".character-card .character-mini-name").first.click()
    assert guest.locator("#character-sheet-modal").is_visible()
    assert guest.locator("#character-sheet-content .sd-rename-button").is_disabled()
    guest.locator("#character-sheet-close").click()
    expect(guest.locator("#import-character-btn")).to_be_disabled()
    expect(guest.locator("#search-btn")).to_be_disabled()
    expect(guest.locator("#zoom-in-btn")).to_be_enabled()
    expect(guest.locator(".manual-die-button").first).to_be_enabled()
    guest.locator(".manual-die-button").first.click()
    expect(guest.locator("#damage-result")).not_to_have_text("none")

    host.locator("#multiplayer-refresh-btn").click()
    expect(host.locator(".multiplayer-presence-row")).to_have_count(2)
    host.locator(".multiplayer-presence-row").filter(has_text="Adventurer").locator("select").select_option(host_character_id)
    expect(host.locator("#multiplayer-status")).to_contain_text("updated")
    guest.reload()
    expect(guest.locator(".character-card")).to_have_count(1)
    guest.locator("#multiplayer-close").click()
    guest.locator(".character-card .character-mini-name").first.click()
    expect(guest.locator("#character-sheet-content .sd-rename-button")).to_be_enabled()
    guest.locator("#character-sheet-close").click()

    host.locator(".multiplayer-presence-row").filter(has_text="(host,").locator("select").select_option(host_character_id)
    expect(host.locator("#multiplayer-status")).to_contain_text("updated")
    host.locator("#room-option-players_can_import").check()
    host.locator("#room-save-options").click()
    expect(host.locator("#multiplayer-status")).to_contain_text("updated")
    guest.reload()
    expect(guest.locator(".character-card")).to_have_count(1)
    guest.locator("#multiplayer-close").click()
    expect(guest.locator("#import-character-btn")).to_be_enabled()
    guest.locator("#import-character-btn").click()
    expect(guest.locator(".character-card")).to_have_count(2)
    guest.screenshot(path=str(out / "room-guest-mobile.png"), full_page=True)
    host.locator("#multiplayer-close").click()
    expect(host.locator(".character-card")).to_have_count(2)
    room_id = host.url.split("room=")[1]
    view = guest.request.get(base + "/api/rooms/" + room_id).json()
    own = view["owned_character_ids"][0]
    assert guest.locator(".character-card").first.get_attribute("data-character-id") == own
    host_id = next(char["id"] for char in view["state_json"]["characters"] if char["id"] != own)
    guest.locator(f'.character-card[data-character-id="{host_id}"] .character-mini-name').click()
    assert guest.locator("#character-sheet-modal").is_visible()
    assert guest.locator("#character-sheet-content .sd-rename-button").is_disabled()
    guest.locator("#character-sheet-close").click()
    guest.locator(f'.character-card[data-character-id="{own}"] .character-mini-name').click()
    expect(guest.locator("#character-sheet-content")).to_have_attribute("data-character-id", own)
    expect(guest.locator("#character-sheet-content .sd-rename-button")).to_be_enabled()
    guest.locator("#character-sheet-close").click()
    initial = next(char for char in view["state_json"]["characters"] if char["id"] == own)
    moved = False
    for key in ("ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"):
        guest.keyboard.press(key)
        guest.wait_for_timeout(900)
        current = guest.request.get(base + "/api/rooms/" + room_id).json()
        char = next(c for c in current["state_json"]["characters"] if c["id"] == own)
        if (char["x"], char["y"]) != (initial["x"], initial["y"]):
            moved = True
            break
    assert moved, "Guest token did not move"
    host.reload()
    expect(host.locator(".character-card")).to_have_count(2)
    reloaded = host.request.get(base + "/api/rooms/" + room_id).json()
    assert reloaded["state_json"]["seed"] == view["state_json"]["seed"]
    room_url = host.url
    host.locator("#multiplayer-close").click()
    canonical_ids = [item["id"] for item in reloaded["state_json"]["characters"]]
    guest.locator(f'.character-card[data-character-id="{own}"] .character-reorder-handle').press("ArrowDown")
    expect(guest.locator(".character-card").first).to_have_attribute("data-character-id", host_id)
    assert [item["id"] for item in guest.request.get(base + "/api/rooms/" + room_id).json()["state_json"]["characters"]] == canonical_ids
    host.locator(f'.character-card[data-character-id="{own}"] .character-mini-name').drag_to(host.locator(f'.character-card[data-character-id="{host_id}"] .character-mini-name'))
    expect(host.locator(".character-card").first).to_have_attribute("data-character-id", own)
    # A real touch gesture exercises the mobile reorder handle.
    source = guest.locator(f'.character-card[data-character-id="{own}"] .character-reorder-handle')
    source.scroll_into_view_if_needed()
    destination = guest.locator(f'.character-card[data-character-id="{host_id}"] .character-mini-name')
    source_box, destination_box = source.bounding_box(), destination.bounding_box()
    cdp = guest_context.new_cdp_session(guest)
    start = {"x": source_box["x"] + 8, "y": source_box["y"] + 8}
    end = {"x": destination_box["x"] + 8, "y": destination_box["y"] + 8}
    cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [start]})
    cdp.send("Input.dispatchTouchEvent", {"type": "touchMove", "touchPoints": [end]})
    cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})
    expect(guest.locator(".character-card").first).to_have_attribute("data-character-id", own)
    host.locator("#multiplayer-btn").click()
    host.locator("#room-leave-session").click()
    expect(guest.locator("#room-state-banner")).to_contain_text("dungeon paused", timeout=12000)
    guest.locator(f'.character-card[data-character-id="{own}"] .character-mini-name').click()
    expect(guest.locator("#character-sheet-content .sd-rename-button")).to_be_disabled()
    guest.locator("#character-sheet-close").click()
    expect(guest.locator("#import-character-btn")).to_be_disabled()
    expect(guest.locator(".character-card")).to_have_count(2)
    guest.screenshot(path=str(out / "room-paused-mobile.png"), full_page=True)
    host.goto(room_url)
    expect(host.locator(".character-card")).to_have_count(2)
    for key in ("autonomous_exploration", "extra_characters_without_host", "bury_others"):
        assert not host.locator("#room-option-" + key).is_checked()
    assert host.locator("#room-option-players_can_import").is_checked()
    host.locator("#room-option-autonomous_exploration").check()
    host.locator("#room-option-extra_characters_without_host").check()
    host.locator("#room-save-options").click()
    expect(host.locator("#multiplayer-status")).to_contain_text("updated")
    host.screenshot(path=str(out / "room-host.png"), full_page=True)
    host.locator("#room-leave-session").click()
    expect(guest.locator("#room-state-banner")).to_contain_text("autonomous exploration enabled", timeout=12000)
    guest.locator("#import-character-btn").click()
    expect(guest.locator(".character-card")).to_have_count(3)
    guest.locator("#light-torch-btn").click()
    expect(guest.locator("#status-text")).to_contain_text("torch", timeout=10000)
    guest.locator("#multiplayer-btn").scroll_into_view_if_needed()
    guest.locator(".controls-panel").evaluate("element => element.scrollTop = 0")
    guest.screenshot(path=str(out / "room-guest-mobile.png"), full_page=True)
    guest.locator("#multiplayer-btn").click()
    guest.locator('[data-room-login="register"]').click()
    guest.locator('[name="username"]').fill("guest-" + uuid.uuid4().hex[:10])
    guest.locator('[name="password"]').fill("secret")
    guest.locator('button[type="submit"]').click()
    guest.wait_for_url("**/site/?room=*")
    expect(guest.locator(".character-card")).to_have_count(3)
    claimed = guest.request.get(base + "/api/rooms/" + room_id).json()
    assert claimed["authenticated"] and len(claimed["owned_character_ids"]) == 2
    guest.locator("#multiplayer-close").click()
    guest.locator(f'.character-card[data-character-id="{own}"] .character-mini-name').click()
    guest.locator(".sd-save-character-button").click()
    expect(guest.locator("#status-text")).to_contain_text("saved", ignore_case=True)
    guest.locator("#character-sheet-close").click()
    host.goto(room_url)
    expect(host.locator(".character-card")).to_have_count(3)
    host.locator("#multiplayer-close").click()
    host.locator("#save-btn").click()
    host.locator("#save-name-input").fill("Browser Crypt")
    host.locator("#save-modal-submit").click()
    expect(host.locator("#save-load-status")).to_contain_text("Dungeon saved")
    host.locator("#save-load-close").click()
    guest.locator("#multiplayer-btn").click()
    guest.locator("#room-leave-session").click()
    guest.wait_for_url("**/site/")
    expect(guest.locator(".character-card")).to_have_count(0)
    guest.locator("#load-btn").click()
    guest.locator(".saved-run-button").filter(has_text="Browser Crypt").click()
    guest.wait_for_url("**/site/?room=*")
    expect(guest.locator(".character-card")).to_have_count(3)
    guest.reload()
    expect(guest.locator(".character-card")).to_have_count(3)
    assert guest.request.get(base + "/api/rooms/" + room_id).json()["role"] == "player"
    for page in (host, guest):
        assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth"), "Horizontal overflow"
        assert page.locator("canvas").count() > 0
        assert page.evaluate("[...document.querySelectorAll('canvas')].some(c => {const p=c.getContext('2d')?.getImageData(0,0,c.width,c.height).data; return p && p.some(v=>v>0)})")
    assert not errors, errors
    print("Two-browser ownership, movement, reordering, host absence, permission switches, guest account linking, personal saves, named-room return and canvas checks passed.")
    browser.close()
