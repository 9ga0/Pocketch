import { type FirebaseApp, getApps, initializeApp } from "firebase/app";
import { type Auth, getAuth, signInAnonymously } from "firebase/auth";
import { type Firestore, getFirestore } from "firebase/firestore";
import { readFirebaseConfig } from "./firebaseConfig";

export class FirebaseConfigError extends Error {
  constructor(message = "공유 기능을 사용하려면 Firebase 설정이 필요합니다. .env.local에 VITE_FIREBASE_* 값을 채워주세요.") {
    super(message);
    this.name = "FirebaseConfigError";
  }
}

export interface FirebaseServices {
  app: FirebaseApp;
  auth: Auth;
  firestore: Firestore;
}

let services: FirebaseServices | null = null;
let signInPromise: Promise<string> | null = null;

export function getFirebaseServices(): FirebaseServices {
  if (services) return services;
  const config = readFirebaseConfig();
  if (!config) throw new FirebaseConfigError();
  const app = getApps()[0] ?? initializeApp(config);
  services = { app, auth: getAuth(app), firestore: getFirestore(app) };
  return services;
}

export function ensureAnonymousUid(): Promise<string> {
  const { auth } = getFirebaseServices();
  if (auth.currentUser) return Promise.resolve(auth.currentUser.uid);
  if (!signInPromise) {
    signInPromise = signInAnonymously(auth)
      .then((credential) => credential.user.uid)
      .catch((error: unknown) => {
        signInPromise = null;
        throw error;
      });
  }
  return signInPromise;
}

export function resetFirebaseClientForTests(): void {
  services = null;
  signInPromise = null;
}
