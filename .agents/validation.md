# Validation

Run typecheck, lint and domain tests before committing. Exercise Electron through Playwright when available. Record unexecuted Docker or platform checks explicitly. Verify exported archives do not contain credentials or Git metadata.

The macOS workflow builds and tests macOS only. Linux and Windows use local scripts. Changes after the initial commit require a branch and PR.

Use `npm run check`, `npm run format:check` and `npm run test:e2e`. Opt into the real Electron/Docker/ZIP-rebuild scenario with `DCB_DOCKER_E2E=1 npx playwright test`. `DCB_FEATURE_SMOKE=1 npm run test:docker` also validates non-root Docker outside of Docker access. These Docker tests create and clean their own containers; build images/cache may remain.
