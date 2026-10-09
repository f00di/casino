# Current Project Status

## Overall Completion

98% — repository implementation and all locally executable verification are complete. Only credentialed external Supabase/Render/GitHub deployment and live restore/production smoke tests remain.

## Completed

- [x] Inspected repository, Git status, and history; confirmed clean initial repository.
- [x] Established npm workspaces, strict TypeScript baseline, ESLint, Vitest, and environment template.
- [x] Added continuation guidance in `AGENTS.md`.
- [x] Implemented strict shared Zod contracts and stable error codes.
- [x] Implemented cryptographic shuffling, physical card IDs, SHA-256 deck commitments, verifier script, Poker evaluator/pots/betting, and Blackjack rules/accounting.
- [x] Added 60 passing unit/integration tests covering engines, rooms, reconnection, HTTP security, idempotency/version conflict, timeouts/recovery, audits, and hidden-card redaction.
- [x] Added Supabase migration, transactional repository, snapshot/event/action/audit persistence, startup recovery, server deadlines, host transfer, and per-room queues.
- [x] Implemented Express/Socket.IO server with strict CORS, Helmet, validation, rate limits, safe errors, structured logs, health check, and graceful shutdown.
- [x] Built responsive React/Vite/Tailwind landing, setup, lobby, Poker, Blackjack, chat, reconnect, accessibility, and reduced-motion experiences.
- [x] Added GitHub Actions CI/Pages workflows, Render blueprint, README, SECURITY.md, and production deployment checklist.
- [x] Lint, strict typecheck, production build, and unit/integration suite pass.
- [x] Added host-only lobby settings, permanent idempotent leave with reconnect-hash removal, active-player partial indexes, and abandoned-room expiry.
- [x] Added explicit offline Poker/Blackjack deadline recovery and multi-hand audit-history tests.
- [x] Completed responsive review at 1440, 1280, 768, 390, and 375 pixels with no horizontal overflow; visually inspected desktop and 390px landing screenshots.
- [x] Completed hidden-data/secret/forbidden-randomness/incomplete-marker searches and dependency audit (0 vulnerabilities).
- [x] Clean `npm ci`, 60 unit/integration tests, production build, compiled-server health smoke test, and all 4 Playwright tests pass.
- [x] Added guarded host session completion and an authenticated completed-session audit JSON download; Playwright verifies the download filename and both participants’ results transition.
- [x] 2026-10-08: Fixed CI lint on fresh checkouts (workspace `types` now point at `src`); production builds without `VITE_API_URL` no longer try `localhost:3001` and instead show "server is not online yet". Lint, typecheck, 60 tests, build and 4 Playwright tests pass.
- [x] 2026-10-08: Render readiness: root `build` now builds shared → game-engine → server → web (fresh checkouts failed because npm built server first); `render.yaml` uses `npm ci --include=dev` (NODE_ENV=production skipped TypeScript/tsx) and region `frankfurt`; added `0002_enable_rls.sql` (RLS on all tables, default privileges revoked from anon/authenticated). Lint, typecheck, 60 tests, build and 4 Playwright tests pass. Migrations not yet run against a real Postgres.

## In Progress

- [ ] External deployment validation requires user-owned Supabase, Render, and GitHub Pages credentials/settings.

## Remaining

- [ ] Apply migrations to the user’s Supabase project and perform a restore drill.
- [ ] Set GitHub Pages source to "GitHub Actions" (branch builds currently overwrite the app with the README).
- [ ] Deploy one Render instance and GitHub Pages, then perform HTTPS/WSS two-device production smoke tests.

## Last Successful Commands

- Dependency installation: `npm ci` passed; 463 packages audited, 0 vulnerabilities (2026-08-15).
- Lint: `npm run lint` passed (2026-08-15).
- Type checking: `npm run typecheck` passed (2026-08-15).
- Unit tests: `npm test` passed, 60 tests in 10 files (2026-08-15; loopback permission enabled).
- Integration tests: included above; room, recovery/deadline, redaction, config, and HTTP integration tests passed.
- Production build: `npm run build` passed; Vite bundle 350.12 kB JS / 110.05 kB gzip (2026-08-15).
- E2E tests: `npm run test:e2e` passed, 4 tests across desktop and mobile Chromium, including independent Poker/Blackjack contexts, reconnect, session completion, and authenticated audit download (2026-08-15).
- Production start smoke: compiled `npm start` served `/health` 200 on port 3011 and shut down cleanly (2026-08-15).

## Known Problems

- No failing local tests, type errors, lint errors, or build errors.
- Postgres migrations/recovery are implemented but were not run against a live Supabase project because no user credential was supplied.
- GitHub Pages, Render, DNS, HTTPS/WSS, backups, monitoring, and restore settings require external account configuration and remain unverified in production.
- Single authoritative backend instance is intentional; horizontal scaling remains unsupported until Redis/shared adapter/distributed locks are implemented.
- Chat is ephemeral by design; authoritative game actions and recovery state are persistent.

## Architecture Decisions

- npm workspaces under `apps/*` and `packages/*`.
- Strict TypeScript with ESM/NodeNext for shared and backend packages.
- Hash-based frontend routing will support GitHub Pages repository paths.
- Server-authoritative snapshots will be filtered through per-player view builders.
- PostgreSQL snapshots/events/processed actions will be committed atomically per action.
- Reconnect tokens will be random raw browser-held tokens; only peppered SHA-256 hashes persist.
- Deck commitments use SHA-256 over `nonce + canonical order`, with audit reveal only after session completion.
- Timers use server-owned absolute deadlines.
- One authoritative Render backend instance until shared adapters and distributed locks exist.

## Files Currently Being Worked On

- None. The working tree contains the completed stable milestone pending checkpoint commit.

## Exact Next Steps

1. Create Supabase project and add the server-only connection string to local/Render settings.
2. Run `npm run migrate` and verify tables, indexes, grants, backups, and restore procedure.
3. Deploy the single Render service from `render.yaml`; verify HTTPS `/health` and WSS.
4. Set the public GitHub Pages `VITE_API_URL`, enable Actions Pages, and deploy.
5. Add the exact Pages origin to `CLIENT_ORIGINS` and run two-device production Poker/Blackjack/reconnect smoke tests.
6. Configure uptime/error/resource alerts and record the deployed commit/rollback target.

## Original Requirements Status

- Repository/workspace/tooling: COMPLETE
- Shared contracts/server authority: COMPLETE
- Secure shuffle/audits: COMPLETE
- Texas Hold'em engine: COMPLETE
- Blackjack engine: COMPLETE
- Persistence/recovery/database: COMPLETE (live Supabase validation pending external credentials)
- Rooms/reconnect/timers/chat: COMPLETE
- Responsive accessible UI: COMPLETE
- Integration/E2E tests: COMPLETE
- GitHub Pages/Render/Supabase deployment: COMPLETE
- Documentation/security/release review: COMPLETE
