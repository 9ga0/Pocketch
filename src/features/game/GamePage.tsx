import { Button } from "../../components/Button";
import { StatusPanel } from "../../components/StatusPanel";

export function GamePage({ onGoToCollection }: { onGoToCollection: () => void }) {
  return (
    <div className="centered-page">
      <StatusPanel
        title="게임은 곧 시작됩니다"
        action={<Button variant="primary" onClick={onGoToCollection}>채집으로 이동</Button>}
      >
        <p>먼저 물건을 촬영하고 등록하면 캐치 게임에서 사용할 수 있습니다.</p>
      </StatusPanel>
    </div>
  );
}
