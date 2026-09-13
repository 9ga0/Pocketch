import { useState } from "react";
import { CollectionPage } from "../features/collection/CollectionPage";
import { SharedSessionPage } from "../features/collection/SharedSessionPage";
import { GamePage } from "../features/game/GamePage";
import { RankingPage } from "../features/ranking/RankingPage";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { OfflineStatus } from "../components/OfflineStatus";

type AppMode = "collection" | "game" | "ranking";
const navigation: { mode: AppMode; label: string }[] = [
  { mode: "collection", label: "채집" },
  { mode: "game", label: "게임" },
  { mode: "ranking", label: "랭킹" },
];

function readSharedSessionId(): string | null {
  return new URLSearchParams(window.location.search).get("session");
}

export function App() {
  const [sharedSessionId, setSharedSessionId] = useState<string | null>(() => readSharedSessionId());
  const [mode, setMode] = useState<AppMode>("collection");
  const [gameActive, setGameActive] = useState(false);
  const [pendingMode, setPendingMode] = useState<AppMode | null>(null);
  const navigate = (nextMode: AppMode) => {
    if (mode === "game" && gameActive && nextMode !== "game") { setPendingMode(nextMode); return; }
    setMode(nextMode);
  };
  const exitSharedSession = () => {
    window.history.replaceState(null, "", window.location.pathname);
    setSharedSessionId(null);
  };

  if (sharedSessionId) {
    return (
      <div className="app-shell">
        <header className="app-header">
          <button className="brand" onClick={exitSharedSession}>
            <span className="brand__mark" aria-hidden="true">P</span>
            <span>POCKETCH</span>
          </button>
          <div className="header-actions">
            <OfflineStatus />
          </div>
        </header>
        <main>
          <SharedSessionPage sessionId={sharedSessionId} onExit={exitSharedSession} />
        </main>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <button className="brand" onClick={() => navigate("collection")}>
          <span className="brand__mark" aria-hidden="true">P</span>
          <span>POCKETCH</span>
        </button>
        <div className="header-actions">
          <OfflineStatus />
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
        </div>
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
