# How to Run the PFM Build Loop

PFM is built with a **spec-driven loop**, not vibe coding. You point an agent at the spec and it
works task-by-task, gated by tests, until done or it needs you. (Same engine as bibleworkspace.)

## The 5 files
| File | Role |
|---|---|
| `CLAUDE.md` | constitution — values + mandates (MyDB safety, Explorer/artifact UI) |
| `PLAN.md` | how we build — gate, hard stops, phases |
| `specs/TASKS.md` | the work — ordered checklist, source of truth |
| `specs/*.md` | the spec — ontology, infrastructure |
| `PROMPT.md` | the loop's per-iteration instruction |

The gate is the heartbeat: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`. No green, no commit.

## Run it — interactive (recommended)
```
cd /Volumes/acasis/VSCodeProjects/pfm
claude --dangerously-skip-permissions      # so it doesn't prompt on every write/commit
```
Then: **"Run the build loop — follow PROMPT.md. Do the next unchecked task in specs/TASKS.md, verify
with the gate, commit, check it off, continue. Don't wait for me."**

(Or, in a normal `claude` session, press **Shift+Tab** to "auto-accept edits" before kicking off.)

It stops only on: the one-time `[HUMAN]` step (the first **deploy** — swarm + Caddy + LAN DNS), a
`BLOCKED` task, or all-done. Schema work does **not** stop it — the loop builds + migrates
`financialmanager` directly on MyDB via the `pfm` role. Design `[REVIEW]` tasks don't stop it either
— they leave a screenshot in `docs/review/`.

## Headless (unattended)
```
./scripts/loop.sh        # up to 25 iterations; resumes from git on re-run
```

## Your job (human-in-the-loop bits)
- **Design/taste** — review the Explorer screens at `docs/review/`, file tweak-tasks in TASKS.md.
- **Deploy (one-time)** — the first swarm deploy + Caddy route + the **LAN-only**
  `pfm.bolivardrive.com` DNS record (→ private IP) is yours.

The loop builds + migrates the `financialmanager` schema **directly on MyDB** via the least-privilege
`pfm` role (RW `financialmanager`, RO source schemas — DB-enforced); there is **no** human
"apply schema" step.

## Steer it
Edit `specs/TASKS.md` (add `- [ ]` tasks with a *Done =* criterion) or the `specs/*.md`. The loop
picks up changes next iteration. **To change what gets built, change the spec.**
