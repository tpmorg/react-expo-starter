# Framework boundaries

- This repository is a reusable Expo starter. Keep product identity, domain types,
  screens, prompts, and migrations out of src/framework.
- App.tsx is the composition root. Inject feature migrations and optional adapters.
- Preserve migration compatibility and pending local work.
- Keep account changes safe across asynchronous auth and billing operations.
- Do not copy credentials or backend admin keys into client configuration.
- Run npm run typecheck, npm test, and npm run test:storage for infrastructure changes.
- Native builds, deployment, and service provisioning require a user request.
- Do not describe unit checks as device or live-service verification.
