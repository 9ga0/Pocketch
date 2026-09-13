import { useEffect, useState } from "react";
import { activateOfflineUpdate, registerOfflineWorker, type OfflineStatus as Status } from "../services/offline/offline";

const labels: Partial<Record<Status, string>> = {
  preparing: "오프라인 준비 중",
  ready: "오프라인 준비 완료",
  offline: "오프라인 사용 중",
  "update-ready": "업데이트 준비됨",
  error: "오프라인 준비 실패",
};

export function OfflineStatus() {
  const [status, setStatus] = useState<Status>("unsupported");
  useEffect(() => registerOfflineWorker(setStatus), []);
  if (status === "unsupported") return null;
  if (status === "update-ready") return <button className="offline-status offline-status--action" onClick={activateOfflineUpdate}>{labels[status]}</button>;
  return <span className={`offline-status offline-status--${status}`} role="status">{labels[status]}</span>;
}
