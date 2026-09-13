import { describe, expect, it } from "vitest";
import { isFirebaseConfigured, readFirebaseConfig } from "./firebaseConfig";

const validConfig = {
  VITE_FIREBASE_API_KEY: "key",
  VITE_FIREBASE_AUTH_DOMAIN: "app.firebaseapp.com",
  VITE_FIREBASE_PROJECT_ID: "app",
  VITE_FIREBASE_APP_ID: "1:1:web:1",
};

describe("firebaseConfig", () => {
  it("reports unconfigured when any VITE_FIREBASE_* value is missing", () => {
    expect(isFirebaseConfigured({})).toBe(false);
    expect(readFirebaseConfig({ ...validConfig, VITE_FIREBASE_APP_ID: undefined })).toBeNull();
  });

  it("reports configured and reads all fields when fully set", () => {
    expect(isFirebaseConfigured(validConfig)).toBe(true);
    expect(readFirebaseConfig(validConfig)).toEqual({
      apiKey: "key",
      authDomain: "app.firebaseapp.com",
      projectId: "app",
      appId: "1:1:web:1",
    });
  });
});
