# Coupling Analysis — Relay fork → our self-hosted server

> Scope: understand how the imported Relay plugin (`plugin/`) is coupled to
> Relay's proprietary cloud (PocketBase auth + the `api.system3.md` control
> plane + tenant licensing), so we can plan the M1 rewiring without tearing out
> dependencies we actually want to keep.
>
> Method: token flow, `ClientToken`, `LoginManager`, `EndpointManager`, the
> esbuild URL injection and our server issuer were read directly. The broader
> manager wiring / `RelayManager` / `CAS` surface was mapped by a fan-out code
> exploration; line numbers there are approximate.

## TL;DR

The **live-sync hot path is clean and decoupled** from PocketBase. Making a
single note collaborate against our own server is a *small, well-contained*
change. The **expensive coupling is in two bootstrap concerns** that sit
*before* the hot path:

1. **Login state** (`LoginManager`, PocketBase OAuth) — the hot path only needs
   `loginManager.loggedIn === true` and a `loginManager.user.token` bearer.
2. **Identity/discovery** (`RelayManager`, PocketBase) — how a folder/note is
   assigned its `relay`/`folder`/`doc` ids (the S3RN) and marked "shared".

For M1 we **shim** (1) and (2) with minimal local stubs rather than
reimplementing them. The CRDT sync engine (`Document`, `HasProvider`,
`YSweetProvider`, `merge-hsm`, `y-codemirror.next`) needs **no changes**.

## The token flow (verified)

`plugin/src/LiveTokenStore.ts` `refresh()`:

```
POST  ${loginManager.getEndpointManager().getApiUrl()}/token
Headers: Authorization: Bearer ${loginManager.user.token}
         Relay-Version, Obsidian-Version, ...   (customFetch.getRelayRequestHeaders)
Body:    { docId, relay, folder, device? }       (derived from the S3RN)
Resp:    ClientToken { url, baseUrl, docId, folder, token, authorization, expiryTime, ... }
```

- `ClientToken` is defined in `plugin/src/client/types.ts` and is essentially
  the y-sweet client token plus a `folder` field.
- **Our server issuer already implements this contract.** `server/src/issuer.ts`
  accepts `{ docId, relay?, folder?, device? }` + `Authorization: Bearer <user>`
  and returns a y-sweet `ClientToken` via `getOrCreateDocAndToken`. The auth
  check is stubbed for the MVP (TODO M2). The only gaps vs. the client's type
  are the extra `folder` (cosmetic) and `expiryTime`/`authorization` fields,
  which are easy to fill in.
- There is also `POST /file-token` for binary files — **M3**, ignore for now.

So on the wire, **client and server already speak the same language.** What's
missing is pointing the client at our URL and getting it past the login gate.

## Where the proprietary cloud is wired in

### Hardcoded endpoints (build-time injection) — EASY

`plugin/esbuild.config.mjs` injects globals via esbuild `define`:

```
API_URL  = "https://api.system3.md"   (line ~40, 160)
AUTH_URL = "https://auth.system3.md"  (line ~41, 161)
GIT_TAG  = <git tag>
```

`EndpointManager.getApiUrl()` returns `_validatedApiUrl || API_URL`
(`plugin/src/EndpointManager.ts:194`). With no validated tenant it returns the
injected default. **Intervention point: make `API_URL`/`AUTH_URL` configurable
(local default + a settings field) instead of `system3.md`.**

### LoginManager (PocketBase OAuth) — HARD to replace, EASY to shim

- `plugin/src/LoginManager.ts` is PocketBase + OAuth2 (Google/GitHub/Microsoft/
  OIDC). It owns `pb`, token refresh, and the `/flags`, `/whoami` calls.
- Public surface consumed by the rest of the plugin: `loggedIn`, `user`
  (`{ id, name, email, picture, token }`), `getEndpointManager()`, `login()`,
  `logout()`, and the `Observable` listener API (`on`/`off`/`notifyListeners`).
- **The hot path only touches `loggedIn` and `user.token`** (via
  `LiveTokenStore`). It does **not** care *how* the user logged in.
- Consumers: `main.ts`, `RelayManager` (`pb = loginManager.pb`), `HasProvider`,
  `Document`, `LiveTokenStore`, `CAS`, `SharedFolder`, `BackgroundSync`,
  `DeviceManager`, several `ui/*` modals.
- **M1 strategy: keep the class and its public surface; add a "local/stub"
  login mode** that sets `user` to a fixed identity and makes `loggedIn` true
  without OAuth, so PocketBase never has to succeed. (`getFlags()`/`whoami()`
  failures against our server are already caught and non-fatal.)

### RelayManager (PocketBase discovery/permissions) — VERY HARD, defer

- `plugin/src/RelayManager.ts` (~2300 lines) manages relays, remote shared
  folders, roles, subscriptions, invitations via PocketBase collections and
  realtime SSE, plus custom `/api/...` actions.
- **Not on the live-sync hot path** for an already-identified document. Its job
  is *discovery*: telling the plugin which folders are shared and what their
  ids/permissions are.
- This is the real M2 work (auth/discovery). For M1 we only need a **minimal way
  to assign one folder/note its S3RN ids and mark it shared** — a local config
  shim, not the PocketBase graph.

### EndpointManager (tenant licensing) — MEDIUM

- URL management is cleanly separable from auth. License validation hits
  `/.well-known/relay.md/license` and verifies a JWT against a hardcoded RSA key
  (`plugin/src/EndpointManager.ts`). **For M1: bypass license validation; just
  return our configured URL from `getApiUrl()`.**

### Other PocketBase touch points

- `CAS.ts` (content-addressed store) builds its own PocketBase from
  `getAuthUrl()` — binary/blob transport, **M3**.
- `plugin/src/pocketbase/LocalAuthStore.ts` — a `BaseAuthStore` impl; harmless,
  can stay until LoginManager is fully replaced.

## S3RN — the addressing scheme (keep as-is)

`plugin/src/S3RN.ts`: `s3rn:relay:relay:<relayId>:folder:<folderId>:doc:<docId>`
with entity types `S3RemoteDocument | S3RemoteFolder | S3RemoteCanvas |
S3RemoteFile` (+ local variants). `LiveTokenStore` decodes the S3RN to build the
`/token` request body. The scheme is independent of PocketBase — **we keep it**;
our server just has to accept the same `{ docId, relay, folder }` shape (it
already does).

## Hot path (what must work, end to end)

```
open note → SharedFolder.getOrCreateDocument → Document (extends HasProvider)
   → HasProvider.connect() → LiveTokenStore.getToken()
       → refresh(): POST {getApiUrl()}/token  (needs loggedIn + user.token)
   → makeProvider(clientToken) → YSweetProvider(token.url, docId, ydoc)
   → provider.connect()  → WebSocket sync via y-sweet
```

Required on this path: `EndpointManager.getApiUrl()`, `LoginManager.{loggedIn,
user.token}`, `LiveTokenStore`, `YSweetProvider`. **Not** required:
`RelayManager`, OAuth, licensing.

## Recommended M1 plan (shim, don't rip)

Smallest change that yields two Obsidian clients live-editing one note against
our `server/`:

1. **Point the client at our server.** Make `API_URL`/`AUTH_URL` configurable in
   `esbuild.config.mjs` (env override, local default e.g. `http://127.0.0.1:8080`)
   and/or expose an "API URL" setting that feeds `EndpointManager`.
2. **Local login shim.** Add a stub login mode to `LoginManager` that sets a
   fixed `user` (id/name/email + a dummy bearer) and `loggedIn = true` without
   OAuth/PocketBase. Gate it behind a build flag or setting.
3. **Fill the issuer's `ClientToken`** so it carries `folder`, `authorization`,
   and an `expiryTime` the client's `TokenStore` is happy with.
4. **Local "shared folder" shim.** A minimal way to assign a folder/note its
   S3RN ids and mark it live without `RelayManager` (e.g. a local settings entry
   or a tiny discovery endpoint on our server). This is the one genuinely new
   piece M1 needs.
5. **Verify** with two vaults pointed at one running `server/` (extend the
   existing `server/scripts/e2e.sh` smoke test toward a real provider round-trip).

Deliberately deferred: full auth/discovery (M2 → replace `RelayManager`), blob
sync (M3 → `CAS`/`SyncFile`), Excalidraw/Canvas (M4).

## Effort & risk

- Steps 1–3: small, low risk, mostly config + one stub path.
- Step 4: the real design decision — how folders/notes get identity and are
  marked shared without the PocketBase graph. Keep it minimal for M1; it grows
  into M2's discovery service.
- The sync engine and merge state machine are untouched, so the hard
  correctness-critical code carries no rewrite risk in M1.
</content>
