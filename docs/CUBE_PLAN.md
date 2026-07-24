# The Cube — Phase-1 Implementation Plan

> Grounded execution plan for `CUBE_VISION.md`. Written 2026-07-24 after reading the actual
> assembly engine + PFM's current state. **Decisions flagged `⟡` are Bob's to make** before I
> sink hours in — surfacing them now so we don't build the wrong thing.

## What already exists (leverage, don't rebuild)

- **The assembly engine** — `0-dte-optimizer/src/zerodte/data/` (`occ.py` OCC parser, `spreads.py`
  broker-agnostic FIFO round-trip matcher, per-broker adapters `schwab.py`/tastytrade, its own
  `zerodte.ontology`). Caught the white whale: 100% match across two brokers, 2026-07-22. **Python.**
- **PFM** — Next.js + tRPC + Drizzle over MyDB, `financialmanager` schema built (migrations 0000–0006:
  account/category/payee/balance-forward/position/import-batch/audit-log), RO on source schemas,
  artifact-centric Explorer. **TypeScript.**
- **Cash flows already landing** — bank + card transactions in per-source schemas on MyDB.

## The core architecture call ⟡

The engine is **Python**; PFM is **TypeScript**. Two ways to bridge:

- **(A, recommended) Engine-as-batch.** The generalized Python engine runs as a batch job (cron on
  the swarm, like the recorders) and writes reconstructed round-trips into **Cube fact tables on
  MyDB**. PFM reads them via Drizzle read-models + tRPC. *Leverages the proven engine as-is, no risky
  port; PFM stays a pure read/serve layer over the facts.*
- **(B) Port the engine to TS.** Rewrite `spreads.py`/`occ.py` in TypeScript inside PFM. Cleaner
  single-language stack, but re-derives a hard, already-solved thing — exactly the white whale we just
  caught. Not recommended.

⟡ **Where do the Cube facts live?** A new **`cube`** schema on MyDB (clean, provenance stays in
sources), owned by the batch job, granted RO to the `pfm` role — *or* inside `financialmanager`
(PFM's RW schema; then the batch needs a write path there). I lean **`cube` schema + RO to pfm** —
keeps PFM's safety model intact (it only ever reads facts).

## The fact tables (the Cube's core)

Joined by shared dimensions: `symbol · underlying · strategy · dte_bucket · side · broker · account ·
period · category · instrument_type`.

| Fact | Source | Status |
|---|---|---|
| `trades` (round-trips) | assembly engine (generalized) | needs the multi-day FIFO extension |
| `cash_flows` | PFM bank/card landing | data exists; needs the fact view |
| `holdings_income` | `schwab_brokerage.etf_transactions` + `etf_basis` | already modeled; wrap as a fact |
| `pnl_balances` | derived from the above | derived view |

## Sequence — value-early (the debt first), per the vision

1. **Cash-flow fact + view FIRST** — the money-in/money-out visibility Bob needs *now* for the debt.
   Pure PFM/TS: a `cash_flows` read-model over the bank/card schemas + a sliceable Explorer view.
   **Ships value without touching the Python engine.** ⟡ Confirm this is the right first slice.
2. **Generalize the trade engine** — the "one real extension": relax the 0-DTE/same-day filter, teach
   FIFO to span days (multi-day round-trips), add equity + futures adapters. Batch → `cube.trades`.
3. **Holdings + income** — wrap the ETF basis/dividends as `cube.holdings_income`.
4. **The serving layer** — unified fact + dimension read-models; Explorer slices "everything, any angle."
5. **P&L / balances** — derived, per account/strategy/period.

## First concrete step (on Bob's nod)

Given "value early = the debt," step 1 is the cleanest first win and lowest-risk (no engine port,
pure PFM): **a `cash_flows` fact read-model + a Cash-Flow Explorer view** (in/out by period, category,
account) over the transactions already landing. It proves the Cube's serving pattern end-to-end and
puts the debt picture in front of Bob immediately — then we generalize the engine for trades.

**Open decisions for Bob (⟡):** (A vs B bridge — I recommend A) · (facts in a `cube` schema vs
`financialmanager` — I lean `cube`) · (cash-flow-first vs engine-first — vision says cash-flow, I agree).

*Principles unchanged: provenance in the sources, leverage what's built, value early, truth at the core.*
