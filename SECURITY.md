# Security policy

## Reporting a vulnerability

Please report vulnerabilities privately through GitHub Security Advisories for this repository. Include affected commit, reproduction steps, impact, and any evidence with secrets/private card data removed. Do not open a public issue for an exploitable weakness or test production rooms without every participant’s permission. Maintainers should acknowledge reports promptly, triage severity, prepare a coordinated fix, and credit reporters who want attribution.

## Product scope

Friendly Card Room is strictly play-money software. Chips and credits have no cash value. The project intentionally contains no deposits, withdrawals, purchases, payment processing, cryptocurrency, prizes, or real-money gambling integration. Please report any change that introduces or implies those capabilities.

## Security design

- The Node server is authoritative for decks, cards, turns, legal actions, pots, winners, dealer behavior, settlement, balances, and timers.
- Clients cannot select cards, submit balances/winners, act as another seat, or rely on Socket.IO room membership alone.
- Poker views disclose a player’s own hole cards and safe showdown reveals only. Other unrevealed hole cards, future board cards, burn identities, and deck order are removed.
- Blackjack views remove the dealer hole card before reveal and never expose future shoe order.
- Every state-changing game action is version checked, serialized per room, and stored with a unique idempotency key.
- Room passwords use salted scrypt hashes. Reconnect tokens are 256-bit random values; only a peppered SHA-256 hash is stored. Raw tokens/passwords are not logged or placed in links.
- Node cryptographic APIs provide shuffling, room codes, UUIDs, tokens, and audit nonces. `Math.random()` is not acceptable for these uses.
- Helmet, exact-origin CORS, body limits, Zod schemas, HTTP/event rate limits, safe errors, and structured redacted logs reduce common exposure.

## Secret management

Keep `DATABASE_URL`, `SESSION_SECRET`, `ROOM_TOKEN_PEPPER`, database credentials, and service-role keys only in Render/local ignored environment settings. Never place secrets in a `VITE_` variable, workflow, source, screenshot, test fixture, URL, or log. Rotate a secret immediately if exposed; deleting it from the current file does not revoke it or remove Git history. Review Git history and deployment logs, invalidate the credential at its provider, then document the incident.

The frontend needs only the public `VITE_API_URL` and must never connect directly to authoritative Supabase tables. Database grants for browser roles are revoked by migration.

## Abuse controls

HTTP requests, room creation/join attempts, Socket events, and chat have bounded payloads and rate limits. Chat is plain text with no HTML, embeds, images, or uploads. Operators should monitor repeated join/password failures and resource pressure. For a public high-traffic launch, add edge bot protection and shared distributed rate limits before scaling instances.

## Supported versions and updates

Security fixes target the latest `main` deployment. Pin deployment runtime to Node 24 Active LTS, run `npm audit` as part of dependency review, and apply reviewed security updates promptly. CI lint/typecheck/test/build gates and multi-context browser tests should pass before release. Database and deploy rollback procedures must be tested independently.

## Responsible disclosure

Avoid viewing, retaining, or sharing another player’s private cards/tokens beyond what is required to demonstrate the issue. Use local test rooms and test data. Maintainers will coordinate disclosure after a fix and reasonable deployment window; legal threats are not a substitute for good-faith technical coordination.
