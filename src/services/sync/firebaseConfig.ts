// Firebase SDK를 실제로 불러오지 않는 설정 확인 전용 모듈.
// 공유 기능을 쓰지 않는 대다수 방문에서 무거운 firebase 번들이 초기 로드에 섞여 들어가지 않도록 분리한다.
export interface FirebaseWebConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
}

type EnvSource = Record<string, string | undefined>;

function defaultEnv(): EnvSource {
  return import.meta.env as unknown as EnvSource;
}

export function readFirebaseConfig(source: EnvSource = defaultEnv()): FirebaseWebConfig | null {
  const apiKey = source.VITE_FIREBASE_API_KEY;
  const authDomain = source.VITE_FIREBASE_AUTH_DOMAIN;
  const projectId = source.VITE_FIREBASE_PROJECT_ID;
  const appId = source.VITE_FIREBASE_APP_ID;
  if (!apiKey || !authDomain || !projectId || !appId) return null;
  return { apiKey, authDomain, projectId, appId };
}

export function isFirebaseConfigured(source?: EnvSource): boolean {
  return readFirebaseConfig(source) !== null;
}
