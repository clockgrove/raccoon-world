#!/usr/bin/env node
// Runs the Stevie comparison (clockgrove/clockgrove#77, re-run through Clockgrove's product renderer): builds the
// page, serves it, launches a browser itself (Node built-ins only, so the same command drives WSL Chromium,
// Windows Edge from WSL and CI's Chrome) and receives each shot the page posts as soon as it is taken.
//
//   node spikes/stevie-3d/scripts/stevie.mjs --out <dir> [--browser <exe>] [--browser-arg=<flag>]... [--software]
//        [--backends webgpu,webgl2] [--arms a,b] [--mode full|smoke] [--label <host>] [--host 127.0.0.1]
//        [--stall-ms 180000] [--no-build]
//
// Writes <out>/<backend>/<arm>/<state>/<shot>.png, <out>/sheets/<name>.png and <out>/results.json.
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { build } from "./build.mjs";

const spike = fileURLToPath(new URL("..", import.meta.url));
const repo = path.resolve(spike, "../..");
const dist = path.join(spike, "dist");
const SOFTWARE_FLAGS = [
  "--enable-unsafe-swiftshader",
  "--use-webgpu-adapter=swiftshader",
  "--use-angle=swiftshader",
  "--enable-features=Vulkan",
  "--use-vulkan=swiftshader",
];
const READ_ONLY_ROOTS = ["references/", "docs/design/reference/", "assets/reviewed/"];
const TYPES = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".wasm": "application/wasm",
  ".glb": "model/gltf-binary",
  ".ktx2": "image/ktx2",
};
const MIN_VISIBLE = 40;

const { values } = parseArgs({
  options: {
    out: { type: "string" },
    browser: { type: "string" },
    "browser-arg": { type: "string", multiple: true, default: [] },
    software: { type: "boolean", default: false },
    backends: { type: "string", default: "webgpu,webgl2" },
    arms: { type: "string" },
    mode: { type: "string", default: "full" },
    label: { type: "string" },
    host: { type: "string", default: "127.0.0.1" },
    "stall-ms": { type: "string", default: "180000" },
    "no-build": { type: "boolean", default: false },
  },
});
if (!values.out) throw new Error("--out <dir> is required");
if (!["full", "smoke"].includes(values.mode)) throw new Error("--mode is full or smoke");
const out = path.resolve(values.out);
const stallMs = Number(values["stall-ms"]);
const backends = values.backends.split(",").filter(Boolean);
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const safe = (name) => name.replace(/[^\w.-]/gu, "_");

function findBrowser() {
  if (values.browser) return values.browser;
  for (const name of ["google-chrome", "chromium", "chromium-browser"]) {
    const found = spawnSync("which", [name], { encoding: "utf8" });
    if (found.status === 0) return found.stdout.trim();
  }
  throw new Error("no browser: pass --browser or install google-chrome, chromium or chromium-browser");
}

// ---- the run the server currently feeds
let run;
const touch = (step) => {
  if (!run) return;
  run.lastMessage = Date.now();
  if (step) run.lastStep = step;
};
async function handleRun(request, response, endpoint) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  response.end("ok");
  if (!run) return;
  const body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  if (endpoint === "log") {
    console.log(`  [${run.backend}] ${body.line}`);
    touch(body.line);
  } else if (endpoint === "shot") {
    const { png, ...record } = body;
    const bytes = Buffer.from(png.replace(/^data:image\/png;base64,/u, ""), "base64");
    const file = path.join(run.backend, safe(record.arm), record.state, `${safe(record.shot)}.png`);
    await mkdir(path.dirname(path.join(out, file)), { recursive: true });
    await writeFile(path.join(out, file), bytes);
    run.shots.push({ ...record, path: file.split(path.sep).join("/"), bytes: bytes.length, sha256: sha256(bytes) });
    touch(`shot ${record.arm} ${record.state} ${record.shot}`);
  } else if (endpoint === "sheet") {
    const bytes = Buffer.from(body.png.replace(/^data:image\/png;base64,/u, ""), "base64");
    const file = path.join("sheets", `${safe(body.name)}.png`);
    await mkdir(path.join(out, "sheets"), { recursive: true });
    await writeFile(path.join(out, file), bytes);
    run.sheets.push({ name: body.name, path: file.split(path.sep).join("/"), width: body.width, height: body.height, bytes: bytes.length, sha256: sha256(bytes) });
    touch(`sheet ${body.name}`);
  } else if (endpoint === "done") {
    run.summary = body;
    touch("done");
    run.finish({ ok: true });
  } else if (endpoint === "fatal") {
    run.finish({ ok: false, reason: `page failed: ${body.message}\n${body.stack ?? ""}` });
  }
}

async function serveFile(file, response) {
  try {
    const body = await readFile(file);
    response.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream" });
    response.end(body);
  } catch {
    response.writeHead(404).end("not found");
  }
}
const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", "http://x");
    const pathname = decodeURIComponent(url.pathname);
    if (request.method === "POST" && pathname.startsWith("/run/")) return await handleRun(request, response, pathname.slice(5));
    if (pathname.startsWith("/repo/")) {
      const relative = pathname.slice(6);
      if (relative.split("/").includes("..") || relative.includes("\\") || !READ_ONLY_ROOTS.some((root) => relative.startsWith(root)))
        return void response.writeHead(403).end("forbidden");
      const file = path.resolve(repo, relative);
      if (!file.startsWith(repo + path.sep)) return void response.writeHead(403).end("forbidden");
      return await serveFile(file, response);
    }
    const relative = pathname === "/" ? "stevie.html" : pathname.slice(1);
    if (relative.split("/").includes("..")) return void response.writeHead(403).end("forbidden");
    await serveFile(path.join(dist, relative), response);
  } catch (error) {
    if (!response.headersSent) response.writeHead(500);
    response.end(String(error));
    run?.finish({ ok: false, reason: `runner failed handling ${request.url}: ${error?.stack ?? error}` });
  }
});

async function runBackend(backend, browser, port) {
  const given = values["browser-arg"].find((arg) => arg.startsWith("--user-data-dir="));
  const profile = given ? undefined : await mkdtemp(path.join(os.tmpdir(), "stevie-profile-"));
  const query = new URLSearchParams({ backend, mode: values.mode, post: "/run" });
  if (values.arms) query.set("arms", values.arms);
  const url = `http://${values.host}:${port}/stevie.html?${query}`;
  const args = [
    "--headless=new",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-timer-throttling",
    "--disable-renderer-backgrounding",
    "--disable-backgrounding-occluded-windows",
    ...(profile ? [`--user-data-dir=${profile}`] : []),
    ...(backend === "webgpu" ? ["--enable-unsafe-webgpu"] : []),
    ...(values.software ? SOFTWARE_FLAGS : []),
    ...values["browser-arg"],
    url,
  ];
  let stderr = "";
  const child = spawn(browser, args, { stdio: ["ignore", "ignore", "pipe"] });
  child.stderr.on("data", (chunk) => {
    stderr = (stderr + chunk).slice(-4000);
  });
  const outcome = new Promise((resolve) => {
    run = { backend, shots: [], sheets: [], summary: undefined, lastMessage: Date.now(), lastStep: "browser launched", finish: resolve };
    child.on("error", (error) => resolve({ ok: false, reason: `could not start ${browser}: ${error.message}` }));
    child.on("exit", (code, signal) => {
      if (run?.backend === backend && !run.summary)
        resolve({ ok: false, reason: `browser exited (${signal ?? code}) before the run finished; last step: ${run.lastStep}` });
    });
    const timer = setInterval(() => {
      if (Date.now() - run.lastMessage > stallMs)
        resolve({ ok: false, reason: `no message from the page for ${stallMs} ms; last step: ${run.lastStep}` });
    }, 1000);
    run.stop = () => clearInterval(timer);
  });
  console.log(`${backend}: ${browser} ${values.software ? "(software flags) " : ""}-> ${url}`);
  const result = await outcome;
  run.stop();
  const finished = run;
  child.kill("SIGKILL");
  run = undefined;
  if (profile) await rm(profile, { recursive: true, force: true, maxRetries: 5 }).catch(() => {});
  if (!result.ok) throw new Error(`${backend}: ${result.reason}\nbrowser stderr tail:\n${stderr}`);
  return { ...finished, args };
}

// ---- main
const started = new Date().toISOString();
await mkdir(out, { recursive: true });
if (!values["no-build"]) await build();
const pin = JSON.parse(await readFile(path.join(dist, "build.json"), "utf8")).clockgrove;
const browser = findBrowser();
await new Promise((resolve) => server.listen(0, values.host, resolve));
const port = server.address().port;
const results = {
  clockgrove: pin,
  label: values.label ?? os.hostname(),
  platform: `${os.platform()} ${os.release()} ${os.arch()}`,
  browser,
  browserArgs: [],
  mode: values.mode,
  software: values.software,
  started,
  finished: "",
  backends: {},
  shots: [],
  sheets: [],
  inputs: {},
};
let failure;
try {
  for (const backend of backends) {
    const finished = await runBackend(backend, browser, port);
    results.browserArgs = finished.args.slice(0, -1);
    results.shots.push(...finished.shots);
    results.sheets.push(...finished.sheets);
    results.backends[backend] = finished.summary;
    for (const arm of finished.summary.arms)
      for (const input of arm.inputs) {
        const file = path.resolve(repo, input);
        results.inputs[input] = file.startsWith(repo + path.sep) && existsSync(file) ? sha256(await readFile(file)) : null;
      }
    if (finished.summary.software && values.software)
      for (const t of finished.summary.frameTimes)
        console.log(`  ${t.arm} ${t.state}: adapter frame mean ${t.adapterFrameMs.mean.toFixed(1)} ms (software, not performance)`);
    if (values.mode === "smoke") {
      for (const arm of finished.summary.arms) {
        const shot = finished.shots.find((s) => s.arm === arm.name);
        if (!shot) throw new Error(`${backend}: no shot for arm ${arm.name}`);
        console.log(`${arm.name} ${backend}: backend ${shot.backend}, renderer "${shot.renderer}", visiblePixels ${shot.visiblePixels}`);
        if (shot.backend !== backend) throw new Error(`${arm.name}: asked for ${backend}, the renderer came up on ${shot.backend}`);
        if (shot.visiblePixels < MIN_VISIBLE) throw new Error(`${arm.name} on ${backend}: only ${shot.visiblePixels} visible pixels (need ${MIN_VISIBLE})`);
      }
    } else {
      const wrong = finished.shots.find((s) => s.backend !== backend);
      if (wrong) throw new Error(`asked for ${backend}, the renderer came up on ${wrong.backend}`);
      const hidden = finished.shots.filter((s) => !s.visible);
      for (const s of hidden) console.warn(`  warning: ${backend} ${s.arm} ${s.state} ${s.shot}: only ${s.visiblePixels} visible pixels`);
    }
    console.log(`${backend}: ${finished.shots.length} shots, ${finished.sheets.length} sheets`);
  }
} catch (error) {
  failure = error;
}
results.finished = new Date().toISOString();
await writeFile(path.join(out, "results.json"), `${JSON.stringify(results, null, 2)}\n`);
server.close();
if (failure) {
  console.error(failure.message);
  process.exit(1);
}
console.log(`wrote ${path.join(out, "results.json")}`);
process.exit(0);
