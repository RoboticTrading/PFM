# The Cube — PFM's Unified Financial Data Warehouse

> A vision seed. The north star for what PFM ultimately becomes: **one queryable
> source of truth over Bob's entire financial life.**

## Vision

Every trade, every holding, every dividend, every cash flow, every dollar of
P&L — from every broker, every account, every instrument, across all the years —
in one unified, sliceable model.

*"A cube with everything in it."* Slice by symbol, strategy, DTE, broker, account,
date, category — and see the truth about your money from any angle you ask for.

## Why now

For years, reconstructing trades from raw broker fills was *"virtually impossible
in code"* — tried numerous times, always fell back to matching by hand. On
**2026-07-22**, the `0-dte-optimizer`'s assembly engine **matched 100% of the 0-DTE
trades across two brokers (Schwab + tastytrade), zero unmatched — and correctly
identified the 0-DTE credit spreads out of six years of mixed activity.**

The white whale is caught. That engine — a broker-agnostic OCC parser + FIFO
round-trip pairing + thin per-broker adapters — is the key that makes the Cube
feasible. What used to be impossible is now, essentially, a filter setting.

## What the Cube holds — the fact types

The Cube is a warehouse of financial **facts**, of a few types, joined by shared
dimensions:

- **Trades (round-trips)** — options, equities, futures. Reconstructed from broker
  fills by the assembly engine (lifted from `0-dte-optimizer`). Entry → exit,
  realized P&L, structure.
- **Holdings + income** — the covered-call ETF sleeve (QYLD/RYLD/XYLD): shares,
  cash cost basis, net-of-dividends basis, dividends received. *Already modeled:*
  `schwab_brokerage.etf_transactions` + `etf_basis`.
- **Cash flows** — bank + credit-card transactions (spending, income). *Already
  landing* in PFM's per-source provenance schemas.
- **P&L / balances** — derived, per account, per strategy, over time.

## Dimensions (how you slice it)

`symbol` · `underlying` · `strategy` · `DTE-bucket` · `side` · `broker` ·
`account` · `date/period` · `category` · `instrument-type`

## Architecture — what leverages the engine, what's a different animal

Honest map, so we build with eyes open:

- **Direct leverage — the big win.** The `0-dte-optimizer` engine is
  broker-agnostic and modular; 0-DTE was just a *filter* on top. Relax it and the
  *same engine* reconstructs **all** options (45-DTE, weeklies), plus equities and
  futures with light extension. Bob's entire trading history, every broker, in
  clean round-trips.
- **The one real extension.** Old trades (45-DTE, weeklies) are **multi-day**
  round-trips; the engine currently does *same-day* (it intentionally drops the
  multi-day closing legs, which 0-DTE never has). The FIFO pairing has to learn to
  span days — genuine new work, but an *extension* of existing logic, not a new
  problem.
- **Different fact types — they join the Cube, not the engine.** The ETFs
  (holdings/income) and the bank/card cash flows are not leg-matching; they plug
  in as their own fact tables. **Honest note:** PFM's transaction-matching
  (transactions → positions) is a *different, harder* problem than option-leg
  matching — the 0-DTE win does not auto-solve it. The Cube *holds* the
  transactions regardless.
- **The serving layer.** The Cube is the unified *read model* — the ontology's
  fact layer — that PFM's views query. Provenance stays in the source schemas
  (where it came from is truth); the Cube is where they converge for analysis.

## Why it matters (the value)

- **Cash-flow visibility** — what Bob needs *now* for the debt: money in, money
  out, at a glance, honestly.
- **MAGI awareness** — dividend/income totals in one place, ACA-cliff-aware.
- **Trading truth** — performance by strategy / instrument / DTE, across the whole
  book (as far back as the data honestly supports), not siloed per broker.
- **One place to see everything** — the GM-first lens, pointed at Bob's own life.
  You can't manage what you can't see; the Cube *is* the seeing.

## Phased path (direction, not a locked plan)

1. **Generalize the trade engine** — relax the 0-DTE filter; add multi-day FIFO;
   add equity + futures adapters → all trades, all brokers, in round-trips.
2. **Integrate holdings + income** — the ETF sleeve (basis + dividends) as a fact
   type.
3. **Integrate cash flows** — PFM's bank/card transactions as a fact type.
4. **Build the Cube** — the unified serving layer: fact tables + dimensions, the
   read model PFM queries.
5. **Surface it in PFM** — sliceable views, one source of truth. **Cash flow
   first** (the debt), then performance, then the full picture.

## Principles

- **Provenance in the source schemas** (where it came from is truth); the Cube is
  the convergence.
- **Leverage what's built** — the assembly engine, the ETF model, the PFM landing,
  the ontology — never from scratch.
- **Value early.** Ship cash-flow visibility (the debt) before chasing
  completeness.
- **Truth at the core.** The Cube shows what's *real*, not what's flattering.
