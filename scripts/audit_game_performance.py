"""Repeatable local browser timing and CPU profile without production data."""
import argparse
from collections import defaultdict
import hashlib
import json
import os
from pathlib import Path
import statistics
import subprocess
import sys
import tempfile
import threading
import time

from playwright.sync_api import sync_playwright, expect
from werkzeug.serving import make_server, WSGIRequestHandler

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


class QuietHandler(WSGIRequestHandler):
    def log(self, *args, **kwargs):
        pass


INSTRUMENT = r"""
const auditSamples = {};
for (const [name, original, replace] of [
  ['movement', applyLocalMovement, fn => applyLocalMovement = fn],
  ['render', render, fn => render = fn],
  ['panels', updatePanels, fn => updatePanels = fn],
  ['characters', updateCharactersUi, fn => updateCharactersUi = fn],
]) {
  replace(function (...args) {
    const started = performance.now();
    try { return original(...args); }
    finally { (auditSamples[name] ||= []).push(performance.now() - started); }
  });
}
window.__gameAudit = {
  samples: auditSamples,
  state: () => ({x: state.player.x, y: state.player.y, characters: state.characters.length,
    tiles: state.tiles.length, rooms: state.rooms.length, shared: isSharedRoom()}),
  visibility: () => ({visible: [...state.visibility.visibleNow].sort(),
    explored: [...state.visibility.exploredEver].sort()}),
  nextMove: () => {
    const {x, y} = state.player;
    return [[1,0,'ArrowRight'],[-1,0,'ArrowLeft'],[0,1,'ArrowDown'],[0,-1,'ArrowUp']]
      .find(([dx,dy]) => canMoveBetweenTiles(state, x, y, x+dx, y+dy))?.[2];
  },
};
"""


def summarize(values):
    ordered = sorted(values)
    return {"count": len(values), "median_ms": round(statistics.median(values), 2),
            "p95_ms": round(ordered[min(len(ordered)-1, int(len(ordered)*.95))], 2),
            "total_ms": round(sum(values), 2)} if values else {}


def run(args):
    with tempfile.TemporaryDirectory(prefix="sd-audit-") as tmp:
        os.environ.update(DATABASE_URL="sqlite:///" + str(Path(tmp) / "audit.db"),
            SECRET_KEY="isolated-performance-test-secret", OAUTH_CLIENT_ID="test",
            OAUTH_CLIENT_SECRET="test", FLASK_ENV="development", PUBLIC_BASE_URL="",
            ALLOW_ANON_SHADOWDARKLINGS_IMPORT="1", SHADOWDARKLINGS_IMPORT_ENABLED="1",
            RATELIMIT_STORAGE_URI="memory://")
        from app import app, engine
        server = make_server("127.0.0.1", 0, app, threaded=True, request_handler=QuietHandler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        base = f"http://127.0.0.1:{server.server_port}"
        report = {"base": base, "errors": [], "failed_requests": []}
        output = ROOT / "browser-checks" / args.label
        output.mkdir(parents=True, exist_ok=True)
        try:
            with sync_playwright() as p:
                browser = p.chromium.launch(headless=True)
                context = browser.new_context(viewport={"width":1440,"height":1000})
                page = context.new_page()
                page.add_init_script("performance.setResourceTimingBufferSize(5000)")
                page.add_init_script("let auditSeed = 12345; Math.random = () => ((auditSeed = (Math.imul(auditSeed, 1664525) + 1013904223) >>> 0) / 4294967296)")
                page.on("pageerror", lambda exc: report["errors"].append(str(exc)))
                page.on("requestfailed", lambda request: report["failed_requests"].append({"url":request.url,"error":request.failure}))
                def script_source(route):
                    relative = "S3_content/src/" + route.request.url.split("/src/")[-1]
                    source = subprocess.check_output(["git", "show", f"{args.revision}:{relative}"],cwd=ROOT).decode("utf-8") if args.revision else (ROOT / relative).read_text(encoding="utf-8")
                    if relative.endswith("/main.js"):
                        source += INSTRUMENT
                    if relative.endswith("/render.js"):
                        source += "\nwindow.__artReady = () => rendererAssets.ready;"
                    route.fulfill(body=source,content_type="text/javascript")
                page.route("**/site/src/*.js", script_source)
                if args.latency_ms:
                    network = context.new_cdp_session(page)
                    network.send("Network.enable")
                    network.send("Network.emulateNetworkConditions", {"offline":False,"latency":args.latency_ms,"downloadThroughput":12500000,"uploadThroughput":12500000})
                if not args.live_import:
                    hero = {"name":"Audit Hero", "class":"Fighter", "stats":{key:12 for key in ["STR","DEX","CON","INT","WIS","CHA"]},
                        "level":1,"hp":8,"maxHitPoints":8,"armorClass":12,"gear":[{"name":"Torch","quantity":3}],"attacks":["Sword: +2, 1d6, close"]}
                    page.route("**/api/shadowdarklings/import", lambda route: route.fulfill(json={"character_json":json.dumps(hero)}))
                started = time.perf_counter()
                page.goto(base + "/site/", wait_until="domcontentloaded", timeout=30000)
                expect(page.locator('#status-text')).to_contain_text('Generated', timeout=90000)
                report["startup_ms"] = round((time.perf_counter()-started)*1000,2)
                page.wait_for_function("() => window.__artReady?.() === true",timeout=90000)
                report["all_art_ready_ms"] = round((time.perf_counter()-started)*1000,2)
                report["resources"] = page.evaluate("performance.getEntriesByType('resource').map(x => ({name:x.name.split('/site/').pop(),start:x.startTime,end:x.responseEnd,duration:x.duration,bytes:x.transferSize,type:x.initiatorType}))")
                report["navigation"] = page.evaluate("performance.getEntriesByType('navigation')[0].toJSON()")
                page.locator("#seed-input").fill("12345")
                started = time.perf_counter()
                page.locator("#generate-btn").click()
                expect(page.locator('#status-text')).to_contain_text('seed 12345.')
                report["generation_ms"] = round((time.perf_counter()-started)*1000,2)
                started = time.perf_counter()
                page.locator("#import-character-btn").click()
                expect(page.locator('#import-character-btn')).not_to_have_attribute('data-busy', 'true', timeout=50000)
                report["import_ms"] = round((time.perf_counter()-started)*1000,2)
                report["import_status"] = page.locator("#status-text").inner_text()
                report["initial_state"] = page.evaluate("window.__gameAudit.state()")
                page.locator("#map-host").focus()
                cdp = context.new_cdp_session(page)
                cdp.send("Profiler.enable")
                cdp.send("Profiler.setSamplingInterval", {"interval":1000})
                cdp.send("Profiler.start")
                page.evaluate("Object.keys(window.__gameAudit.samples).forEach(key => window.__gameAudit.samples[key] = [])")
                direction = page.evaluate("window.__gameAudit.nextMove()")
                reverse = {"ArrowRight":"ArrowLeft","ArrowLeft":"ArrowRight","ArrowDown":"ArrowUp","ArrowUp":"ArrowDown"}
                moved = 0
                for i in range(30):
                    before = page.evaluate("window.__gameAudit.state()")
                    page.keyboard.press(direction if i % 2 == 0 else reverse[direction])
                    after = page.evaluate("window.__gameAudit.state()")
                    moved += (before["x"],before["y"]) != (after["x"],after["y"])
                profile = cdp.send("Profiler.stop")["profile"]
                (output / "movement.cpuprofile").write_text(json.dumps(profile),encoding="utf-8")
                nodes = {node["id"]:node["callFrame"] for node in profile["nodes"]}
                parents = {child:node["id"] for node in profile["nodes"] for child in node.get("children",[])}
                groups = defaultdict(float)
                costs = defaultdict(float)
                for node_id, duration in zip(profile.get("samples",[]),profile.get("timeDeltas",[])):
                    frame = nodes[node_id]
                    costs[frame["functionName"] + " @ " + frame["url"].split("/site/")[-1]] += duration/1000
                    ancestry = []
                    cursor = node_id
                    while cursor in nodes:
                        ancestry.append(nodes[cursor]["functionName"])
                        cursor = parents.get(cursor)
                    if "applyLocalMovement" in ancestry:
                        category = next((name for name in ["updatePanels", "render", "recomputeVisibility", "movePlayer"] if name in ancestry), "other_movement")
                        groups[category] += duration/1000
                total = sum(groups.values())
                report["movement_cpu_share"] = {key:{"ms":round(value,2),"percent":round(value/total*100,1)} for key,value in groups.items()}
                report["cpu_top"] = [{"function":key,"ms":round(value,2)} for key,value in sorted(costs.items(), key=lambda item:-item[1])[:25]]
                report["movement_successes"] = moved
                assert moved == 30, f"Only {moved}/30 arrow presses moved the token"
                report["timings"] = {key:summarize(values) for key,values in page.evaluate("window.__gameAudit.samples").items()}
                report["visibility"] = page.evaluate("window.__gameAudit.visibility()")
                report["canvas_hashes"] = {
                    item["name"]: hashlib.sha256(item["data"].encode()).hexdigest()
                    for item in page.evaluate("[...document.querySelectorAll('#map-host canvas')].map(c => ({name:c.className,data:c.toDataURL()}))")
                }
                page.screenshot(path=str(output / "game.png"))
                if not args.revision:
                    offline_account = context.new_page()
                    pending_sessions = []
                    offline_account.route("**/api/session", lambda route: pending_sessions.append(route))
                    started = time.perf_counter()
                    offline_account.goto(base + "/site/", wait_until="domcontentloaded")
                    expect(offline_account.locator('#status-text')).to_contain_text('Generated', timeout=4000)
                    report["startup_with_stalled_account_ms"] = round((time.perf_counter()-started)*1000,2)
                    for route in pending_sessions:
                        route.fulfill(status=503, json={"error": "test_unavailable"})
                    offline_account.close()
                browser.close()
        finally:
            server.shutdown()
            thread.join(timeout=5)
            engine.dispose()
        (output / "report.json").write_text(json.dumps(report,indent=2),encoding="utf-8")
        print(json.dumps({key:value for key,value in report.items() if key not in {"resources","navigation"}},indent=2),flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--label", default="performance")
    parser.add_argument("--live-import", action="store_true")
    parser.add_argument("--revision")
    parser.add_argument("--latency-ms", type=float, default=0)
    run(parser.parse_args())
