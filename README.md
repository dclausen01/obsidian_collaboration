# Obsidian Collaboration

An open, self-hostable collaboration plugin for [Obsidian](https://obsidian.md):
real-time co-editing of the same note **and** synchronization of whole
vaults/folders, with automatic merging of asynchronous edits.

It is built as a fork of the MIT-licensed
[Relay](https://github.com/No-Instructions/Relay) plugin, replacing Relay's
proprietary cloud control plane with a fully open, self-hosted server.

## Status

🚧 Early development. **Milestone M0 (scaffold + server smoke-test) is complete
and verified.** M1 in progress: the Relay fork has been imported into `plugin/`
(source builds & type-checks cleanly) and is being rewired to our own server.

## Architecture in one picture

- **Live Markdown editing** runs over a CRDT (Yjs) on a self-hosted
  [y-sweet](https://github.com/jamsocket/y-sweet) server (MIT, lean).
- **File / folder / binary sync** runs over plain REST/HTTP (binaries are not
  mergeable, so a CRDT buys nothing there).
- A small **control-plane / token-issuer** (Node + Fastify) authenticates users
  and mints per-document y-sweet tokens. This is the open replacement for
  Relay's proprietary control plane — no dependency on relay.md.

See the full design in the [plan](#) and `docs/architecture.md`.

## Repository layout

| Path      | Contents                                                              |
| --------- | -------------------------------------------------------------------- |
| `server/` | Self-hosted backend: y-sweet (CRDT/WS) + token-issuing control plane. |
| `plugin/` | The Obsidian plugin: full fork of Relay (imported in M1).             |
| `docs/`   | Architecture and design notes.                                       |

## Quick start (server)

```bash
cd server
npm install
./scripts/e2e.sh   # spins up y-sweet + issuer and runs the end-to-end smoke test
```

## Roadmap

- **M0 — Scaffold & server smoke-test** ✅
- **M1 — Markdown live collaboration** (MVP)
- **M2 — Auth / discovery + folder sync**
- **M3 — Binary / attachment sync over REST**
- **M4 — Excalidraw & Canvas**

## Credits & license

This project forks and builds upon **Relay** by No Instructions, LLC (MIT) and
**y-sweet** by Jamsocket (MIT). See `LICENSE` and `NOTICE`.
