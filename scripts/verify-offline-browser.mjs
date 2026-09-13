import { spawn } from "node:child_process";

const port = process.env.POCKETCH_CDP_PORT ?? "9226";
const chromePath = process.env.POCKETCH_CHROME_PATH;
const pageUrl = process.env.POCKETCH_URL ?? "http://127.0.0.1:4173/";
let browser;

if (chromePath) {
  const profile = process.env.POCKETCH_CHROME_PROFILE;
  if (!profile) throw new Error("POCKETCH_CHROME_PROFILE is required when launching Chrome.");
  browser = spawn(chromePath, [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    pageUrl,
  ], { stdio: "ignore" });
}

async function fetchTargets() {
  try {
    return await fetch(`http://127.0.0.1:${port}/json`).then((response) => response.json());
  } catch {
    return undefined;
  }
}

let targets;
let page;
for (let attempt = 0; attempt < 60 && !page; attempt += 1) {
  targets = await fetchTargets();
  page = targets?.find((target) => target.type === "page" && target.url.startsWith(pageUrl));
  if (!page) await new Promise((resolve) => setTimeout(resolve, 250));
}
if (!page) throw new Error(`Chrome did not open ${pageUrl} on CDP port ${port}.`);

const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});

let nextId = 0;
const pending = new Map();
socket.addEventListener("message", ({ data }) => {
  const message = JSON.parse(data);
  if (!message.id || !pending.has(message.id)) return;
  const { resolve, reject } = pending.get(message.id);
  pending.delete(message.id);
  if (message.error) reject(new Error(message.error.message));
  else resolve(message.result);
});

function send(method, params = {}) {
  const id = ++nextId;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

async function evaluate(expression) {
  const result = await send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
}

async function waitFor(predicate, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if (await predicate()) return;
    } catch (error) {
      if (!error.message.includes("Execution context was destroyed")) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Timed out waiting for the offline page to load.");
}

try {
  await Promise.all([send("Runtime.enable"), send("Page.enable"), send("Network.enable")]);

  let cacheState;
  await waitFor(async () => {
    cacheState = await evaluate(`(async () => {
      if (!("serviceWorker" in navigator)) return undefined;
      const registration = await navigator.serviceWorker.ready;
      const names = await caches.keys();
      const entries = await Promise.all(names.map(async (name) => (await caches.open(name)).keys()));
      return {
        controlled: Boolean(navigator.serviceWorker.controller),
        active: Boolean(registration.active),
        caches: names,
        entryCount: entries.reduce((count, list) => count + list.length, 0),
      };
    })()`);
    return cacheState?.controlled && cacheState.active && cacheState.entryCount > 0;
  }, 180_000);

  if (!cacheState.controlled || !cacheState.active || cacheState.entryCount === 0) {
    throw new Error(`Service worker cache is not ready: ${JSON.stringify(cacheState)}`);
  }

  await send("Network.emulateNetworkConditions", {
    offline: true,
    latency: 0,
    downloadThroughput: 0,
    uploadThroughput: 0,
  });
  await send("Page.reload");
  await waitFor(async () => evaluate(
    `document.readyState === "complete" && document.title === "Pocketch" && document.body.innerText.includes("POCKETCH")`,
  )).catch(async (error) => {
    const pageState = await evaluate(`({
      readyState: document.readyState,
      title: document.title,
      body: document.body.innerText.slice(0, 200),
      url: location.href,
    })`).catch(() => undefined);
    throw new Error(`${error.message} Page state: ${JSON.stringify(pageState)}`);
  });

  const result = await evaluate(`({ title: document.title, online: navigator.onLine })`);
  console.log(JSON.stringify({ cacheState, offlineReload: result }, null, 2));
} finally {
  await send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 0,
    downloadThroughput: -1,
    uploadThroughput: -1,
  }).catch(() => undefined);
  if (browser) {
    await Promise.race([
      send("Browser.close").catch(() => undefined),
      new Promise((resolve) => setTimeout(resolve, 3_000)),
    ]);
    browser.kill();
  }
  socket.close();
}
