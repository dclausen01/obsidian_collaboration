# Architecture

## Goals

- Real-time co-editing of the same note (live cursors, conflict-free merge).
- Synchronization of whole vaults/folders, including binary files.
- Automatic merging of asynchronous (offline) edits for text.
- Fully open and self-hostable — no dependency on a proprietary cloud.

## Hybrid transport

| Concern                                   | Transport            | Why                                                  |
| ----------------------------------------- | -------------------- | ---------------------------------------------------- |
| Live Markdown editing                     | WebSocket + Yjs CRDT | Low latency, live cursors, conflict-free text merge. |
| File/folder sync, binaries (PDF/Word/...) | REST/HTTP            | Binaries can't be merged — a CRDT adds only overhead.|

## Components

```
Obsidian plugin (fork of Relay)
   ├─ YSweetProvider ........ WebSocket CRDT sync (live Markdown)
   ├─ merge-hsm ............. CRDT <-> file reconciliation (3-way merge)
   ├─ y-codemirror.next ..... live cursors / awareness in CodeMirror 6
   └─ REST sync client ...... folders & binary blobs

Server (this repo, `server/`)
   ├─ y-sweet ............... CRDT/WebSocket server (MIT, self-hosted)
   └─ control plane ......... Fastify: /auth, /token (mints y-sweet tokens),
                              later: discovery + REST blob store
```

## Why fork Relay

Relay already solved the hard, Obsidian-specific parts (CodeMirror 6
integration, the merge state machine, the y-sweet client). Its plugin is MIT;
only its hosted control plane (login/permissions/token issuance, built on
PocketBase) is proprietary. We keep the valuable client code and replace the
control plane with our own open token issuer — which is small because the
client↔server contract (the `ClientToken`) is tiny and well-defined.

## Token flow

The client `POST`s to the control plane's `/token` with the document id and a
user bearer token; the control plane checks permissions and mints a y-sweet
`ClientToken` (`{ url, baseUrl, docId, token, authorization }`) using the
y-sweet server auth key. The client then connects to y-sweet over WebSocket
using that token. See `server/README.md`.

## Reconciliation (the hard part)

Markdown exists in two representations: the CRDT document (when a note is open
and "live") and the file on disk (synced via REST when not live). Relay's
`merge-hsm` handles the handoff — loading disk content into the CRDT once,
applying diffs (never full replaces), and performing a 3-way merge (via
`node-diff3`) against a tracked last-common-ancestor when offline edits and
remote edits diverge. We port this engine rather than reinventing it.

## Milestones

- **M0** — Scaffold + server smoke-test (done; see `server/scripts/e2e.sh`).
- **M1** — Markdown live collaboration in Obsidian (MVP).
- **M2** — Auth/discovery + folder sync.
- **M3** — Binary/attachment sync over REST.
- **M4** — Excalidraw & Canvas.
