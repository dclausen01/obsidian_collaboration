# Plugin (Obsidian)

> **Placeholder — populated in M1.**

The Obsidian plugin is a fork of the MIT-licensed
[Relay](https://github.com/No-Instructions/Relay) plugin. M0 establishes the
server side; M1 imports the fork here and rewires it to our own server.

## What we keep from Relay (high value, decoupled from its cloud)

- `merge-hsm/*` — the merge state machine: 3-way merge (`node-diff3`), LCA
  tracking and offline-fork reconciliation. Solves the CRDT↔file problem.
- `y-codemirror.next/*` — CodeMirror 6 collaborative binding (live cursors).
- `client/provider.ts` (`YSweetProvider`), `HasProvider`, `Document`,
  `SharedFolder`, `Canvas` — provider/doc/folder abstractions (we keep y-sweet).
- `storage/*` — IndexedDB persistence and the content-addressed store.

## What we replace (Relay's proprietary cloud)

- `LoginManager` / `RelayManager` (PocketBase + OAuth) → our own auth/discovery.
- `EndpointManager` (tenant licensing) → dropped/simplified.
- Blob transport in `CAS` / `SyncFile` (relay.md API) → our REST endpoints.

## Integration point

The plugin obtains y-sweet tokens from our control plane via `POST /token`
(see `../server`). For M1, point `LoginManager`'s API URL at the local issuer
and stub the user identity.
