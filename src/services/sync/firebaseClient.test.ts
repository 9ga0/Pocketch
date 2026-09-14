import { beforeEach, describe, expect, it, vi } from "vitest";

const initializeApp = vi.fn((_config: unknown) => ({ name: "test-app" }));
const getApps = vi.fn(() => [] as unknown[]);
const signInAnonymously = vi.fn((_auth: unknown) => Promise.resolve({ user: { uid: "" } }));
const getAuth = vi.fn((_app: unknown) => ({ currentUser: null as { uid: string } | null }));
const getFirestore = vi.fn((_app: unknown) => ({}));

vi.mock("firebase/app", () => ({
  initializeApp: (config: unknown) => initializeApp(config),
  getApps: () => getApps(),
}));
vi.mock("firebase/auth", () => ({
  getAuth: (app: unknown) => getAuth(app),
  signInAnonymously: (auth: unknown) => signInAnonymously(auth),
}));
vi.mock("firebase/firestore", () => ({
  getFirestore: (app: unknown) => getFirestore(app),
}));

const validConfig = {
  VITE_FIREBASE_API_KEY: "key",
  VITE_FIREBASE_AUTH_DOMAIN: "app.firebaseapp.com",
  VITE_FIREBASE_PROJECT_ID: "app",
  VITE_FIREBASE_APP_ID: "1:1:web:1",
};

describe("firebaseClient", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    getApps.mockReturnValue([]);
    getAuth.mockReturnValue({ currentUser: null });
    const { resetFirebaseClientForTests } = await import("./firebaseClient");
    resetFirebaseClientForTests();
  });

  it("throws FirebaseConfigError from getFirebaseServices when unconfigured", async () => {
    const { getFirebaseServices, FirebaseConfigError } = await import("./firebaseClient");
    expect(() => getFirebaseServices()).toThrow(FirebaseConfigError);
  });

  it("signs in anonymously once and reuses the in-flight promise", async () => {
    vi.stubEnv("VITE_FIREBASE_API_KEY", validConfig.VITE_FIREBASE_API_KEY);
    vi.stubEnv("VITE_FIREBASE_AUTH_DOMAIN", validConfig.VITE_FIREBASE_AUTH_DOMAIN);
    vi.stubEnv("VITE_FIREBASE_PROJECT_ID", validConfig.VITE_FIREBASE_PROJECT_ID);
    vi.stubEnv("VITE_FIREBASE_APP_ID", validConfig.VITE_FIREBASE_APP_ID);
    signInAnonymously.mockResolvedValue({ user: { uid: "anon-uid" } });

    const { ensureAnonymousUid } = await import("./firebaseClient");
    const [first, second] = await Promise.all([ensureAnonymousUid(), ensureAnonymousUid()]);
    expect(first).toBe("anon-uid");
    expect(second).toBe("anon-uid");
    expect(signInAnonymously).toHaveBeenCalledTimes(1);
    vi.unstubAllEnvs();
  });
});
