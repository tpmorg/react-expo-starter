# Framework iteration from Purrlates

Reviewed against `purrlates/docs/framework-recommendations.md` on 2026-10-31.
The production app is evidence for repeated needs; its endpoints, domain models,
merge rules, tokens, and release declarations are not starter defaults.

## Assessment and decisions

The auth restoration bug is confirmed: a synchronous null user cannot distinguish
"no session" from "session not restored yet". The first auth callback is the
authority. The other P0 recommendations address real coupling, privacy, and API
friction and are included.

The new mechanisms are useful across apps, with these adjustments:

- Account merge recovery is journaled before the account switch, not just after a
  failed server call. Local rekey failures stop the merge and retain recovery work.
  A crash before the destination uid is persisted requires backend proof through
  `confirmMergeDestination` before `recoverPendingMerge` can bind it to a login.
- Deletion retains a cleanup journal until every registered local store is purged.
  If the server outcome is uncertain, the service reports `recovery_required`;
  it cannot infer success from a revoked token or erase another account's data.
  Backend delete and merge endpoints must be idempotent.
- API retries are fenced by account identity and session revision, including
  switching away and back. Timeout covers auth, fetch, and response-body parsing.
  Server messages are not copied into exceptions; response schemas never place
  validation bodies in errors. `details` is scrubbed, but still treat it as private
  app data and do not render arbitrary details to people.
- Chargeable requests retain unknown outcomes and reuse their original keys.
  An explicit terminal-error predicate is needed to discard a rejected operation.
  Never retry a native store purchase just because its caller lost the result.
  A confirmed RevenueCat payment remains `purchased` with unverified state if the
  subsequent credit refresh fails; refresh/reconcile the balance rather than pay again.
- Splash holding is an explicit call in the app entry point. Importing a module
  does not hold the native splash. Theme tokens and intro visuals remain app-owned.
- Preserve the shipped `core-001` SQL and legacy imports. Add the outbox migration
  only when enabled. Generation-related services are lazy; old schemas remain
  readable. The optional generation model and access hint now live in `src/modules`.
- Do not assert `usesNonExemptEncryption: false` for every future product. Each app
  must answer that release declaration. Likewise, preview builds do not silently
  ignore source-map upload failures; teams may choose that policy deliberately.
- Provide a small test kit. Avoid global fake video/audio/haptics implementations
  for modules the starter does not use; they can hide broken feature integrations.
  No private React Native LogBox internals are globally replaced.

## Recommendation coverage

| Document item | Result |
| --- | --- |
| 1 Auth restoration | Fixed; delayed callback, restored account, and guest-session tests |
| 2 Sentry privacy | Framework scrubber, id-only identity, event/transaction/breadcrumb hooks, environment and navigation integration |
| 3 Fallback screens | Neutral defaults and optional render slots |
| 4 Billing lifecycle | Typed `BillingAccountChangedError` and `whenSettled()` |
| 5 Contracts | Guest/provider metadata, richer prices, non-consumables, legacy billing normalization, public keys/environment |
| 6 Account lifecycle | Generic ports, serialized lifecycle, owner registry, merge/delete journals, native provider and Firebase adapters |
| 7 JSON API | Schema port, auth modes, conditional GET, errors, timeout and identity fencing; job client delegates transport |
| 8 Durable operations | Optional SQLite outbox, owner-scoped keys, run/resume and explicit terminal classification |
| 9 Sync policy | Batch results, deferral, shared owner runs, acknowledge-before-merge, pull cursor and foreground hook |
| 10 Boot | Explicit splash controller, named boot steps, timeout and optional overlay, font fallback |
| 11 Theme | Typed theme factory, persisted preference, readiness, fixed theme, native background, contrast helpers, automatic appearance |
| 12 Notifications | Configurable source/channel/deep-link policy, native presence check, web unavailable stub |
| 13 Test kit | SQL/KV ports, Node SQLite utility, memory preferences, test providers, phone viewport, TS script runner |
| 14 Network | `isOnline` treats unknown initial probe as potentially online |
| 15 Web preview | Web dependencies, SQLite WASM/COOP/COEP configuration, static preview server, explicit unsupported durable media |
| 16 Generation optionality | Lazy services, optional module location, compatibility forwarders, optional billing provider |
| 17 Config templates | Public environment wiring, conditional plugins, iPad orientations, remote versioning, development upload policy |
| 18 Hardening | Corrupt preference recovery, billing store-mode and entitlement-difference diagnostics |

## Using the new modules

Import native adapters and React modules directly from their files. Node test
utilities must only be imported by tests/scripts, never by application barrels.

### Auth and accounts

`AuthState.status === 'anonymous'` means no session. A Firebase anonymous user has
`status === 'authenticated'` and `user.isAnonymous === true`; billing can load for
that guest. `FrameworkProviders billingProvider={false}` lets a product purchase
service own the billing lifecycle instead.

Initialize an app-owned Firebase application and call
`auth/initializeFirebaseAuth`. It persists auth with AsyncStorage on native and
uses browser persistence on web. The root `tsconfig.json` maps `@firebase/auth`
to its React Native declaration file; retain that mapping in derived apps.
Only an already-initialized error falls back to `getAuth`; unrelated setup errors
are not swallowed.

Construct `AccountService<Profile, Credential, ExistingCredential>` with:

- `auth`: the auth mutation port (`FirebaseAccountAuth` is provided);
- `session`: the framework `AuthStore`;
- `backend`: the app's bootstrap, merge-ticket, complete-merge and delete methods;
- `store`: namespaced `KeyValuePort` persistence;
- `localData`: an `OwnedLocalDataRegistry`; and
- optional identity providers and the app's reporter.

Call `sync(authState, isOnline(network))` on auth/connectivity/foreground changes.
It drains the newest inputs even if Firebase emits a guest before its sign-in
promise resolves. Subscribe to the snapshot for bootstrap/recovery UI. Use
`accountErrorMessage` for user-facing errors, not raw provider messages.

Register each feature repository with the owner registry. `rekeyOwner` must be
idempotent and apply the feature's collision/merge rules; `purgeOwner` must delete
only that owner's records and files. `LOCAL_OWNER` (`local`) data is adopted by
the first session. Register repositories before calling sync. The registry does
not guess ownership from table names or silently reassign financial operations.
It attempts all purge handlers and retains recovery on any failure.

Keep queued financial work tied to its original owner and reconcile it before an
account merge. A pending job or debit is not automatically transferable to a new
uid. The backend owns that policy and the idempotency namespace across merges.

Apple sign-in hashes a fresh nonce for Apple and passes the original to Firebase.
Google is loaded only if its native module and client IDs are available, with
Play Services checked on Android. Both handle cancellation. Native providers are
unavailable in the web stub; implement browser sign-in in the app if needed.

### HTTP and durable operations

`services.api.request('/path', { method, body, auth, schema })` defaults to required
auth. A schema is any `{ parse(value: unknown): T }` object, including Zod schemas.
Omit it only for responses whose bodies are intentionally ignored, such as `204`.
`allowNotModified: true` returns null for `304`. The error envelope is
`{ error: { code, message, retryable, requestId, details? } }`; legacy flat job
errors are accepted. There is one token refresh on `401`, no mutation retry.

Enable `FrameworkOptions.modules.operations` to add the append-only
`operations-001-outbox` migration and `services.operations`. For payload typing,
construct `PendingOperationStore<Payload>(services.database, ids)` after enabling
the module. Its workflow is:

```ts
const op = await pending.create(ownerId, actionKey, payload);
const result = await pending.run(op, saved => api.request('/action', {
  method: 'POST', body: saved.payload, schema: responseSchema,
  headers: { 'Idempotency-Key': saved.idempotencyKey },
}), { isOwnerActive: uid => auth.getOwnerId() === uid });
// On launch/reconnect: pending.resume(ownerId, send, theSameOptions).
```

Reusing an action key resumes the original payload; use a new action key for a new
intent. Unknown failures remain pending. Supply `isTerminal` only for definitive
server rejections; timeout, invalid responses, auth changes, and transport errors
do not prove that a debit failed. The server must persist idempotent results.

### Sync

`SyncTransport` may implement `apply` or `applyBatch`. A batch returns each queue
entry's `id` with `completed`, `failed`, or `deferred`. Missing results stay queued.
`deferred` must be returned for offline or unconfigured transport; thrown errors
count as failed attempts. Completed results may return a `merge()` callback. The
worker acknowledges the exact uploaded queue ID before invoking it, so an edit
queued mid-upload remains present. Merge callbacks still need the app's conflict
rules; failed merges should be repaired by the next pull.

For account-backed transports, supply the worker's fourth constructor argument:
`{ isOwnerActive: uid => auth.getOwnerId() === uid }`. A switch during upload keeps
the old owner's work queued and prevents its response from being merged into the
new session. Remote application must be idempotent because it may already have
succeeded before the switch was observed.

Mount `SyncTriggers` or use `useSyncTriggers({ ownerId, run, intervalMs, onError })`
inside `NetworkProvider`. The hook returns an on-demand trigger and runs on owner
change, reconnect, foreground and an active-app interval. It shares an ongoing
run per owner. The transport must check current owner identity before sending;
the provided `ApiClient` does so automatically when used with `AuthStore`.
Native background scheduling is not implemented by this foreground policy.

Persist `PullCursor` only after all pulled rows have been safely merged. Use a
distinct stream name for each independently paginated dataset.

### Boot and theme

Use `createTheme({ light, dark })` from `theme/ThemeProvider` to obtain typed
`ThemeProvider`, `FixedThemeProvider`, and `useTheme`. Supply `store` and optionally
`background: tokens => tokens.background`; token names are app-owned. Its value
contains `ready`, `name`, `tokens`, `preference`, and `setPreference`. Pass `ready`
to `useBootStep('theme', ready)` to prevent a startup theme flip.

Call `holdNativeSplash()` once at the product entry point, then mount
`BootGate steps={['theme', 'fonts', 'content']} splash={splash}` above the app.
Children remain mounted to load their data. Report steps with `useBootStep`.
The default six-second deadline hides the splash even if a gate fails.
An optional overlay receives `{ ready, finish }` and is removed at the deadline.
`FontGate` accepts the app's font map and marks its step on success or failure;
use family/weight subpath imports rather than importing every font weight.

Theme validation should cover all tokens as `#RRGGBB`, text pairs at least 4.5:1,
and required controls/indicators at least 3:1. `contrastRatio` and
`relativeLuminance` are available. Apps supply the pairs and any navigation-theme
mapping. `DENSE_MAX_FONT_SCALE` is optional and should not cap normal body text.

### Notifications, telemetry, and previews

`createNotificationGateway({ source, channelId, channelName, isAllowedUrl })` may
return null for missing native modules. Configure the notification plugin and
rebuild a development client before expecting it to work. Replacement and
cancellation touch only that source's schedules, and Android creates the channel
before prompting for permission. Deep-link allowlists are app-owned. The adapter
installs a foreground handler, so a product with other notification sources must
coordinate that app-wide handler deliberately.

Call `configureSentry(dsn, environment)` explicitly if enabled and register the
exported `navigationIntegration` with the app's navigation container. Identity is
id-only, PII collection is disabled, and outgoing error, transaction and breadcrumb
strings are scrubbed. Scrubbing is defense in depth; apps must still avoid logging
private bodies or credentials. No service is initialized by the neutral demo.

Web preview uses `npm run start:web` or `npm run serve:web` for an existing export.
SQLite WASM requires the cross-origin isolation headers configured in Metro and
the local static server. External media/font hosts may need compatible CORS
policies. Native sign-in, notifications and durable media require platform-specific
adapters; web preview does not validate those capabilities.

The test kit provides `memoryStore`, `openMemoryDatabase` (Node-only),
`TestProviders`, and `scripts/run-ts.cjs`. Wrap test providers in the app's
`FixedThemeProvider`. `jest.setup.js` supplies AsyncStorage and phone dimensions;
feature tests can override dimensions. Install the renderer peer required by
the specific Testing Library version you choose; this starter uses React's
matching `react-test-renderer` for its provider regressions.

## Validation limits

Run `npm run typecheck`, `npm test`, and `npm run test:storage` for infrastructure
changes. Node SQLite tests cover fresh/legacy SQL and durable-operation recovery;
they do not prove native SQLite behavior. Native Apple/Google sign-in, purchases,
local notifications, native splash/fonts/theme, browser isolation and live backend
merge/delete semantics still require platform and service verification in the
next app. No native builds, deployment, or service provisioning are part of this
iteration.
