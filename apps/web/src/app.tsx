import type { ReactNode } from "react";
import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import {
  AppHeader,
  ConnectionBanner,
  EmptyState,
  Toasts,
} from "./components/chrome.js";
import { Button } from "./components/ui.js";
import { GameProvider, useGame } from "./game-context.js";
import { BlackjackPage } from "./pages/blackjack.js";
import { HomePage } from "./pages/home.js";
import { LobbyPage } from "./pages/lobby.js";
import { PokerPage } from "./pages/poker.js";
import { CreatePage, JoinPage } from "./pages/setup.js";

function RoomRoute(): ReactNode {
  const { room, game, session, clearSession, downloadAudit } = useGame();
  if (session === undefined) return <Navigate to="/join" replace />;
  if (room === undefined)
    return (
      <EmptyState>
        <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-gold border-t-transparent" />
        <h1 className="text-xl font-semibold">Restoring your table…</h1>
        <p className="mt-2 text-sm text-muted">
          Verifying your saved seat and requesting a fresh authoritative
          snapshot.
        </p>
      </EmptyState>
    );
  if (room.status === "lobby" || room.status === "starting")
    return <LobbyPage />;
  if (room.status === "completed")
    return (
      <EmptyState>
        <p className="text-xs uppercase tracking-widest text-gold">
          Session complete
        </p>
        <h1 className="mt-2 font-serif text-3xl text-cream">Good game.</h1>
        <p className="mt-3 text-sm text-muted">
          Download the session audit and verify each published deck commitment
          locally.
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <Button
            onClick={() => {
              void downloadAudit();
            }}
          >
            Download audit JSON
          </Button>
          <Button variant="secondary" onClick={clearSession}>
            Return home
          </Button>
        </div>
      </EmptyState>
    );
  if (game?.gameType === "poker") return <PokerPage game={game} />;
  if (game?.gameType === "blackjack") return <BlackjackPage game={game} />;
  return (
    <EmptyState>
      <h1 className="text-xl font-semibold">Synchronizing the game…</h1>
      <p className="mt-2 text-sm text-muted">
        The server is preparing a personalized snapshot.
      </p>
    </EmptyState>
  );
}

export function App(): ReactNode {
  return (
    <GameProvider>
      <HashRouter>
        <div className="min-h-screen bg-ink text-gray-100">
          <AppHeader />
          <ConnectionBanner />
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/create/:game" element={<CreatePage />} />
            <Route path="/join" element={<JoinPage />} />
            <Route path="/room" element={<RoomRoute />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          <Toasts />
        </div>
      </HashRouter>
    </GameProvider>
  );
}
