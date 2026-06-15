# Build Tasks (the loop works top-to-bottom)

Rules: do the **first unchecked** task. Autonomy first (PLAN.md / PROMPT.md): **nothing halts the
loop** except the first **deploy** (one-time). `[REVIEW]` = build it + screenshot to `docs/review/`,
commit, continue (Bob reviews async). `[HUMAN]`/`[SECRET]` = do the autonomous part (build on MyDB
via the `pfm` role, or dummy values), note the one-time step in `docs/SECRETS-TODO.md`, continue.
Check off (`[x]`) only when the **gate is green** (typecheck+lint+test+build). Each task lists its
**Done =** criterion. Keep order.

> Phase 0 (scaffold + green harness) is done before the loop starts.
> **DB:** the loop builds **directly on MyDB** via the `pfm` role — RW `financialmanager`, RO source
> schemas (DB-enforced). No local DB, no human apply step; DB-requiring tests skip in CI.

## Phase 1 — Foundation
- [x] **1.1 Tailwind v4 + token layer.** Tailwind v4 + the semantic design-token scaffold
  (`lib/theme/`) + a `ThemeProvider`; ship **"Walnut & Brass"** as the default skin. *Done =* gate
  green; a token-only component renders; swapping the skin var re-themes (a test asserts it).
- [x] **1.2 shadcn/ui primitives.** Init shadcn (Radix); wire its CSS-variable theming to our skin
  tokens — **one theming system**. Add core primitives (button, input, dialog/sheet, **table**,
  tabs, dropdown, command/search). *Done =* gate green; a primitive renders under Walnut & Brass.
- [x] **1.3 Drizzle on MyDB (`pfm` role).** Drizzle + `drizzle.config.ts` + `lib/db/` connecting to
  **MyDB** via `DATABASE_URL` (the `pfm` role — RW `financialmanager`, RO source schemas; already in
  `.env.local`). Build the `financialmanager` schema **directly on MyDB**. *Done =* gate green;
  `db:generate`/`db:migrate` apply to `financialmanager` on MyDB; a connectivity test passes (skips
  cleanly with no DB in CI).
- [x] **1.4 tRPC + TanStack Query.** Typed API + query provider; one `health` procedure; lint rule
  forbidding raw `fetch`. *Done =* gate green; a test calls it through the typed client.
- [x] **1.5 Ontology base + Action wrapper.** `defineAction()` (typed + validated + authorized +
  `AuditLog`) per `specs/ontology.md`. *Done =* gate green; an Action writes an audit row in a test.
- [x] **1.6 AI router (`lib/ai`).** Role-based, config-swappable; MoE provider (`MOE_BASE_URL`),
  **off by default**. *Done =* gate green; a test routes a role to a mocked provider (no network).

## Phase 2 — Data spine
- [x] **2.1 `financialmanager` schema** (on MyDB; `pfm` owns it) — `Institution`, `Account` (config-driven),
  `BalanceForward`, `Category` (Income/Expense/Transfer + ~12 seeds), `TransactionCategory` (link by
  `source_txn_id`, no copy), `Payee`, `Budget`, `Position`/`PositionLeg`, `PositionLink`,
  `ImportBatch`, `AuditLog`. *Done =* gate green; migration applies to `financialmanager` on MyDB; schema tests pass.
- [x] **2.2 Read-models (READ-ONLY) for existing schemas** — typed wrappers over
  `schwab_brokerage.v_trade/v_nontrade_transactions`, `schwab_checking`/4 credit-card `v_transactions`,
  `trade_analysis.position_history`. *Done =* gate green; read-model types compile; queries tested.
- [x] **2.3 DB test strategy.** DB-touching tests run against MyDB **locally** (the loop's machine
  reaches `data02`) and **skip cleanly in CI**. Add minimal fixtures only where a pure unit test
  benefits. *Done =* gate green locally and in CI (DB tests skipped in CI); a read-model test passes.

## Phase 3 — Accounts
- [x] **3.1 Account registry** (config-driven: source schema/view/column-mapping). *Done =* gate green.
- [ ] **3.2 Balance-forward + `accountBalance`.** *Done =* gate green; balance math tested.
- [ ] **3.3 Accounts Explorer** (list + detail, dense). *Done =* gate green; **design `[REVIEW]`**.

## Phase 4 — Transactions + categorization (the core)
- [ ] **4.1 Transaction register** — the artifact-centric table over the read-models (sortable, dense,
  Quicken-style). *Done =* gate green; renders a register from fixtures; component tests.
- [ ] **4.2 `categorize` / `splitTransaction`** Actions + category hierarchy (reference `source_txn_id`,
  no copy). *Done =* gate green; categorize + split tested; lineage preserved.
- [ ] **4.3 Filters / facets** on the register (account, date, category, payee, amount). *Done =* gate green.

## Phase 5 — The Explorer
- [ ] **5.1 Artifact-centric app shell** — object nav, dense tables, drill-ins, detail panes,
  keyboard-friendly. The Explorer IS the UX. *Done =* gate green; navigate accounts↔transactions↔
  categories↔positions via drill-ins; tests.
- [ ] **5.2 [REVIEW] Explorer design pass** (Walnut & Brass, dense cockpit).

## Phase 6 — Positions (fills → positions)
- [ ] **6.1 `pairFillsIntoPosition`** + `Position`/`PositionLeg` (instrument class + trade-structure
  taxonomy). *Done =* gate green; pairing fills produces a position in a test.
- [ ] **6.2 Link to `trade_analysis.position_history`** + unmatched / open / history views. *Done =*
  gate green; `linkPosition` + the three views tested.

## Phase 7 — Budgets / Reports / Net worth
- [ ] **7.1 Budgets** — `setBudget` + `budgetVsActual`. *Done =* gate green.
- [ ] **7.2 Reports** — `categoryReport`, `cashFlow`, `netWorth`. *Done =* gate green; report math tested.

## Phase 8 — Dashboard
- [ ] **8.1 Cockpit dashboard** — balances, cash flow, budget-vs-actual at a glance. *Done =* gate
  green; component tests; **design `[REVIEW]`**.

## Phase 9 — AI categorize (optional)
- [ ] **9.1 MoE auto-suggest + insights** via `lib/ai`, **off by default**; suggests only, human
  confirms (never auto-writes). *Done =* gate green; suggestion path tested with a mocked MoE.

## Phase 10 — Auth
- [ ] **10.1 PIN gate.** Local PIN (`PFM_PIN`) gating LAN access. *Done =* gate green; gated route
  tested (dev dummy PIN).

## Phase 11 — Ship
- [ ] **11.1 Dockerfile + deploy workflow (write only)** — swarm image + GitHub Actions, mirroring
  prop-desk.io. *Done =* gate green; workflow lints; image builds locally.
- [ ] **11.2 [HUMAN] First deploy + Caddy + LAN DNS (one-time).** Deploy the image to the swarm, add
  the Caddy block + the **LAN-only** `pfm.bolivardrive.com` DNS (→ private IP). The `financialmanager`
  schema already lives on MyDB and the `pfm` role is already provisioned. See infrastructure.md.
