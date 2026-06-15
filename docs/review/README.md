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

## 5.2 — Explorer design pass (full shell)
The artifact-centric shell: a persistent left nav spine (PFM brand, Accounts /
Categories / Positions with active highlight, ⌘K hint), content area on the
right. Walnut & Brass throughout.
- `5.2-accounts.png` — Accounts register inside the shell.
- `5.2-account-register.png` — account detail: brass balance + lineage, then the
  Register with the facet bar (search / direction / date range / category,
  "200 of 200") over real transactions.
- `5.2-categories.png` — category hierarchy, color-coded by kind (Income green /
  Expense red / Transfer blue).
- `5.2-positions.png` — trade position history (read-only) table.

Press ⌘K anywhere to jump between artifacts.
