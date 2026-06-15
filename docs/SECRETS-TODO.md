# One-time human steps (secrets / external deps)

## ✅ DONE — first deploy + routing (TASK 11.2), completed 2026-06-15

PFM is deployed to the Swarm and reachable LAN-only at:

    https://pfm.bolivardrive.com:8443

### How it actually ships (reconciled to the real cluster)
- **Image:** `registry.prop-desk.io/pfm:latest` (the LAN registry, not GHCR).
- **CI/CD:** push to `main` → `.github/workflows/deploy.yml`: cloud `gate`
  (typecheck/lint/test/build) → self-hosted `build-and-deploy` on swarm1
  (`docker build` → push → `docker stack deploy`). The runner is
  `actions.runner.RoboticTrading-PFM.swarm1-pfm` (systemd, on swarm1).
  `ci.yml` is PR-only so the gate isn't duplicated on push.
- **App env:** owner-only at `/mnt/qnap/config/pfm.env` (DATABASE_URL as the
  least-privilege `pfm` role, PFM_PIN, PFM_SESSION_SECRET, CLOUDFLARE_API_TOKEN,
  optional MOE_*). Never committed; sourced at deploy time.

### LAN-only exposure (financial data — never public)
The shared cluster Caddy is **ingress-mode** (SNATs client IPs, can't IP-filter)
and its certs leak hostnames via CT logs, so PFM is **NOT** on it. Instead:
- the `pfm` app stays internal (algobots_ingress only);
- a dedicated `caddy-cloudflare` **sidecar** (in `deploy/stack.yml`) publishes
  TLS in **host mode on swarm1:8443** — swarm1 has no public NIC and the router
  forwards nothing there, so it's physically unreachable from the internet.
  Cert via Cloudflare DNS-01 (config: `/mnt/qnap/caddy/pfm.Caddyfile`).
- DNS: a Cloudflare **grey-cloud** A record `pfm.bolivardrive.com → 192.168.42.121`
  (DNS-only; a private, non-routable IP).

### ⚠️ Follow-up — rotate the Cloudflare API token
During deploy, Caddy echoed the cluster ACME token into its logs (captured in a
Claude session transcript). It is the shared `CLOUDFLARE_API_TOKEN` used by the
main Caddy + this sidecar. Rotate it: create a new Cloudflare token (Zone:DNS
Edit for the relevant zones), update `/mnt/qnap/config/caddy.env` +
`/mnt/qnap/config/pfm.env`, then `docker service update --force caddy_caddy`
and `docker stack deploy ... pfm`.

## Verify the image builds locally (TASK 11.1) — superseded
The self-hosted runner now builds the image on every push, so the local
`docker build` is no longer the only path. (The build agent's box had no Docker
daemon, which is why 11.1 was deferred.)
