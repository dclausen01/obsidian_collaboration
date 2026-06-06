# Plugin (Obsidian)

This directory is a **full fork of the MIT-licensed
[Relay](https://github.com/No-Instructions/Relay) plugin** (imported in M1).
The complete upstream **source** and build config were imported verbatim so we
can selectively adopt and rewire the valuable parts onto our own self-hosted
server (`../server`) instead of Relay's proprietary cloud.

> **Note on the test suite.** Upstream keeps its `__tests__/` directory
> **git-crypt-encrypted** (`__tests__/** filter=git-crypt`). Without No
> Instructions' private key those files are unreadable binary blobs, so they
> were **not** imported — committing them would be dead weight that can never
> run. We re-author tests for the modules we adopt (the Jest/ts-jest toolchain
> and `jest.config.js` were kept for exactly that). All of `src/` is plaintext
> and imported in full; it type-checks and builds cleanly (see below).

- Upstream import ref: see `git log` for the M1 import commit.
- Upstream README preserved as [`RELAY_README.md`](./RELAY_README.md).
- Upstream license preserved as [`LICENSE`](./LICENSE) (MIT, © No Instructions, LLC).
  See the repo-root `NOTICE` for full attribution.

## What we keep from Relay (high value, decoupled from its cloud)

- `src/merge-hsm/*` — the merge state machine: 3-way merge (`node-diff3`), LCA
  tracking and offline-fork reconciliation. Solves the CRDT↔file problem.
- `src/y-codemirror.next/*` — CodeMirror 6 collaborative binding (live cursors).
- `src/client/*` (`YSweetProvider`), `HasProvider`, `Document`,
  `SharedFolder`, `Canvas` — provider/doc/folder abstractions (we keep y-sweet).
- `src/storage/*` — IndexedDB persistence and the content-addressed store.

## What we replace (Relay's proprietary cloud)

- `LoginManager` / `RelayManager` (PocketBase + OAuth) → our own auth/discovery.
- `EndpointManager` (tenant licensing) → dropped/simplified.
- Blob transport in `CAS` / `SyncFile` (relay.md API) → our REST endpoints.

## Integration point

The plugin obtains y-sweet tokens from our control plane via `POST /token`
(see `../server`). For M1, point `LoginManager`'s API URL at the local issuer
and stub the user identity.

## Layout (imported from upstream)

| Path                | Contents                                                       |
| ------------------- | -------------------------------------------------------------- |
| `src/`              | Plugin source (TypeScript + Svelte).                           |
| `src/merge-hsm/`    | CRDT↔file merge state machine (keep).                          |
| `src/y-codemirror.next/` | CodeMirror 6 awareness/cursors (keep).                    |
| `src/client/`       | y-sweet provider/client (keep).                                |
| `src/pocketbase/`   | Relay cloud client (to be replaced).                           |
| `debug-tools/`      | Upstream debug helpers.                                        |

## Build / test (upstream toolchain, unchanged for now)

```bash
cd plugin
npm install
npm run build   # tsc -noEmit type-check + esbuild  -> verified green on import
```

The imported baseline was verified in this repo: `npm install` (478 packages),
`tsc -noEmit -skipLibCheck` (0 errors) and the esbuild production build
(`main.js`, ~1.26 MB) all succeed. `npm test` currently has **no test files**
(see the git-crypt note above) — the next step is to author tests alongside the
modules we adopt.

> Note: this is an as-imported baseline. Rewiring `LoginManager`/`RelayManager`
> onto our token-issuer and trimming the PocketBase/licensing code happens in
> the next M1 steps.
