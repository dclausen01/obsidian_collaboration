# Deploying the server on Plesk (Docker)

Target: a Plesk-managed (school) server where you **drive things through the
Plesk UI**, can pull the repo via Plesk Git, have a subdomain but **cannot edit
nginx directives directly**, and run services via **Docker**. Full SSH exists as
a fallback.

The backend is two containers wired together by `server/docker-compose.yml`:

```
                      Plesk proxy (per subdomain)
 students ─ https ─▶  collab.school.tld      ──▶ 127.0.0.1:3000  issuer  (/token, /health)
 students ─  wss  ─▶  collab-ws.school.tld   ──▶ 127.0.0.1:8080  y-sweet (CRDT WebSocket)
                                                   └ both run via docker compose on the host
```

The issuer talks to y-sweet over the internal Docker network; only loopback host
ports (3000, 8080) are exposed, and the Plesk proxy maps each subdomain to one of
them. y-sweet's `Y_SWEET_URL_PREFIX` makes the minted client tokens point at the
**public** `wss://` URL, so this reverse-proxy split works (verified end-to-end).

> **Why two subdomains?** A subdomain whose root is proxied to a single container
> is the most reliable way to get WebSocket upgrades through Plesk's proxy without
> touching nginx. You *can* instead use one subdomain with path rules (`/d` →
> y-sweet, `/` → issuer) — see "Single-subdomain variant" below — but test the WS
> upgrade carefully if you do.

## One-time setup

### 1. Get the code on the server (Plesk Git)

Plesk → **Git** → add this repository, choose the branch, and set the deployment
path (e.g. the subscription's `httpdocs` or a dedicated dir). We only use the
`server/` subtree.

### 2. Generate the y-sweet auth pair and `.env`

`server/.env` holds secrets and is gitignored — create it on the server (SSH or
Plesk File Manager):

```bash
cd <deploy-path>/server
cp .env.example .env
# Generate the auth pair (needs internet; uses the y-sweet image, no local Node):
docker compose run --rm --no-deps --entrypoint "" y-sweet \
  npx --no-install y-sweet gen-auth --json
```

Put the printed `private_key` / `server_token` into `.env` as `Y_SWEET_AUTH` and
`Y_SWEET_SERVER_TOKEN`. Then set:

```
Y_SWEET_URL_PREFIX=wss://collab-ws.school.tld
```

(If you have a local Node toolchain you can instead run
`./scripts/gen-auth.mjs >> .env`.)

### 3. Bring the stack up

```bash
cd <deploy-path>/server
docker compose up -d --build
curl -s http://127.0.0.1:3000/health      # -> {"ok":true,"ysweet":{"ok":true}}
```

> The build downloads npm packages and the y-sweet binary, so it needs normal
> outbound internet. Build **on the server** so the y-sweet binary matches the
> host CPU architecture.

### 4. Point the subdomains at the containers (Plesk proxy)

For each subdomain, add a **Docker proxy rule** (Plesk Docker extension) or a
proxy mapping that forwards the subdomain root to the loopback host port:

| Subdomain                 | Forward to        | Serves                |
| ------------------------- | ----------------- | --------------------- |
| `collab.school.tld`       | `127.0.0.1:3000`  | issuer `/token`,`/health` |
| `collab-ws.school.tld`    | `127.0.0.1:8080`  | y-sweet WebSocket     |

Make sure both subdomains have valid TLS (Plesk → SSL/TLS, e.g. Let's Encrypt) so
clients can use `https`/`wss`.

### 5. Verify

```bash
# API reachable publicly:
curl -s https://collab.school.tld/health
# WebSocket upgrade works through the proxy (install wscat or use a browser):
npx wscat -c "wss://collab-ws.school.tld/d/conntest/ws"   # should connect, not 4xx
```

If the WS connection is rejected (e.g. 400/426), the proxy isn't passing the
`Upgrade` header — see "Troubleshooting WebSocket" below.

## Updating (git pull from Plesk)

Plesk → **Git** → **Pull** (or enable auto-deploy on push). Add a **deployment
action** so each pull rebuilds and restarts the stack:

```bash
cd server && docker compose up -d --build
```

That's the whole update loop: push to the branch → Plesk pulls → containers
rebuild → Passenger-free, just Docker. Data in the `ysweet-data` volume survives
rebuilds.

## Point the plugin at this server

Build the Obsidian plugin with our endpoints (see `docs/local-dev.md` for the
full flow). For M1 local-auth testing:

```
OBSIDIAN_COLLAB_API_URL=https://collab.school.tld
OBSIDIAN_COLLAB_AUTH_URL=https://collab.school.tld
OBSIDIAN_COLLAB_LOCAL_AUTH=true
```

The token issuer returns `wss://collab-ws.school.tld/...` URLs (from
`Y_SWEET_URL_PREFIX`), so clients connect to y-sweet through its subdomain.

> Real per-user authentication (so this is safe for students, not just trusted
> local-auth testing) is **M2**. Until then the issuer grants any caller full
> access to any doc — keep the deployment access-restricted while testing.

## Single-subdomain variant (optional)

If you prefer one subdomain, set `Y_SWEET_URL_PREFIX=wss://collab.school.tld` and
add two path rules on `collab.school.tld`:

| Path   | Forward to        |
| ------ | ----------------- |
| `/d`   | `127.0.0.1:8080`  |
| `/`    | `127.0.0.1:3000`  |

y-sweet serves WebSockets under `/d/<doc>/ws`; the issuer handles `/token` and
`/health` at the root. The most specific rule (`/d`) must win. Verify the WS
upgrade on `/d` works through the proxy.

## Troubleshooting WebSocket

Plesk's proxy must forward `Upgrade`/`Connection` headers for `wss` to work. If
the dedicated-subdomain root proxy still rejects upgrades on your Plesk version,
the options (in order of preference) are:

1. In the Plesk Docker extension proxy rule, enable the "WebSocket" / "Support
   WebSocket" toggle if present.
2. Ask whoever administers the Plesk node to allow a single WebSocket proxy
   directive for that subdomain (this is the only thing that may need elevated
   access).
3. As a last resort, expose y-sweet on a dedicated public port (if the firewall
   permits) and set `Y_SWEET_URL_PREFIX` to `wss://collab.school.tld:<port>`.

## Files

| File                         | Purpose                                            |
| ---------------------------- | -------------------------------------------------- |
| `server/Dockerfile`          | Token issuer image (Fastify, multi-stage build).   |
| `server/Dockerfile.ysweet`   | y-sweet image (bakes in the Rust binary).          |
| `server/docker-compose.yml`  | Wires issuer + y-sweet, volume, ports, healthcheck.|
| `server/.env.example`        | Template for secrets/config (copy to `.env`).      |
| `server/scripts/gen-auth.mjs`| Prints the y-sweet auth pair as `.env` lines.      |
