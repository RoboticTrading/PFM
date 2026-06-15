# Design Review (`[REVIEW]` tasks)

Screenshots of Explorer screens for async design review (Walnut & Brass). File
tweak-tasks back into `specs/TASKS.md`.

## 3.3 — Accounts Explorer
- `3.3-accounts-list.png` — the account register: dense table, institution,
  type badge, source lineage (`schema.view`), live right-aligned mono balances
  (negative in red). Rows drill into the detail. Real MyDB data.
- `3.3-account-detail.png` — account detail: brass current balance with the
  lineage breakdown (`forward … + since …`) + institution/source metadata.

Notes for Bob: balances currently = Σ of all source transactions when no
balance-forward is set (shown as "forward $0.00 (none set)"). Set a
balance-forward per account to anchor the running balance.
