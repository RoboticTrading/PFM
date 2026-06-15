# PFM — Build Plan (Spec-Driven Loop)

`CLAUDE.md` = constitution (values/mandates). This = *how we build*. Work list = `specs/TASKS.md`.
Per-iteration instruction = `PROMPT.md`.

## How we build: a verification-gated loop
1. Read `PROMPT.md` → pick the first unchecked task in `specs/TASKS.md`.
2. Implement **exactly that task**, production-grade (no MVP shortcuts).
3. Run the **gate** (the only definition of "done"):
   ```
   pnpm typecheck && pnpm lint && pnpm test && pnpm build
   ```
4. Green → commit, check the task off, continue. Red twice the same way → write `BLOCKED:` + reason, stop.
5. `[REVIEW]` (design) and `[HUMAN]`/`[SECRET]` (MyDB apply, deploy, secrets) don't halt the loop —
   build/screenshot/note and continue per `PROMPT.md`; only the hard stops below stop it.

## Hard stops (anti-runaway)
- Max iterations (harness `MAX_ITER`, default 25); no-progress (same gate failure twice → BLOCKED);
  budget ceiling.
- **PFM's DB safety is a least-privilege role, not a stop.** The loop builds **directly against
  MyDB** as `pfm` (RW `financialmanager`, RO source schemas — DB-enforced); it physically cannot
  damage the source/trading data, so there's no MyDB hard stop and no human schema-apply. Just
  don't use other DB creds.

## Autonomy first (#trust)
The loop runs autonomously and self-verifies; Bob is *on* the loop (async review), not *in* it.
Design `[REVIEW]` tasks: build to the skin, screenshot to `docs/review/`, commit, continue. Missing
secret/external dep: build against a dev/dummy, note in `docs/SECRETS-TODO.md`, continue. The only
true human stops: applying schema to **live MyDB**, the first **deploy**, and irreversible
prod-data destruction.

## Loopable vs human-gated
- **Loopable:** the whole app, the `financialmanager` schema (**directly on MyDB** via the `pfm`
  role), typed RO read-models of the source schemas, tRPC, the Explorer UI, categorization,
  positions/fills pairing, budgets/reports, tests.
- **Human-gated (one-time):** the first **deploy** (swarm + Caddy + the LAN DNS record); design
  sign-off (`[REVIEW]`, non-blocking).

## Build phases (detail in specs/TASKS.md)
0. **Phase 0 — harness** (Bob/Claude, before looping): Next.js + TS + shadcn + lint + vitest + build green.
1. **Foundation** — Tailwind v4 + tokens ("Walnut & Brass" skin); shadcn; Drizzle (owns
   `financialmanager`, typed read-models for existing schemas); tRPC + TanStack Query; ontology base
   + Action wrapper; the `lib/ai` router (MoE, off by default).
2. **Data spine** — `financialmanager` schema (accounts / categories / transaction_categories /
   position_links / balance_forward) per the ported plan, built **directly on MyDB**; typed RO
   read-models over the source schemas.
3. **Accounts** — config-driven account registry + balance-forward; account list/detail (Explorer).
4. **Transactions + categorization** (the core) — register, `categorize`/`splitTransaction`,
   category hierarchy, filters. References `source_txn_id` (no copying).
5. **The Explorer** — artifact-centric shell: object nav, dense tables, **registers**, drill-ins,
   detail panes, facets/filters. (This IS the UX — opposite of intent-based.)
6. **Positions** — pair **fills → positions** (manual positions + legs), link to
   `trade_analysis.position_history`; unmatched / open / history.
7. **Budgets / Reports / Net worth / Cash flow.**
8. **Dashboard** — the cockpit summary (balances, cash flow, budget-vs-actual).
9. **AI categorize** — MoE auto-suggest + insights, **off by default**.
10. **Auth** — local PIN gate.
11. **Ship** — swarm service + Caddy at `pfm.bolivardrive.com` (LAN-only DNS). `[HUMAN]` (one-time)
    for the first deploy + DNS record (the schema already lives on MyDB).
