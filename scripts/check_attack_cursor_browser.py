"""Local cursor, party import, and explicit-only multiplayer popup checks."""
import base64
import json
import os
from pathlib import Path
import time

from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
BASE = os.environ.get("SD_BROWSER_BASE", "http://127.0.0.1:5059").rstrip("/")
OUT = ROOT / "browser-checks" / "attack-cursor"
OUT.mkdir(parents=True, exist_ok=True)

INSTRUMENT = r"""
window.__cursorTest = {
  ready: () => Boolean(state && layers && attackCursorImage?.naturalWidth),
  place: () => {
    const character = getActiveCharacter(state);
    const tile = state.tiles.find(t => t.type === 'floor' && !getCharacterAtTile(t.x, t.y));
    const monster = {...state.entities.find(e => e.type === 'monster'), id: 'cursor-test',
      type: 'monster', name: 'Cursor Test', x: tile.x, y: tile.y, visible: true, defeated: false};
    state.entities = [monster];
    state.visibility.visibleNow.add(`${tile.x},${tile.y}`);
    state.visibility.exploredEver.add(`${tile.x},${tile.y}`);
    applyViewportScale(viewport.minScale);
    render();
    return window.__cursorTest.point();
  },
  point: () => {
    const monster = state.entities.find(e => e.id === 'cursor-test');
    const rect = layers.objectsCanvas.getBoundingClientRect();
    return {x: rect.left + (monster.x + .5) * TILE_SIZE_PX * rect.width / layers.objectsCanvas.width,
      y: rect.top + (monster.y + .5) * TILE_SIZE_PX * rect.height / layers.objectsCanvas.height};
  },
  color: id => {setDisplayCharacterColor(getActiveCharacter(state), CHARACTER_COLOR_PALETTE.find(c => c.id === id)); render();},
  hidden: value => {
    const monster = state.entities.find(e => e.id === 'cursor-test');
    const key = `${monster.x},${monster.y}`;
    if (value) state.visibility.visibleNow.delete(key); else state.visibility.visibleNow.add(key);
    updateMonsterHoverCursor();
  },
  defeated: value => {state.entities[0].defeated = value; updateMonsterHoverCursor();},
  unowned: value => {
    multiplayerSession.id = value ? 'test-only-room' : null;
    multiplayerSession.owned_character_ids = [];
    updateMonsterHoverCursor();
  },
  noCharacter: () => {state.characters = []; state.activeCharacterId = null; updateMonsterHoverCursor();},
  cacheSize: () => attackCursorCache.size,
};
"""

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1440, "height": 1000})
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.route("**/site/src/main.js", lambda route: route.fulfill(
        body=(ROOT / "S3_content/src/main.js").read_text(encoding="utf-8") + INSTRUMENT,
        content_type="text/javascript"))
    hero = {"name": "Cursor Hero", "class": "Fighter", "level": 1, "hp": 8,
            "maxHitPoints": 8, "stats": {key: 12 for key in ["STR", "DEX", "CON", "INT", "WIS", "CHA"]},
            "gear": [{"name": "Torch", "quantity": 3}], "attacks": ["Sword: +2, 1d6, close"]}
    calls = []
    def import_character(route):
        calls.append(time.perf_counter())
        route.fulfill(json={"character_json": json.dumps(hero)})
    page.route("**/api/shadowdarklings/import", import_character)
    page.goto(BASE + "/site/")
    expect(page.locator("#status-text")).to_contain_text("Generated", timeout=90000)
    page.wait_for_function("window.__cursorTest?.ready()")
    expect(page.locator("#multiplayer-modal")).to_be_hidden()
    for count in range(1, 17):
        page.locator("#import-character-btn").click()
        expect(page.locator(".character-card")).to_have_count(count)
    page.locator("#import-character-btn").click()
    expect(page.locator("#characters-empty")).to_contain_text("16 active characters")
    assert len(calls) == 16
    point = page.evaluate("window.__cursorTest.place()")
    page.mouse.move(point["x"], point["y"])
    panel = page.locator(".map-panel")
    page.wait_for_function("document.querySelector('.map-panel').style.cursor.startsWith('url(')")
    page.evaluate("window.__cursorTest.color('cyan-bright')")
    cursor = panel.evaluate("el => el.style.cursor")
    assert cursor.endswith("1 1, crosshair"), cursor
    data_url = cursor.split('"')[1]
    pixels = page.evaluate("""async url => {
      const image = new Image(); image.src = url; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
      const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0);
      const rgba = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let transparent = 0, opaque = 0, wrongColor = 0;
      for (let i = 0; i < rgba.length; i += 4) {
        if (rgba[i+3] === 0) transparent++;
        if (rgba[i+3] === 255) {opaque++; if (rgba[i] !== 0 || rgba[i+1] !== 255 || rgba[i+2] !== 255) wrongColor++;}
      }
      return {width: image.width, height: image.height, transparent, opaque, wrongColor};
    }""", data_url)
    assert pixels["transparent"] == 2499 and pixels["opaque"] > 0 and pixels["wrongColor"] == 0, pixels
    (OUT / "cyan-cursor.png").write_bytes(base64.b64decode(data_url.split(",")[1]))
    cache_size = page.evaluate("window.__cursorTest.cacheSize()")
    for _ in range(10):
        page.mouse.move(point["x"] + 1, point["y"])
        page.mouse.move(point["x"], point["y"])
    assert page.evaluate("window.__cursorTest.cacheSize()") == cache_size
    for condition in ("hidden", "defeated", "unowned"):
        page.evaluate(f"window.__cursorTest.{condition}(true)")
        assert panel.evaluate("el => el.style.cursor") == "", condition
        page.evaluate(f"window.__cursorTest.{condition}(false)")
        assert panel.evaluate("el => el.style.cursor").startswith("url("), condition
    page.mouse.down()
    assert panel.evaluate("el => getComputedStyle(el).cursor") == "grabbing"
    page.mouse.move(point["x"] + 12, point["y"] + 12)
    page.mouse.up()
    page.mouse.move(1, 1)
    assert panel.evaluate("el => el.style.cursor") == ""
    page.locator("#zoom-in-btn").click()
    point = page.evaluate("window.__cursorTest.point()")
    page.mouse.move(point["x"], point["y"])
    assert panel.evaluate("el => el.style.cursor").startswith("url(")
    page.evaluate("window.__cursorTest.noCharacter()")
    assert panel.evaluate("el => el.style.cursor") == ""
    page.screenshot(path=str(OUT / "desktop.png"))
    page.goto(BASE + "/site/?join=!")
    expect(page.locator("#status-text")).to_contain_text("invitation is invalid", timeout=90000)
    expect(page.locator("#multiplayer-modal")).to_be_hidden()
    page.locator("#multiplayer-btn").click()
    expect(page.locator("#multiplayer-modal")).to_be_visible()
    page.set_viewport_size({"width": 390, "height": 844})
    page.screenshot(path=str(OUT / "mobile.png"))
    assert not errors, errors
    print(json.dumps({"imports_with_mock_upstream": len(calls), "cursor_pixels": pixels,
                      "popup": "explicit button only", "errors": errors}, indent=2))
    browser.close()
