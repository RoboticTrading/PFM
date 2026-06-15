# Infrastructure & Ops (for the build agent)

## The database boundary — a DB role, not a human checkpoint (#trust)
PFM connects **directly to the live MyDB**, guarded by a **least-privilege role `pfm`** (already
provisioned):
- **RW (owner)** on the fresh `financialmanager` schema — the loop builds + migrates it **directly
  against MyDB**.
- **READ-ONLY (SELECT)** on the source schemas — `schwab_brokerage`, `schwab_checking`, the four
  `*_credit_card` schemas, `trade_analysis`.
- **No access to anything else.**

**The database enforces this** — the loop *physically cannot* write or damage the source/trading
data, even by mistake. So **the role IS the guardrail**: there is **no human "apply schema to MyDB"
step**, no local-throwaway-DB dance. `DATABASE_URL` in `.env.local` already points at MyDB as `pfm`.
Just build. *(The old trash schema was renamed `financialmanager_old` as a backup — ignore it; drop
it whenever.)*

## Where it runs (swarm, LAN-only)
- **Hosting:** Docker Swarm service (CI parity with prop-desk.io — push → image → swarm).
- **Edge/TLS:** shared **Caddy** at **`pfm.bolivardrive.com`**, TLS via the `*.bolivardrive.com`
  wildcard (Cloudflare DNS-01; the `caddy.env` token covers `bolivardrive.com`).
- **DNS = LAN-only:** the `pfm.bolivardrive.com` record points to a **private/LAN IP** (the swarm
  ingress on `192.168.42.x`), **not** the public WAN IP — reachable on the home network, never the
  internet. `[HUMAN]` (one-time) to create the record + Caddy block.
- **Auth:** a **PIN** gate (`PFM_PIN`). LAN-reachable, so don't ship it open.

## Database
- **MyDB** at `data02:5432` via `DATABASE_URL` (role `pfm`). RW `financialmanager`, RO source
  schemas — **DB-enforced**.
- DB-touching tests run against MyDB **locally** (the loop's machine reaches `data02`) and **skip
  cleanly in CI** (GitHub Actions has no MyDB). Don't block the gate on DB availability.

## Secrets contract (NEVER commit — `.env.local` is set + gitignored; `.env.example` committed)
| Var | Purpose |
|---|---|
| `DATABASE_URL` | MyDB as the `pfm` role |
| `PFM_PIN` | the local PIN gate |
| `MOE_BASE_URL` | self-hosted MoE (optional AI) — the LAN Ollama grid |

## What the agent does / must not do
- **Does:** build the app + the `financialmanager` schema + migrations **directly against MyDB** (as
  `pfm`), read the source schemas via typed RO read-models, write tests, Dockerfile, CI; commit; may
  push to `main`. Builds AI on the MoE.
- **Must not:** try to escalate beyond the `pfm` role or use other DB creds; expose PFM to the public
  internet; commit secrets. (The role already makes writing the source schemas impossible.)
- **One-time `[HUMAN]`:** the first deploy (swarm + Caddy + the LAN DNS record). Everything else, build.
