# PFM — Claude Code Project Instructions

**Personal Financial Manager** — Bob's "Quicken." A private, single-user power-tool for managing
his real finances, built on the existing **MyDB**. Served on the **Docker Swarm** at
**`pfm.bolivardrive.com`**, **LAN-only** (resolves + works on the home network; **never exposed to
the public internet**). Production rebuild of the old Flask MVP (`serve.py` + `templates/` — kept
as reference; we build clean, we do not convert it).

## What this is (and isn't)
- **A personal power-tool**, for Bob, on his own network. Quicken-class.
- **NOT a public product:** no marketing, no multi-tenant, no ads, no monetization, no SEO, no
  moderation, no sign-up funnels. Single user. Privacy by network locality.
- Sits **on top of real financial data already in MyDB** — reads his brokerage/bank/credit-card
  transactions and lets him categorize, reconcile, budget, report, and **pair fills into positions**.

## Non-Negotiable Values
- **LAN-only, never public.** Served on the swarm behind Caddy at **`pfm.bolivardrive.com`**, whose
  DNS points to a **private/LAN IP** — so it resolves and works *only on the home network* and is
  **never reachable from the internet**. Financial data stays on the LAN. PIN-gated.
- **Private + truthful.** No telemetry, nothing phones home. Numbers must be *correct* and *trace to
  source* — a wrong balance is worse than no app.
- **Fast + dense.** A power-user's cockpit. Speed and information density over hand-holding.

## Core Engineering Mandates
1. **Prod-only. No MVP.** Build it properly from commit #1. The Flask app is a *reference for what
   PFM does*, not something to port. (We learned the convert-in-place tax on prop-desk.io.)
2. **Pro-team build from day one.** Atoms → primitives → features. Typed end-to-end. All server
   state through typed TanStack Query hooks — **never raw `fetch`**.
3. **Ontology-first data model (Palantir-style).** Model the *money* (accounts, transactions,
   categories, budgets, positions), not tables. See **The Ontology**.
4. **Explorer / Artifact-centric UI — the deliberate OPPOSITE of bibleworkspace.** This is Bob's
   personal tool and he wants an **artifact-centric Explorer**: object-centric navigation, dense
   data tables, transaction **registers** (Quicken-style), filters/facets, drill-ins, detail panes,
   keyboard-friendly. **The artifacts (accounts, transactions, categories, positions…) ARE the
   navigation spine.** (Contrast: bibleworkspace is *intent-based* for the public; PFM is
   *artifact-based* for a power-user — opposite on purpose. Do NOT import the "no CRUD screens"
   rule here; here the register/table/drill-in IS the point.)
5. **Uses the existing MyDB directly — guarded by a DB role, not a human (#trust).** PFM connects to
   live MyDB via a least-privilege role **`pfm`** (provisioned): **RW (owner)** on the fresh
   `financialmanager` schema, **READ-ONLY** on the source schemas (`schwab_*`, `*_credit_card`,
   `trade_analysis`), nothing else. **The database enforces it — the loop physically cannot write or
   damage the source/trading data** — so it builds + migrates `financialmanager` **directly against
   MyDB**. No human "apply schema" step. (Don't reference the old `financialmanager`; it was renamed
   `financialmanager_old` — build fresh.) See `specs/infrastructure.md`.
6. **Token-driven styling** (skinnable engine like bibleworkspace) — start from the old
   **"Walnut & Brass"** mood as the default skin; keep styles token-driven so it stays tweakable.

## Stack
| Layer | Technology | Notes |
|---|---|---|
| Framework | **Next.js (App Router) + TypeScript** | strict TS |
| Styling | **Tailwind v4 + CSS-variable tokens** | "Walnut & Brass" default skin |
| UI primitives | **shadcn/ui** (Radix, token-themed) | one theming system |
| UI blocks | **Tailwind Plus** (re-tokenized) | the right home — dashboards, **tables, registers, forms** |
| Typed API | **tRPC** + **TanStack Query** | no raw fetch |
| ORM | **Drizzle** | owns `financialmanager`; typed **read-models** for existing schemas |
| Database | **PostgreSQL — existing MyDB** (`data02:5432`) | via least-privilege `pfm` role: RW `financialmanager`, RO source schemas (DB-enforced); loop builds directly on MyDB |
| AI (optional) | **self-hosted MoE ($0)** | category auto-suggest + insights; `lib/ai` router; **off by default** (manual-first) |
| Auth | **PIN / single-user** | gates LAN access at `pfm.bolivardrive.com`; no OAuth (personal, not public) |
| Deploy | **swarm service + Caddy (`pfm.bolivardrive.com`, LAN-only DNS)** | CI parity with prop-desk.io |

## The Ontology (model the money)
- **Objects.** `Institution`, `Account` (config-driven registry: schema + view + column mapping),
  `Transaction` (referenced by `source_txn_id` — **no data copying**), `Category` (Income / Expense
  / Transfer hierarchy), `Payee`, `Budget`, `BalanceForward` (date + amount per account),
  `Position` + `PositionLeg` (manual positions; **fills paired into positions**), `ImportBatch`, `Report`.
- **Links.** `Transaction —IN→ Account —AT→ Institution`; `Transaction —CATEGORIZED_AS→ Category`
  (linking table by `source_txn_id`, never copies the row); `Transaction —SPLIT_INTO→ Category[]`;
  `PositionLeg —PAIRS→ fill`; `Position —LINKS→ trade_analysis.position_history`; `Budget —FOR→ Category`.
- **Actions (governed write-back — only way state changes).** `categorize`, `splitTransaction`,
  `reconcile`, `recordTransfer`, `setBalanceForward`, `importTransactions`, `pairFillsIntoPosition`,
  `linkPosition`, `setBudget`. Each typed, validated, audited.
- **Functions (read/derive).** `accountBalance` (= balanceForward + Σ since), `netWorth`, `cashFlow`,
  `budgetVsActual`, `categoryReport`, `unmatchedPositions`, `openPositions`.
- **Position pairing is a first-class feature** Bob will leverage: matching **fills → positions →
  `trade_analysis.position_history`** (the MVP's manual_positions/legs work). Preserve and build on it.
- **Lineage** is the point: every number traces to its source transaction; categorization
  *references* `source_txn_id`, never duplicates data. (Ontology lineage, literally.)

## Infrastructure (swarm, LAN-only)
See `specs/infrastructure.md`. Deploys as a **swarm service** (CI like prop-desk.io), routed by the
shared **Caddy** at **`pfm.bolivardrive.com`** with the `*.bolivardrive.com` wildcard cert
(Cloudflare DNS-01) — but the **DNS record points to a LAN IP**, so it's reachable on the home
network only, never the public internet. Connects to **MyDB** via `DATABASE_URL` as the
least-privilege **`pfm`** role (RW `financialmanager`, RO source schemas — DB-enforced); the loop
builds the schema **directly against MyDB**. DB-requiring tests skip cleanly in CI.

## What NOT to Do
- **Never expose it to the public internet** — `pfm.bolivardrive.com` must resolve to a **LAN/private
  IP**; LAN-reachable, never internet-reachable. (Financial data.)
- **Never mutate non-`financialmanager` schemas** — `schwab_*`, `*_credit_card`, `trade_analysis`
  are READ-ONLY to PFM.
- **Don't escalate beyond the `pfm` role or use other DB creds.** It's RW `financialmanager` / RO
  source schemas (DB-enforced) — you build directly against MyDB and *cannot* write the source data
  even if you tried. That's the safety model.
- **Never reference the OLD `financialmanager` tables** — that schema is being rebuilt.
- No raw `fetch`; no hardcoded styles (use tokens); don't commit `.env` / DB creds / secrets.

## Decisions (settled)
- **Auth:** local **PIN** (carry the old `PFM_PIN` pattern) — gates LAN access.
- **AI categorization:** wire the **$0 MoE** for category auto-suggest + insights, **off by default**
  (manual-first per the old plan); flip on when wanted.
- **Design:** start from the **"Walnut & Brass"** mood as the default token skin (refine freely —
  Bob hasn't started using it). Token-driven so it's swappable.
- **DB access:** the loop builds **directly against MyDB** via the least-privilege `pfm` role (RW
  `financialmanager`, RO source schemas — DB-enforced). No local-throwaway DB, no human schema-apply;
  DB-requiring tests skip in CI.
