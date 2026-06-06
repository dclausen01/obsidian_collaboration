# Local development — live Markdown collaboration (M1)

This is the end-to-end recipe for running the fork against our own self-hosted
server, with no dependency on Relay's proprietary cloud. It uses the M1
"local-auth Option A" path: a build-time stub identity plus a fixed local relay
id to mark folders live (see `coupling-analysis.md`).

## 1. Start the server (y-sweet + token issuer)

```bash
cd server
npm install
./scripts/e2e.sh        # one-shot: verifies the full loop and tears down
```

For an interactive session you instead start the two long-running processes the
script wraps (y-sweet on :8080, issuer on :3000). The issuer's `/token` endpoint
is what the plugin talks to; `/health` is what the plugin's NetworkStatus pings.

## 2. Build the plugin in local-auth mode

The endpoints and identity are injected at build time. Build **once per vault**
with a distinct identity so collaborators show up as different users:

```bash
cd plugin
npm install

# Vault A — "Alice"
OBSIDIAN_COLLAB_API_URL="http://127.0.0.1:3000" \
OBSIDIAN_COLLAB_AUTH_URL="http://127.0.0.1:3000" \
OBSIDIAN_COLLAB_LOCAL_AUTH=true \
OBSIDIAN_COLLAB_LOCAL_AUTH_NAME="Alice" \
OBSIDIAN_COLLAB_LOCAL_AUTH_EMAIL="alice@localhost" \
  npm run build

# Vault B — "Bob" (rebuild with a different identity before installing into vault B)
OBSIDIAN_COLLAB_API_URL="http://127.0.0.1:3000" \
OBSIDIAN_COLLAB_AUTH_URL="http://127.0.0.1:3000" \
OBSIDIAN_COLLAB_LOCAL_AUTH=true \
OBSIDIAN_COLLAB_LOCAL_AUTH_NAME="Bob" \
OBSIDIAN_COLLAB_LOCAL_AUTH_EMAIL="bob@localhost" \
  npm run build
```

Build vars (all optional; defaults preserve upstream behaviour):

| Variable                          | Default                                  | Purpose                                  |
| --------------------------------- | ---------------------------------------- | ---------------------------------------- |
| `OBSIDIAN_COLLAB_API_URL`         | `https://api.system3.md`                 | Token issuer base URL.                   |
| `OBSIDIAN_COLLAB_AUTH_URL`        | `https://auth.system3.md`                | Auth base URL (unused in local-auth).    |
| `OBSIDIAN_COLLAB_LOCAL_AUTH`      | `false`                                  | Enable stub login (no PocketBase/OAuth). |
| `OBSIDIAN_COLLAB_LOCAL_AUTH_NAME` | `Local User`                             | Display name of the stub identity.       |
| `OBSIDIAN_COLLAB_LOCAL_AUTH_EMAIL`| `local@localhost`                        | Email/id of the stub identity.           |
| `OBSIDIAN_COLLAB_LOCAL_RELAY_ID`  | `00000000-0000-4000-8000-000000000001`   | Fixed relay id used to mark folders live.|

Install the built `main.js`, `manifest.json` and `styles.css` into each vault's
`.obsidian/plugins/system3-relay/` and enable the plugin.

> The local-auth commands and the stub login path are **tree-shaken out** of a
> normal (non-local-auth) production build, so this stays dev-only.

### Shortcut: build + install both vaults in one command

`scripts/dev-install.mjs` does the per-vault build, copies the artifacts into the
vault, and enables the plugin — for as many vaults as you list:

```bash
cd plugin
npm install   # first time only
npm run dev:install -- \
  --server http://127.0.0.1:3000 \
  --vault "/path/to/Vault A" --name Alice --email alice@localhost \
  --vault "/path/to/Vault B" --name Bob   --email bob@localhost
```

Then reload Obsidian (or toggle the plugin) in each vault. Re-run the same
command after code changes to rebuild and reinstall. Use `--no-enable` to skip
touching `community-plugins.json`, or `--relay <uuid>` to use a non-default
shared relay id.

## 3. Share a folder and collaborate

1. In **vault A**, run the command **"Share folder live (local server)"** and
   pick a folder. A notice shows the folder ID (also copied to the clipboard).
2. Create or open a Markdown note inside that folder.
3. In **vault B**, create a folder at the same relative path, run **"Join shared
   folder (local server)"**, pick that folder, and paste the folder ID from
   step 1.
4. Both vaults now connect to the same folder CRDT on y-sweet. The file tree
   syncs, the note appears in vault B, and edits flow live in both directions
   with cursors/awareness.

Both vaults must use the **same `LOCAL_RELAY_ID`** (the default) and the **same
folder ID** — that pair is what routes them to the same document on the server.

## How it works (M1 wiring)

- `LoginManager` runs a fixed stub identity (`LOCAL_AUTH`), so `loggedIn` is true
  and `user.token` provides the bearer — no OAuth/PocketBase.
- "Share"/"Join" set the folder's `relayId` to `LOCAL_RELAY_ID`, making its S3RN
  a `S3RemoteFolder` so it connects. (`SharedFolders` skips the RelayManager
  `remoteFolders` subscription in local-auth mode so the id isn't clobbered.)
- `LiveTokenStore` POSTs to `${API_URL}/token`; our issuer mints a y-sweet
  `ClientToken` (with `folder`/`authorization`/`expiryTime`); `YSweetProvider`
  connects over WebSocket. The CRDT/merge engine is unchanged from upstream.

## Status / caveats

- The server loop is covered by `server/scripts/e2e.sh` (automated).
- The plugin side is type-checked and builds; the **two-vault live round-trip is
  a manual test** (it needs the Obsidian desktop app and can't run headless).
- Discovery/permissions (real auth, listing shared folders) is deferred to M2;
  for now sharing is manual via the two commands above.
