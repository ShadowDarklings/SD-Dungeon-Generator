import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createInterface } from "node:readline";
import { randomInt } from "node:crypto";
import { JSDOM } from "jsdom";

const contentRoot = fileURLToPath(new URL("../S3_content/", import.meta.url));
const html = await readFile(path.join(contentRoot, "index.html"), "utf8");
// Only the trusted local module is imported. DOM scripts and resource loading stay disabled.
const dom = new JSDOM(html, { url: "https://game-runtime.invalid/site/" });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.Image = dom.window.Image;
globalThis.__SD_SERVER_RUNTIME__ = true;
globalThis.fetch = async (input) => {
  const url = new URL(String(input), "https://game-runtime.invalid/site/");
  const allowedPath = /^\/site\/(?:data\/[a-z0-9-]+\.json|spells\/tier-[1-5]\.json|monsters-(?:[1-9]|10)\.json|traps\.json)$/;
  if (url.origin !== "https://game-runtime.invalid" || !allowedPath.test(url.pathname)) {
    throw new Error("Game runtime network access is disabled.");
  }
  const filename = path.resolve(contentRoot, "." + url.pathname.slice(5));
  const relative = path.relative(contentRoot, filename);
  if (relative.startsWith("..") || path.isAbsolute(relative) || !filename.endsWith(".json")) {
    throw new Error("Invalid game data path.");
  }
  return new Response(await readFile(filename), { headers: { "Content-Type": "application/json" } });
};
Math.random = () => randomInt(0, 0x100000000) / 0x100000000;
console.log = () => {};
const { executeGameCommand } = await import("../S3_content/src/main.js");
const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
for await (const line of lines) {
  try {
    if (Buffer.byteLength(line) > 6 * 1024 * 1024) throw new Error("Game state is too large.");
    const request = JSON.parse(line);
    const result = await executeGameCommand(request.state, request.command);
    process.stdout.write(JSON.stringify({ ok: true, ...result }) + "\n");
  } catch (error) {
    process.stdout.write(JSON.stringify({ ok: false, message: error.message || "Invalid game action." }) + "\n");
  }
}
dom.window.close();
