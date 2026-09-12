import { StatusPanel } from "../../components/StatusPanel";

export function RankingPage() {
  return (
    <div className="centered-page">
      <StatusPanel title="아직 기록이 없어요">
        <p>게임을 완료하면 이 기기의 상위 기록이 여기에 표시됩니다.</p>
      </StatusPanel>
    </div>
  );
}
