# Collaboration Server

The open, self-hosted backend. Two cooperating pieces, both run locally with no
external dependencies:

1. **y-sweet** — the CRDT/WebSocket server that actually relays document edits
   (MIT, runs via `npx y-sweet serve`, persists to the filesystem or S3).
2. **Token issuer / control plane** (`src/`) — a small Fastify service that the
   Obsidian client calls to obtain a per-document y-sweet client token. This is
   the open replacement for Relay's proprietary control plane.

## Token flow

```
Obsidian client                Token issuer (this)            y-sweet
   │  POST /token {docId}          │                             │
   │  Authorization: Bearer ...    │                             │
   │ ────────────────────────────► │  getOrCreateDocAndToken()   │
   │                               │ ──────────────────────────► │
   │  ◄─────────────────────────── │   ClientToken               │
   │   { url, baseUrl, docId,      │                             │
   │     token, authorization }    │                             │
   │                               │                             │
   │  WebSocket (CRDT sync), authenticated with token            │
   │ ──────────────────────────────────────────────────────────►│
```

> **M1 note:** authentication is currently a stub — the issuer grants `full`
> access to any requested `docId`. Real users, per-relay permissions and
> discovery land in M2 (`TODO(M2)` in `src/issuer.ts`).

## Scripts

| Command            | What it does                                                       |
| ------------------ | ----------------------------------------------------------------- |
| `npm run ysweet`   | Start a local y-sweet server (no auth) persisting to `.ysweet-data`. |
| `npm run issuer`   | Start the token issuer (reads `Y_SWEET_CONNECTION_STRING`).        |
| `npm run smoke`    | Run the smoke client against an already-running issuer.            |
| `./scripts/e2e.sh` | Full orchestration: auth → y-sweet → issuer → smoke client.        |
| `npm run build`    | Type-check & compile with `tsc`.                                   |

## Configuration

| Env var                     | Default                  | Meaning                              |
| --------------------------- | ------------------------ | ------------------------------------ |
| `ISSUER_HOST`               | `127.0.0.1`              | Issuer bind host.                    |
| `ISSUER_PORT`               | `3000`                   | Issuer port.                         |
| `Y_SWEET_CONNECTION_STRING` | `ys://127.0.0.1:8080`    | How the issuer reaches y-sweet.      |

Generate y-sweet auth with `npx y-sweet gen-auth --json`; start the server with
`--auth <private_key>` and set `Y_SWEET_CONNECTION_STRING=ys://<server_token>@host:port`.
