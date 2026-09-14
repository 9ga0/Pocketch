import { createHash } from "node:crypto";
import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";

const outputDirectory = resolve("dist");
const backgroundAssets = resolve(outputDirectory, "background-removal");
const resources = JSON.parse(await readFile(resolve(backgroundAssets, "resources.json"), "utf8"));
const requiredResources = [
  "/models/isnet_quint8",
  "/onnxruntime-web/ort-wasm-simd-threaded.jsep.wasm",
  "/onnxruntime-web/ort-wasm-simd-threaded.wasm",
  "/onnxruntime-web/ort-wasm-simd-threaded.jsep.mjs",
  "/onnxruntime-web/ort-wasm-simd-threaded.mjs",
];
for (const key of requiredResources) {
  if (!resources[key]) throw new Error(`Missing offline resource manifest entry: ${key}`);
  for (const chunk of resources[key].chunks) {
    const content = await readFile(resolve(backgroundAssets, chunk.name));
    const digest = createHash("sha256").update(content).digest("hex");
    if (digest !== chunk.name) throw new Error(`Invalid offline resource chunk: ${chunk.name}`);
  }
}

const requiredMediaPipeAssets = [
  "magic_touch.tflite",
  "vision_wasm_internal.js",
  "vision_wasm_internal.wasm",
];
for (const fileName of requiredMediaPipeAssets) {
  const asset = await stat(resolve(outputDirectory, "mediapipe", fileName));
  if (!asset.isFile() || asset.size === 0) throw new Error(`Missing offline MediaPipe asset: ${fileName}`);
}

async function filesBelow(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...await filesBelow(path));
    else if (entry.name !== "sw.js") files.push(path);
  }
  return files;
}

const files = await filesBelow(outputDirectory);
const manifest = await Promise.all(files.map(async (path) => ({
  path: `./${relative(outputDirectory, path).split(sep).join("/")}`,
  size: (await stat(path)).size,
  digest: createHash("sha256").update(await readFile(path)).digest("hex"),
})));
manifest.sort((left, right) => left.path.localeCompare(right.path));
const revision = createHash("sha256").update(JSON.stringify(manifest)).digest("hex").slice(0, 16);

const source = `const CACHE_NAME = "pocketch-${revision}";
const PRECACHE_URLS = ${JSON.stringify(manifest.map(({ path }) => path), null, 2)};

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    try {
      for (let index = 0; index < PRECACHE_URLS.length; index += 4) {
        await Promise.all(PRECACHE_URLS.slice(index, index + 4).map(async (path) => {
          const url = new URL(path, self.registration.scope).href;
          const response = await fetch(url, { cache: "reload" });
          if (!response.ok) throw new Error(\`Failed to fetch \${url}: \${response.status}\`);
          await cache.put(url, response);
        }));
      }
    } catch (error) {
      await caches.delete(CACHE_NAME);
      throw error;
    }
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(
    keys.filter((key) => key.startsWith("pocketch-") && key !== CACHE_NAME).map((key) => caches.delete(key)),
  )).then(() => self.clients.claim()));
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  event.respondWith(caches.match(request).then(async (cached) => {
    if (cached) return cached;
    try { return await fetch(request); }
    catch (error) {
      if (request.mode === "navigate") {
        const shell = await caches.match(new URL("./index.html", self.registration.scope).href);
        if (shell) return shell;
      }
      throw error;
    }
  }));
});
`;

await writeFile(resolve(outputDirectory, "sw.js"), source, "utf8");
console.log(`Generated offline service worker ${revision} with ${manifest.length} precached files.`);
