import { useState } from "react";
import { CollectionPage } from "../features/collection/CollectionPage";
import { GamePage } from "../features/game/GamePage";
import { RankingPage } from "../features/ranking/RankingPage";
import { ConfirmDialog } from "../components/ConfirmDialog";

type AppMode = "collection" | "game" | "ranking";
const navigation: { mode: AppMode; label: string }[] = [
  { mode: "collection", label: "채집" },
  { mode: "game", label: "게임" },
  { mode: "ranking", label: "랭킹" },
];

export function App() {
  const [mode, setMode] = useState<AppMode>("collection");
  const [gameActive, setGameActive] = useState(false);
  const [pendingMode, setPendingMode] = useState<AppMode | null>(null);
  const navigate = (nextMode: AppMode) => {
    if (mode === "game" && gameActive && nextMode !== "game") { setPendingMode(nextMode); return; }
    setMode(nextMode);
  };
  return (
    <div className="app-shell">
      <header className="app-header">
        <button className="brand" onClick={() => navigate("collection")}>
          <span className="brand__mark" aria-hidden="true">P</span>
          <span>POCKETCH</span>
        </button>
        <nav aria-label="주요 메뉴">
          {navigation.map((item) => (
            <button
              key={item.mode}
              aria-current={mode === item.mode ? "page" : undefined}
              className="nav-button"
              onClick={() => navigate(item.mode)}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </header>
      <main>
        {mode === "collection" && <CollectionPage />}
        {mode === "game" && <GamePage navigationPause={pendingMode !== null} onGoToCollection={() => navigate("collection")} onGoToRanking={() => navigate("ranking")} onGameStateChange={setGameActive} />}
        {mode === "ranking" && <RankingPage />}
      </main>
      <ConfirmDialog
        open={pendingMode !== null}
        title="진행 중인 게임을 종료할까요?"
        description="현재 판은 랭킹에 저장되지 않으며 선택한 화면으로 이동합니다."
        confirmLabel="게임 종료 후 이동"
        onCancel={() => setPendingMode(null)}
        onConfirm={() => { if (pendingMode) setMode(pendingMode); setPendingMode(null); }}
      />
    </div>
  );
}
