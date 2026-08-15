import { CircleDollarSign, RotateCcw } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useGame } from "../game-context.js";
import { formatCredits } from "../lib.js";
import type { BlackjackHandView, BlackjackView, CardData } from "../types.js";
import { PlayingCard } from "../components/card.js";
import { ChatDrawer, RoomTools } from "../components/chrome.js";
import { Button, Input, Panel } from "../components/ui.js";

function handTotal(cards: CardData[]): { total: number; soft: boolean } {
  let total = cards.reduce(
    (sum, card) => sum + (card.rank === 14 ? 11 : Math.min(10, card.rank)),
    0,
  );
  let aces = cards.filter((card) => card.rank === 14).length;
  while (total > 21 && aces > 0) {
    total -= 10;
    aces -= 1;
  }
  return { total, soft: aces > 0 };
}

export function BlackjackPage({ game }: { game: BlackjackView }): ReactNode {
  const {
    room,
    session,
    blackjackAction,
    blackjackBet,
    blackjackInsurance,
    nextBlackjackRound,
  } = useGame();
  const [bet, setBet] = useState(10);
  if (room === undefined || session === undefined) return null;
  const me = game.players.find((player) => player.id === session.playerId);
  const names = new Map(
    room.players.map((player) => [player.id, player.displayName]),
  );
  const limits = room.settings.blackjack;
  const min = (limits?.minimumBet ?? 20) / 2;
  const max = (limits?.maximumBet ?? 1000) / 2;
  return (
    <main className="min-h-[calc(100vh-57px)] px-3 py-4">
      <div className="mx-auto mb-3 flex max-w-6xl items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[.22em] text-gold">
            Round {game.roundNumber}
          </p>
          <p className="text-sm capitalize text-muted">{game.phase}</p>
        </div>
        <RoomTools roomCode={room.roomCode} />
      </div>
      <section
        className="blackjack-table mx-auto max-w-6xl"
        aria-label="Blackjack table"
      >
        <div className="text-center">
          <p className="table-label">
            Dealer {game.dealerHoleRevealed ? "· final hand" : "· showing"}
          </p>
          <div className="mt-2 flex min-h-24 justify-center gap-2">
            {game.dealerCards.map((card) => (
              <PlayingCard key={card.physicalId} card={card} />
            ))}
            {!game.dealerHoleRevealed && game.dealerCards.length > 0 && (
              <PlayingCard hidden />
            )}
          </div>
          {game.dealerHoleRevealed && (
            <p className="mt-2 font-semibold">
              {handTotal(game.dealerCards).total}
            </p>
          )}
        </div>
        <div className="my-6 h-px bg-white/10" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {game.players.map((player) => (
            <div
              key={player.id}
              className={`rounded-2xl border p-3 ${player.id === session.playerId ? "border-gold/40 bg-gold/5" : "border-white/10 bg-black/10"} ${game.currentPlayerId === player.id ? "animate-pulseSoft" : ""}`}
            >
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <p className="max-w-40 truncate text-sm font-semibold">
                    {names.get(player.id) ?? "Player"}
                  </p>
                  <p className="text-xs text-gold">
                    {formatCredits(player.balance)} credits
                  </p>
                </div>
                {player.spectator && (
                  <span className="rounded-full bg-white/10 px-2 py-1 text-[10px] uppercase text-muted">
                    Spectating
                  </span>
                )}
              </div>
              <div className="grid gap-3">
                {player.hands.length === 0 ? (
                  <p className="py-8 text-center text-xs text-muted">
                    {player.sittingOut
                      ? "Sitting out this round"
                      : game.phase === "betting"
                        ? "Choosing a wager…"
                        : "No hand"}
                  </p>
                ) : (
                  player.hands.map((hand, index) => (
                    <BlackjackHand
                      key={index}
                      hand={hand}
                      active={
                        player.id === game.currentPlayerId &&
                        index === player.activeHandIndex
                      }
                    />
                  ))
                )}
              </div>
              {player.insuranceWager > 0 && (
                <p className="mt-2 text-xs text-muted">
                  Insurance: {formatCredits(player.insuranceWager)}
                </p>
              )}
            </div>
          ))}
        </div>
      </section>
      <Panel className="sticky bottom-2 z-30 mx-auto mt-4 max-w-3xl border-gold/20 bg-ink/95 backdrop-blur">
        <div className="flex flex-wrap items-center justify-center gap-2">
          {game.phase === "betting" &&
            me !== undefined &&
            !me.betSubmitted &&
            !me.spectator && (
              <>
                <label className="flex items-center gap-2">
                  <span className="text-sm text-muted">Wager</span>
                  <Input
                    type="number"
                    min={min}
                    max={Math.min(max, me.balance / 2)}
                    value={bet}
                    onChange={(event) => setBet(event.target.valueAsNumber)}
                    className="w-28"
                    aria-label="Wager in credits"
                  />
                </label>
                <Button
                  onClick={() => {
                    void blackjackBet(bet);
                  }}
                >
                  <CircleDollarSign size={16} className="mr-1 inline" /> Deal me
                  in
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    void blackjackBet(0, true);
                  }}
                >
                  Sit out
                </Button>
              </>
            )}
          {game.phase === "insurance" &&
            me !== undefined &&
            me.hands.length > 0 && (
              <>
                <span className="text-sm text-muted">Dealer shows an Ace.</span>
                <Button
                  onClick={() => {
                    void blackjackInsurance(true, me.hands[0]!.wager / 4);
                  }}
                >
                  Take insurance
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    void blackjackInsurance(false);
                  }}
                >
                  Decline
                </Button>
              </>
            )}
          {game.phase === "playing" &&
            game.currentPlayerId === session.playerId &&
            game.legalActions.map((action) => (
              <Button
                key={action}
                variant={
                  action === "surrender"
                    ? "danger"
                    : action === "stand"
                      ? "secondary"
                      : "primary"
                }
                className="capitalize"
                onClick={() => {
                  void blackjackAction(action);
                }}
              >
                {action}
              </Button>
            ))}
          {game.phase === "playing" &&
            game.currentPlayerId !== session.playerId && (
              <p className="py-2 text-sm text-muted">
                Waiting for{" "}
                {names.get(game.currentPlayerId ?? "") ?? "the next hand"}…
              </p>
            )}
          {game.phase === "settled" && (
            <div className="flex items-center gap-3">
              <RotateCcw size={18} className="text-gold" />
              <p className="text-sm">Round complete.</p>
              {room.players.find((player) => player.id === session.playerId)
                ?.isHost && (
                <Button onClick={() => void nextBlackjackRound()}>
                  Next round
                </Button>
              )}
            </div>
          )}
        </div>
      </Panel>
      {game.reshuffled && (
        <div
          className="fixed left-1/2 top-24 z-40 -translate-x-1/2 rounded-full border border-gold/30 bg-panel px-4 py-2 text-sm text-gold"
          role="status"
        >
          A fresh committed shoe is in play.
        </div>
      )}
      <div className="sr-only" aria-live="polite">
        {game.phase === "settled"
          ? "Blackjack round settled."
          : game.currentPlayerId === session.playerId
            ? "It is your turn."
            : ""}
      </div>
      <ChatDrawer />
    </main>
  );
}

function BlackjackHand({
  hand,
  active,
}: {
  hand: BlackjackHandView;
  active: boolean;
}): ReactNode {
  const total = handTotal(hand.cards);
  return (
    <div className={`rounded-xl p-2 ${active ? "bg-white/10" : "bg-black/10"}`}>
      <div className="flex min-h-16 justify-center -space-x-3">
        {hand.cards.map((card) => (
          <PlayingCard key={card.physicalId} card={card} small />
        ))}
      </div>
      <div className="mt-2 flex items-center justify-between text-xs">
        <span>
          {total.total}
          {total.soft ? " soft" : ""} · {formatCredits(hand.wager)} wager
        </span>
        {hand.outcome !== undefined && (
          <span
            className={`rounded-full px-2 py-1 font-semibold uppercase ${["win", "blackjack"].includes(hand.outcome) ? "bg-emerald-400/15 text-emerald-300" : hand.outcome === "push" ? "bg-white/10 text-gray-200" : "bg-danger/15 text-[#ffaaa2]"}`}
          >
            {hand.outcome}
          </span>
        )}
      </div>
    </div>
  );
}
