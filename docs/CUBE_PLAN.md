# The Cube — Exhaustive Build Plan

> Supersedes the earlier decision-sketch. Written 2026-07-25 after studying little jarvis's
> assembly engine, PFM's current state, and **grounding in the real trade data on MyDB**. This is
> the plan of record for building the Cube's **match-all trade engine** + serving layer.

---

## 0. What's already true (so we build the gap, not a duplicate)

- **Cash flow is DONE in PFM.** `reports.ts` already serves `cashFlow`, `categoryReport`, `netWorth`
  over the bank/card `v_transactions` + Schwab non-trade. The Explorer has transactions/register,
  accounts, categories, budgets, positions, reports. **We do not rebuild any of that.**
- **The white whale is caught (option verticals).** `0-dte-optimizer/src/zerodte/data/`:
  `occ.py` (broker-agnostic OCC parser), `spreads.py` (`SpreadFill` → `pair_round_trips`: contract-
  level FIFO within `(session, side, short, long)` + a worthless-expiry flatten pass → `RoundTrip`
  + `Leftover`), adapters `schwab.py`/`tastytrade.py`, `ontology/objects.py`. **100% matched, 0
  unmatched, 0-DTE.** Same-day, vertical-only.
- **The gap = MATCH ALL.** Bob trades more than options, and it must reconstruct *everything*.

## 1. The real trade universe (grounded on MyDB, 2026-07-25)

| Broker | Instrument | Trade txns | Span | Matching problem |
|---|---|---|---|---|
| tastytrade | Equity Option | 7,202 | 2020–2024 | OCC parse + FIFO, **multi-day** (weeklies/45-DTE) |
| tastytrade | Future | 1,319 | 2020–2026 | FIFO by **contract**, multi-day |
| tastytrade | Future Option | 317 | 2021–2022 | future-option symbology + FIFO multi-day |
| tastytrade | (Money Movement) | 463 | — | **cash**, not a trade → cash-flow fact |
| tastytrade | Equity Option (Receive Deliver) | 152 | — | **assignment / exercise / expiration** |
| Schwab | Options (OCC legs in `instruments`) + Equities + ETFs | — | ~2020+ (as far as data honestly supports) | same engine + equity/ETF FIFO |

`schwab_brokerage.transactions` keys legs via a separate `instruments` table (OCC in `symbol`);
`tastytrade_brokerage.transactions` is self-describing (`instrument_type`, `underlying_symbol`,
`symbol`, `action`, `quantity`, `price`, `value`/`value_effect`, `net_value`, fees). ETFs already
modeled in `schwab_brokerage.etf_transactions` + `etf_basis`.

## 2. Architecture — engine-as-batch, Cube on MyDB, PFM serves

```
 broker source tables (RO)                 the generalized engine (Python, batch)              serving
 ─────────────────────────      ┌───────────────────────────────────────────────┐     ┌──────────────────┐
 schwab_brokerage.transactions  │  adapters → normalized Fill stream             │     │  PFM (TS)        │
   + instruments (OCC legs)  ──▶ │    (instrument identity, intent, qty, cash, ts)│ ──▶ │  Drizzle .existing│
 tastytrade_brokerage.txns   ──▶ │  identity + FIFO round-trip matcher (multi-day)│ w   │  read-models over │
 schwab_brokerage.etf_*      ──▶ │  structure grouper (legs → spreads/strategies) │ r   │  cube.*           │
                                 │  → cube.trades / cube.trade_legs / cube.cash_* │ i   │  tRPC + Explorer  │
                                 │  + match-rate scorecard (matched/unmatched)    │ t   │  sliceable views  │
                                 └───────────────────────────────────────────────┘ e   └──────────────────┘
```

- **Why Python batch, not a TS port:** the proven engine is Python; porting the OCC/FIFO core to TS
  re-derives the white whale. The engine runs as a **swarm batch** (like the recorders), writing a
  new **`cube`** schema on MyDB. **Decision (mine): `cube` schema, granted RO to the `pfm` role** —
  PFM only ever *reads* facts, keeping its "can't write source data" safety model fully intact.
- **PFM stays a pure read/serve layer** over `cube.*` (Drizzle `.existing()` read-models, exactly the
  pattern already used for the source schemas) → tRPC routers → Explorer views.

## 3. The generalized match-all engine (the core new work)

Lift `occ.py`/`spreads.py` into a broker-**and**-instrument-agnostic matcher. Three layers:

### 3a. Normalize → one `Fill` type (adapters do the broker-specific part)
```
Fill { source, account, instrument: InstrumentId, intent: OPEN|CLOSE|null,
       qty: int(signed by buy/sell), price, cash: Decimal(signed, fee-incl), ts }
InstrumentId = one of:
   EquityId(symbol)                         # AAPL, QYLD
   OptionId(underlying, expiry, side, strike, occ_root)   # equity + index options
   FutureId(root, contract_month)           # /ES 2026-03  (front-month roll aware)
   FutureOptionId(future, expiry, side, strike)
```
- Adapters (`schwab`, `tastytrade`) map their rows → `Fill`s. tastytrade is self-describing;
  Schwab joins `transactions`→`instruments` and OCC-parses the leg (reuse `parse_occ`).
- **Intent inference** where the broker doesn't state it: buy-to-open vs sell-to-close is resolved by
  the FIFO inventory itself (a fill that reduces an open position of the opposite sign is a CLOSE).

### 3b. Multi-day FIFO round-trip matcher (the "one real extension")
- Generalize `pair_round_trips`: **BookKey = InstrumentId** (not the 0-DTE `(session,side,strikes)`),
  and matching **spans days** — an OPEN lot stays in the book until a later CLOSE (or expiry/assignment)
  consumes it. Contract-level, FIFO, pro-rated fee-inclusive cash — *the exact logic that already works,
  with the same-day/session constraint removed.*
- **Exit paths, generalized:** (1) offsetting close (FIFO), (2) **option expiry** worthless (existing
  pass, keyed on expiry), (3) **assignment/exercise** (`Receive Deliver`) — the option lot closes and
  *spawns an equity/future Fill* (assigned shares) that re-enters the FIFO. (4) **futures**: close by
  offset; roll = close old contract + open new. Equities/ETFs: plain FIFO buy→sell.

### 3c. Structure grouper (legs → strategies) — a *dimension*, not the matcher
- The matcher works at the **leg** level (robust, always matches). A second pass groups same-order /
  same-timestamp legs into **structures** (vertical, iron condor, strangle, covered call, outright) and
  tags each round-trip with a `strategy` + `structure_type` dimension. Grouping is *additive*: even if a
  structure is ambiguous, the legs are already matched and in the Cube. (Honest: this is where "6 years
  of mixed activity" is hard; leg-level match is the safety net so nothing is ever lost.)

### 3d. The honest scorecard (little jarvis's standard)
- Every run reports **matched vs unmatched by (broker × instrument)** — the "100% / 0 leftover" metric.
  `Leftover`s are surfaced, never dropped. This is how Bob validates "match all" is real, not claimed.

## 4. The Cube schema (`cube` on MyDB)

- `cube.trades` — one row per matched round-trip: `instrument_type, underlying, symbol, side,
  structure_type, strategy, dte_bucket, broker, account, opened_at, closed_at, qty, open_cash,
  close_cash, realized_pnl, fees, expired/assigned flags`, **+ provenance** (`open_source_ids[]`,
  `close_source_ids[]` — reference the source txns, never copy).
- `cube.trade_legs` — the leg detail behind each trade (lineage to source fills).
- `cube.cash_flows` — unified fact: bank/card `v_transactions` **∪** broker Money Movement (deposits,
  interest, fees, div) — the money-in/out layer, provenance-linked.
- `cube.holdings_income` — the ETF sleeve (basis + dividends) wrapped as a fact.
- **Dimensions** (shared join keys): `symbol · underlying · strategy · structure_type · dte_bucket ·
  side · instrument_type · broker · account · period · category`.
- `cube.match_runs` — scorecard per batch run (matched/unmatched counts, for trust + drift detection).

## 5. PFM serving layer

- **Read-models** (`src/lib/db/read-models/cube.ts`): Drizzle `.existing()` over `cube.trades`,
  `cube.cash_flows`, `cube.holdings_income`, `cube.match_runs` — typed, RO (same pattern as today).
- **tRPC** (`routers/cube.ts`): `trades(filter)`, `tradePerformance(groupBy)`, `matchHealth()`,
  `slice(dims)` — the sliceable read functions.
- **Explorer views**: a **Trades register** (Quicken-style, sliceable by symbol/strategy/DTE/broker/
  instrument), a **Performance** view (P&L by any dimension), a **Match Health** panel (the scorecard).
  Reuse the existing register/table primitives.

## 6. Provenance, lineage, truth (non-negotiable)

- **Provenance in the sources; the Cube is the convergence.** Cube facts *reference* source txn ids;
  never copy the source row (same law as PFM's `TransactionCategory`).
- **Leftovers are visible**, always — an unmatched fill is a data-truth signal, surfaced in Match
  Health, never silently dropped. Truth at the core.
- **Decimal everywhere** (money never float — lifted straight from the engine's discipline).

## 7. Phased path & what THIS run delivers

- **Phase 1 (this run, autonomous):** the generalized engine (equity/future/option/future-option
  adapters + multi-day FIFO + expiry/assignment) + `cube.trades`/`trade_legs` landing + the
  **match-rate scorecard** run against the real 2020–2026 data. Deliver honest match rates by
  instrument; surface `Leftover`s. *This is the white whale, generalized — the hard, unique part.*
- **Phase 2:** structure grouper (strategies), Schwab equity/ETF adapters completeness, multi-year
  Schwab back-history.
- **Phase 3:** `cube.cash_flows` unified fact (fold broker Money Movement into PFM's existing cash flow).
- **Phase 4:** `cube.holdings_income` (ETF sleeve).
- **Phase 5:** PFM serving — read-models + tRPC + Explorer Trades/Performance/Match-Health views.
- **Phase 6 (the endgame Bob has shipped before):** NL-query agent over the financial graph
  (his Devon IAM-graph playbook, pointed at his money) + graph-data-science anomaly detection
  (miscategorized txns, duplicates, orphaned legs, reconciliation gaps — "where the data is lying").

## 8. Honest scope note

"Match all across 6 years of mixed broker activity" is genuinely iterative — little jarvis got 100%
on 0-DTE *with validation loops against real fills*. This run builds the generalized engine and runs
it against the real data to produce the **first honest match-rate scorecard**; the leftover cases it
surfaces are the tuning worklist (assignment edge cases, roll detection, Schwab leg quirks). Nothing
is claimed matched that isn't — the scorecard is the truth.

## 9. Decisions (made; veto anything)

- **Bridge:** Python engine-as-batch (not a TS port). ✅
- **Facts live in:** a `cube` schema on MyDB, RO to `pfm`. ✅
- **Matcher granularity:** **leg-level FIFO** (always matches) + structure grouping as an additive
  dimension (never lose a fill to an ambiguous structure). ✅
- **Where the engine code lives:** extend it in `0-dte-optimizer` (its home, proven, bind-mounted for
  batch) under a new `zerodte.cube` package — or a shared lib. ⟡ *leaning: extend in place.*

*Principles: provenance in the sources · leverage what's built · value early · truth at the core · one
brain, many instruments.*

---

## STATUS — 2026-07-25 (Phase 1 core delivered)

**Built + validated:** the generalized match-all engine (`0-dte-optimizer/src/zerodte/cube/`:
`matcher.py` + `run.py`). Ran against the real tastytrade 2020–2026 book (8,838 trade fills):

| Instrument | Fills | Round-trips | Matched | Residual |
|---|---|---|---|---|
| Future | 1,319 | 754 | **100%** | none |
| Future Option | 317 | 163 | **100%** | none |
| Equity Option | 7,202 | 3,834 | ~94% | expiry + corp-actions (below) |

**The residual is fully diagnosed, nothing unexplained:**
- **Option expiry** — options opened, never closed by a Trade (e.g. SPXW weeklies) → expired. Phase-2
  expiry pass flattens these.
- **Corporate actions** — the AAPL 4:1 split (2020-08-31) re-symboled a position mid-life (strike
  415 → ~103.75); the symbol-identity match can't pair pre/post-split legs. **This is the one genuinely
  new hard case the 0-DTE engine never faced** (index 0-DTE options don't split). Phase-2 needs an
  option-adjustment/corp-action mapping (OCC adjustment memos, or a split-factor table) BEFORE the
  expiry pass — else expiry would mis-flatten a split position that was actually closed.

## STATUS — 2026-07-25 (Phase 2 done)

- **Expiry pass + auto corp-action guard** — two-pass `match_all`: pass 1 finds the split signature
  (close-without-open) → guard; pass 2 flattens past-expiry option lots (worthless-assumed,
  `matched_via='expiry'`) EXCEPT on guarded underlyings. Auto-caught AAPL. tastytrade equity-option
  still-open **372 → 10**; ~99% matched.
- **Schwab adapter** (`v_trade_transactions`) — options match **100%** (+$7.9k, recent NDX 0-DTE).
- **Landed: 6,504 round-trips, both brokers, 2020–2026, every P&L validated** (tastytrade all +
  Schwab options). Cube UI shows both.

## STATUS — 2026-07-25 (Phase 2c done)

- **Schwab matched by broker `position_id`** (Bob's own Excel-HUD key): `match_by_position` groups a
  position's fills; for a fully-closed position P&L = Σ signed cash (order-independent — sidesteps the
  intraday scalp/settlement noise that broke symbol-FIFO). **Schwab futures −$524k → +$95.8k**; every
  Schwab instrument now matches on the reliable key. `match_source` dispatches Schwab→position_id,
  tastytrade→symbol-FIFO (still 100%).
- **The Cube: 6,259 round-trips, +$81,516 net realized** (tastytrade −$11.8k, Schwab +$93.3k), both
  brokers, 2020→2026, all instruments. Plus holdings (+$30.5k dividends) + broker cash flow.
- **The waterfall** — cumulative realized-P&L equity curve, live in the cockpit (Bob's Excel HUD, automated).

### Remaining (the richer HUD metrics Bob had in Excel)
- Per-trade **%RoC · %RoR · MaxLoss · Capital** — need margin/capital per structure. And **strategy
  grouping** (Bull Put Spread / Bear Call Spread / Short Futures) — group same-order legs into
  verticals (the structure grouper). His HUD's power columns; DaysHeld already lands.
- Held-position **still-opens** as live P&L (mark-to-market) — the ETFs + open futures.

### Phase 2b backlog (durable — not lost in the scroll)
- **Schwab FUTURES P&L** — `net_amount` is the NOTIONAL, not P&L (−$524k on micro-NQ is impossible).
  Compute futures P&L from price×multiplier×qty (per-instrument multiplier), not net_amount. Then land.
- **Schwab EQUITY / held ETFs** — QYLD/RYLD/XYLD are dividend HOLDINGS (bought, never sold → correctly
  still-open), not trades → belong in a `cube.holdings_income` fact (basis + dividends via
  `etf_transactions`/`etf_basis`), not `cube.trades`. Split trades from holdings.
- **AAPL split (corp-action)** — needs an OCC option-adjustment / split-factor mapping to re-symbol
  pre-split legs so they pair with post-split closes (the guard currently leaves them as leftovers).
- **ITM assignments** — `Receive Deliver` rows close assigned options (not worthless) + spawn an
  equity/future lot; the one worthless-assumption caveat in the expiry P&L.
- **cube.cash_flows** — fold broker Money-Movement into PFM's existing cash-flow.
- **Richer PFM views** — a Performance page + a Match-Health page; the NL-query agent endgame.
