import { useState } from "react";
import { CollectionPage } from "../features/collection/CollectionPage";
import { GamePage } from "../features/game/GamePage";
import { RankingPage } from "../features/ranking/RankingPage";

type AppMode = "collection" | "game" | "ranking";
const navigation: { mode: AppMode; label: string }[] = [
  { mode: "collection", label: "채집" },
  { mode: "game", label: "게임" },
  { mode: "ranking", label: "랭킹" },
];

export function App() {
  const [mode, setMode] = useState<AppMode>("collection");
  return (
    <div className="app-shell">
      <header className="app-header">
        <button className="brand" onClick={() => setMode("collection")}>
          <span className="brand__mark" aria-hidden="true">P</span>
          <span>POCKETCH</span>
        </button>
        <nav aria-label="주요 메뉴">
          {navigation.map((item) => (
            <button
              key={item.mode}
              aria-current={mode === item.mode ? "page" : undefined}
              className="nav-button"
              onClick={() => setMode(item.mode)}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </header>
      <main>
        {mode === "collection" && <CollectionPage />}
        {mode === "game" && <GamePage onGoToCollection={() => setMode("collection")} />}
        {mode === "ranking" && <RankingPage />}
      </main>
    </div>
  );
}
