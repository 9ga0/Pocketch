export type OfflineStatus = "unsupported" | "preparing" | "ready" | "offline" | "update-ready" | "error";

let registration: ServiceWorkerRegistration | null = null;

export function registerOfflineWorker(onStatus: (status: OfflineStatus) => void): () => void {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) { onStatus("unsupported"); return () => undefined; }
  let disposed = false;
  const emit = (status: OfflineStatus) => { if (!disposed) onStatus(status); };
  const connectivity = () => emit(navigator.onLine ? "ready" : "offline");
  const controllerChange = () => window.location.reload();
  window.addEventListener("online", connectivity);
  window.addEventListener("offline", connectivity);
  navigator.serviceWorker.addEventListener("controllerchange", controllerChange);
  emit("preparing");

  void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, {
    scope: import.meta.env.BASE_URL,
    updateViaCache: "none",
  }).then(async (workerRegistration) => {
    registration = workerRegistration;
    if (workerRegistration.waiting) emit("update-ready");
    workerRegistration.addEventListener("updatefound", () => {
      const worker = workerRegistration.installing;
      worker?.addEventListener("statechange", () => {
        if (worker.state === "installed" && navigator.serviceWorker.controller) emit("update-ready");
        if (worker.state === "redundant") emit(navigator.serviceWorker.controller ? (navigator.onLine ? "ready" : "offline") : "error");
      });
    });
    await navigator.serviceWorker.ready;
    connectivity();
  }).catch(() => emit("error"));

  return () => {
    disposed = true;
    window.removeEventListener("online", connectivity);
    window.removeEventListener("offline", connectivity);
    navigator.serviceWorker.removeEventListener("controllerchange", controllerChange);
  };
}

export function activateOfflineUpdate() {
  registration?.waiting?.postMessage({ type: "SKIP_WAITING" });
}
