# Mobile Framework Starter

A reusable, local-first Expo and React Native foundation for starting a product
without bringing product identity or domain logic into the framework layer.

The repository includes infrastructure for authentication, SQLite persistence,
remote jobs, billing state, media storage, connectivity, error reporting, and
queued synchronization. The checked-in app is intentionally a neutral storage
smoke screen—not a product shell or example product.

## What this starter provides

| Area | Included foundation |
| --- | --- |
| App lifecycle | Provider composition, configuration validation, error boundary, and a retryable database gate |
| Authentication | Auth contracts and store, anonymous fallback, and an adapter for an initialized Firebase Auth instance |
| Persistence | Transactional SQLite migrations plus job, usage, billing-cache, and sync-queue repositories |
| Remote jobs | Typed multipart job submission, bearer auth, one forced token refresh after `401`, bounded throttling retries, and polling |
| Billing | Account-safe billing store and an optional RevenueCat adapter for subscriptions and virtual-currency credit packs |
| Offline/sync | Owner-scoped queueing, exponential retry scheduling, stale-acknowledgement protection, and guarded merge decisions |
| Device storage | Namespaced AsyncStorage preferences and app-owned durable media copies |
| Operations | Network state and pluggable console/Sentry-compatible error reporting |
| Verification | Unit tests plus a real SQLite migration/storage regression check |

This repository does **not** include product screens, navigation routes, domain
types, feature migrations, assets, sign-in UI, backend endpoints, credentials,
or service provisioning. React Navigation packages are installed for product
composition, but the starter does not prescribe a navigation hierarchy.

## Requirements

- Node.js 22 or newer. The storage regression script uses the built-in
  `node:sqlite` module.
- npm.
- Expo Go for the neutral demo, or an Expo development build once native
  sign-in, purchases, or other native integrations are enabled.

## Quick start

```sh
npm ci
cp .env.example .env.local
npm run typecheck
npm test
npm run test:storage
npm run start:go
```

`EXPO_PUBLIC_API_URL` may remain empty for the demo. The app opens its local
SQLite database, runs the framework migrations, and writes a namespaced
preference. Auth remains anonymous, billing is not mounted, and remote job calls
remain unavailable until adapters and configuration are supplied.

Use `npm start` instead of `npm run start:go` when working with an installed
development client. Native builds and EAS builds are opt-in; they are not needed
for the repository's unit or storage checks.

## Architecture

`App.tsx` is the composition root. Product code supplies configuration, feature
migrations, and optional infrastructure adapters to the framework:

```text
App.tsx
  SafeAreaProvider
    AppServicesProvider
      AppErrorBoundary
        ConfigGuard
          DatabaseGate
            NetworkProvider
              AuthProvider
                IdentityReporter
                BillingProvider (only when configured and authenticated)
                  Product navigation and screens
```

The source tree is deliberately split by ownership:

```text
src/
  framework/              Reusable, product-neutral infrastructure
    api/                   Authenticated asynchronous job client
    auth/                  Auth contracts, state, and Firebase adapter
    billing/               Billing state and RevenueCat adapter
    config/                Runtime configuration parsing and validation
    errors/                Application error boundary
    media/                 App-owned file persistence
    network/               Connectivity monitor and provider
    observability/         Console and Sentry reporters
    storage/               SQLite database, migrations, and repositories
    sync/                  Queue worker and merge policy
    usage/                 Client-side generation-access hints
  features/               Product-owned code; add this directory per app
```

Keep domain models, prompts, feature screens, product assets, and feature
migrations under `src/features` (or another product-owned directory). Code in
`src/framework` must never import from a feature.

## Starting a product

1. Copy this repository without `.git`, `node_modules`, `.expo`, `android`, or
   `ios`.
2. Change the package name in `package.json` and the app name, slug, URL scheme,
   and platform identifiers in `app.config.ts`.
3. Set a unique `databaseName` and preference `namespace` in `App.tsx`. Treat
   both values as persistent identifiers after release.
4. Add product code outside `src/framework` and register feature migrations with
   `FrameworkOptions.migrations`.
5. Add product navigation and screens beneath `FrameworkProviders`.
6. Supply the adapters the product needs: `AuthGateway`, `BillingGateway`,
   `ErrorReporter`, and a `SyncTransport` used by your own sync coordinator.
7. Configure only client-safe environment values in `app.config.ts`. Never put
   admin credentials, provider secrets, or backend service keys in Expo `extra`.
8. Run the validation commands below, then perform simulator/device and live
   service checks appropriate to the adapters you enabled.

The existing options show the minimum composition contract:

```tsx
const options: FrameworkOptions = {
  databaseName: 'your-product.db',
  namespace: '@your-product',
  jobsPath: '/api/v1/jobs',
  migrations: featureMigrations,
  authGateway,
  billingGateway,
  reporter,
};
```

Keep this object referentially stable—define it outside the component or memoize
it—because changing it recreates the service graph.

## Configuration

The starter currently wires one environment value through `app.config.ts`:

| Environment value | Expo `extra` key | Required | Purpose |
| --- | --- | --- | --- |
| `EXPO_PUBLIC_API_URL` | `apiUrl` | No | Base URL used by `GenerationApiClient`; non-local URLs must use HTTPS |

`runtimeConfig.ts` also understands Sentry and RevenueCat-related public client
configuration. If a product uses those helpers, explicitly map the relevant
values into Expo `extra` and inject the matching adapter. Keep RevenueCat public
SDK keys separate from store shared secrets and backend API keys.

Missing API configuration is a warning so the local starter can run. An invalid
URL, or non-HTTPS URL outside `localhost`, `127.0.0.1`, and Android emulator host
`10.0.2.2`, blocks the product tree through `ConfigGuard`.

## Integration contracts

### Feature migrations

Core migrations always run before migrations passed through
`FrameworkOptions.migrations`. Migration IDs must be unique and migrations run
once, transactionally, in array order. Released migrations are append-only:
never rename or rewrite an ID already shipped to users.

### Authentication

The default `GuestAuthGateway` keeps the app anonymous. To use Firebase, initialize
Firebase Auth in product code and inject `FirebaseAuthGateway`; persistence,
provider setup, sign-in UI, deep links, and platform credentials remain product
responsibilities.

The generic API client asks the gateway for a bearer token and forces exactly
one refresh after a `401` response.

### Remote jobs

`GenerationApiClient<Request, Result>` expects:

- `POST /api/v1/jobs` (or the configured path) with multipart `image` and
  JSON-stringified `request` fields;
- an `Authorization: Bearer …` header;
- a caller-owned stable `Idempotency-Key` header; and
- job responses containing `id`, `status`, and optional `result`, `error`, and
  `pollAfterMs` fields.

Create and persist a `JobRepository` draft **before** submission, then store the
remote job ID and status. This allows interrupted work to resume without issuing
a second billable request. The starter supplies persistence and polling
primitives; it does not start a background job runner automatically.

Only explicitly retryable `RATE_LIMITED` and `THROTTLED` `429` responses are
automatically retried. Other failures are returned to the product to resolve.

### Billing and usage

`RevenueCatGateway` supports subscriptions and explicit credit-pack product IDs.
Billing SDK operations are serialized, and session epochs reject stale startup,
refresh, purchase, restore, and sign-out results when accounts change during an
asynchronous operation.

Cached billing state and `getGenerationAccess` are display-continuity and UI-hint
mechanisms only. The backend must atomically authenticate the user, enforce rate
limits, admit the operation, debit the entitlement or credits, and refund failed
work. Never trust the client to authorize a chargeable operation.

### Synchronization

`SyncQueueRepository` coalesces work by owner, entity, and operation. Replacing a
queued entry gives it a new ID so a late acknowledgement for older work cannot
delete the replacement. `SyncWorker` processes ready entries sequentially and
backs failures off to a maximum of 15 minutes.

The framework does not schedule `SyncWorker`. Product code owns the transport,
trigger policy, lifecycle/background integration, and conflict UI. Use the merge
policy before overwriting local state; pending, failed, conflicted, newer, or
otherwise unsynced local records are preserved by default.

### Media

`MediaStore.persist` copies a local URI under the app document directory. Removal
is restricted to that app-owned media root. Remote downloading, upload, cache
eviction, encryption, backup policy, and durable-save orchestration belong to the
product.

## Validation

Run these after changing framework infrastructure:

```sh
npm run typecheck
npm test
npm run test:storage
```

| Command | What it establishes | What it does not establish |
| --- | --- | --- |
| `npm run typecheck` | TypeScript source compatibility | Runtime or native behavior |
| `npm test` | Jest regression coverage for framework logic | Device, service, or store behavior |
| `npm run test:storage` | Fresh and legacy migration behavior against Node's real SQLite engine, data preservation, queue replacement, and owner isolation | Expo SQLite behavior on iOS or Android |

After adding native adapters, separately verify the development build on each
supported platform. Firebase persistence and native sign-in, RevenueCat purchase
and restore flows, Expo SQLite, filesystem behavior, connectivity transitions,
deep links, and backend authorization all require simulator/device or live-service
proof. Passing unit checks is not device or production verification.

## Reliability and security boundaries

- Queue acknowledgements cannot erase a newer replacement entry.
- Storage records and queue reads are owner-scoped where identity matters.
- Account changes invalidate stale asynchronous billing results.
- Durable media deletion refuses paths outside the framework-owned media root.
- Remote jobs use caller-stable idempotency keys and authenticated requests.
- Local SQLite and AsyncStorage data are **not encrypted** by this starter.
- Client configuration is recoverable from an app bundle; only public values may
  be exposed through Expo configuration.
- Server-side authentication, authorization, credit accounting, provider keys,
  webhook verification, rate limiting, and temporary-media retention are outside
  the client framework and must remain authoritative on the backend.

## Build scripts

The repository includes local native-run scripts and EAS profiles for development,
preview, and production builds. Review identifiers, signing, environment values,
plugins, permissions, and store configuration before using them. A successful EAS
submission is not evidence that native integrations or live services work.

## Baseline and dependency status

This extraction retains its source project's Expo SDK 54 baseline. Optional
Firebase, RevenueCat, and Sentry packages are included for convenience; remove an
unused adapter and its package together. Treat Expo SDK modernization as a
deliberate migration rather than an incidental dependency update.

As of 2026-10-15, compatible npm audit fixes removed the previously reported
critical advisory. The complete dependency tree still reports 66 advisories
(51 high and 15 moderate), including development tooling and optional SDK
transitive dependencies. This is not a security-cleared release baseline; rerun
the audit and review supported upgrades before shipping a product.
