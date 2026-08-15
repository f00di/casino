# Production deployment checklist

Use this project-specific list for the initial single-instance release. Record evidence, owner, date, and deployed commit for each item.

## Frontend and browser

- [ ] `npm ci`, lint, strict typecheck, unit/integration tests, production build, and Playwright pass from a clean checkout.
- [ ] GitHub Pages uses Actions, the inferred repository base path, and the intended `main` commit.
- [ ] Public `VITE_API_URL` is HTTPS and contains no credentials; no hardcoded localhost remains in production output.
- [ ] Home, create, join, lobby, Poker, Blackjack, reconnect, results, and audit journeys work.
- [ ] Loading, empty, success, validation, version-conflict, lost-connection, retry, and server-unavailable states are understandable.
- [ ] Verify keyboard order, visible focus, screen-reader labels/live regions, contrast, 44px touch targets, and reduced/disabled motion.
- [ ] Review 1440px, 1280px, ~768px, 390px, 375px, and practical landscape layouts: cards/actions visible, names truncate, drawers/modals fit, chat does not cover action controls.
- [ ] Inspect browser console and Network payloads. Confirm no other hole cards, hidden dealer card, future cards, deck/shoe order, token/hash, password/hash, nonce/order, or database data.
- [ ] Static assets use Pages/CDN caching; personalized Socket/API data is never placed in a public cache.

## API, compute, and networking

- [ ] Render blueprint has exactly one Node 24 instance, suitable region/plan/memory, `0.0.0.0:$PORT`, `/health`, and deployment-to-commit traceability.
- [ ] HTTPS and WSS work from Pages and every approved custom origin; no mixed content.
- [ ] `CLIENT_ORIGINS` lists exact local/Pages/custom origins, without wildcard or paths.
- [ ] Helmet/security headers are present and tested without breaking WebSockets or required resources.
- [ ] Body/socket size limits, Zod validation, safe errors, and health behavior are verified.
- [ ] Room create/join, chat, and generic request/event limits work; add CDN/edge bot protection before advertising broadly.
- [ ] SIGTERM stops accepting actions, disconnects sockets, closes HTTP/database resources, and produces credential-free structured logs.
- [ ] Platform CPU, memory, connection, WebSocket, request, and deploy limits are understood; alerts cover resource pressure and error/latency spikes.
- [ ] Do not enable load balancing/multiple instances. Document future Redis adapter, pub/sub, distributed locks/deadlines, shared state, and synchronization work.

## Database, data, and recovery

- [ ] `DATABASE_URL` is server-only and uses the intended Supabase pool/SSL behavior; connection limits leave operational headroom.
- [ ] Migrations applied once and `schema_migrations` matches the release; schema, FKs, checks, unique constraints, and indexes reviewed.
- [ ] Browser `anon`/`authenticated` roles have no grants on authoritative tables; no Supabase key exists in the frontend.
- [ ] Starting equal balances, snapshots, events, processed actions, audit rows, and state versions commit atomically under conflict tests.
- [ ] Restart an active Poker and Blackjack room; reconnect seats/private state and resolve an offline-expired deadline.
- [ ] Supabase backups/PITR, retention, region, quota, and ownership are configured. Complete and time a staging restore test.
- [ ] Define snapshot/event/chat retention and personal-data minimization expectations; display names and connection metadata are the only intended user-provided identifiers.
- [ ] Audit export stays unavailable until completion and returns private/no-store responses only to a verified participant.

## Authentication, authorization, and game security

- [ ] Unique room names are case-insensitive; room password hashes and reconnect-token hashes are stored, never raw values.
- [ ] A room code cannot take over an occupied seat; reconnect requires room ID, player ID, and correct raw token.
- [ ] Out-of-turn, wrong-seat, stale-version, malformed, insufficient-balance, illegal-raise, duplicate-ID, and post-completion actions are rejected.
- [ ] Host can coordinate start/pause/next/end only; host cannot inspect private state, choose cards/winners, edit balances, or control dealer behavior.
- [ ] Review production routes/env/query parameters for deck injection, debug manipulation, hidden admin menus, and test-only controls.
- [ ] Poker chip conservation, full/short raise reopening, heads-up order, side-pot eligibility, ties/odd chips, folds, and runouts pass.
- [ ] Blackjack exact half-credit accounting, multiple aces, naturals, peek, soft 17, split aces/21, double, surrender, insurance, push, and insufficient funds pass.
- [ ] Verify no payment, deposit, withdrawal, purchase, crypto, cash-value, or stranger-pool feature; disclaimer remains visible.

## Secrets and version control

- [ ] Render contains unique 32+ character `SESSION_SECRET` and `ROOM_TOKEN_PEPPER`; Supabase/Render/GitHub administrator accounts use MFA.
- [ ] `.env`, credentials, URLs with passwords, tokens, private logs, and generated artifacts are ignored and absent from current files and Git history.
- [ ] If any secret was exposed, revoke/rotate it at the provider; source deletion alone is not remediation.
- [ ] Branch protection/review rules, CI required checks, dependency alerts, ownership, and emergency access are configured.
- [ ] Release notes identify migrations, deployed commit, environment changes, known limitations, and rollback boundary.

## Observability, availability, and operations

- [ ] Render, Supabase, and GitHub logs are accessible to on-call owners and contain no secrets/private cards/deck orders/payment data.
- [ ] External uptime monitoring checks `/health`; alerts cover failed deploys, error spikes, database failures, high latency, memory/CPU, and reconnect failures.
- [ ] Add production error tracking only with payload scrubbing tested; never attach complete authoritative state.
- [ ] DNS, Pages custom domain, HTTPS enforcement, canonical host choice, registrar/repository/cloud recovery owners, and MFA recovery codes are documented.
- [ ] Roll back application to the previous deploy without undoing a forward database migration; use a reviewed compensating migration when required.
- [ ] Incident procedure covers credential exposure, private-card leak, corrupt settlement, database outage, abusive traffic, rollback, communication, and evidence retention.
- [ ] Maintenance cadence: monitor backups daily, dependencies/alerts weekly, release review monthly, restore/rollback drill quarterly, access/recovery review semiannually.
