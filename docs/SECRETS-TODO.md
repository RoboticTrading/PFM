# One-time human steps (secrets / external deps)

The loop builds everything it can autonomously. These steps need a human +
real secrets/hardware and are intentionally left out of git.

## Verify the image builds locally (TASK 11.1)
The build agent's machine had **no running Docker daemon** (CLI present, daemon
down), so it could not run `docker build`. The `Dockerfile`, `.dockerignore`,
CI/deploy workflows, and `deploy/stack.yml` are written and YAML-valid. Verify
once on a machine with Docker:

```
docker build -t pfm:local .
# optional smoke test (needs DATABASE_URL to MyDB as the pfm role):
docker run --rm -p 3000:3000 --env-file .env.local pfm:local
```

## Deploy secrets (TASK 11.2 — first deploy, [HUMAN])
GitHub repo secrets for `.github/workflows/deploy.yml`:
- `SWARM_SSH_HOST` — a swarm manager (LAN IP).
- `SWARM_SSH_USER` — deploy user.
- `SWARM_SSH_KEY` — that user's private key.
- (GHCR push uses the built-in `GITHUB_TOKEN`.)

On the swarm manager, provide app env (NEVER commit) as `pfm.env` next to the
stack, or as swarm secrets:
- `DATABASE_URL` — MyDB as the least-privilege `pfm` role.
- `PFM_PIN` — the LAN PIN gate.
- `PFM_SESSION_SECRET` — long random string for the session cookie.
- `MOE_BASE_URL` / `AI_ENABLED` — optional AI (off by default).

First deploy:
```
docker stack deploy -c deploy/stack.yml pfm     # on a swarm manager
```
Then add the Caddy block + the **LAN-only** `pfm.bolivardrive.com` DNS record
(→ private/LAN IP). **Never expose to the public internet.** The
`financialmanager` schema already lives on MyDB; no schema step needed.
