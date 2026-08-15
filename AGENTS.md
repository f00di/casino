# Friendly Card Room engineering guide

Read `CODEX_PROGRESS.md` completely and run `git status` before editing. Preserve working code and all user changes; never reset or discard unfinished work. Treat a user message of “continue” as an instruction to resume the first incomplete item in the progress record. Update that record during significant work and before ending a session, including exact failures and next commands.

Use server-authoritative state. Never leak another poker player's unrevealed hole cards, a hidden dealer card, future cards, deck/shoe order, reconnect tokens, password hashes, or audit secrets before reveal eligibility. Never trust browser-provided balances, cards, winners, pots, seats, legal actions, or state versions. Never use `Math.random()` for cards, identifiers, or security. Keep all chip/credit arithmetic integral.

After significant changes run the relevant commands, and before release run:

- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run build`
- `npm run test:e2e`

Critical poker invariants: total chip conservation, one authoritative turn, hidden-card privacy, correct independently eligible side pots, idempotent actions, and correct short-all-in reopening rules.

Critical blackjack invariants: exact integer balance accounting, hidden dealer-card privacy, natural-blackjack rules, deterministic dealer behavior from the committed shoe, and idempotent actions.

Record the exact next steps before ending. Stable milestones should be committed only after tests, diff review, progress update, and a secret scan.
