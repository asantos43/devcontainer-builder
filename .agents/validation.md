# Validation

Run typecheck, lint and domain tests before committing. Exercise Electron through Playwright when available. Record unexecuted Docker or platform checks explicitly. Verify exported archives do not contain credentials or Git metadata.

The macOS workflow builds and tests macOS only. Linux and Windows use local scripts. Changes after the initial commit require a branch and PR.

Use `npm run check`, `npm run format:check` and `npm run test:e2e`. Opt into the real Electron/Docker/ZIP-rebuild scenario with `DCB_DOCKER_E2E=1 npx playwright test`. `DCB_FEATURE_SMOKE=1 npm run test:docker` also validates non-root Docker outside of Docker access. These Docker tests create and clean their own containers; build images/cache may remain.

Additional Electron opt-ins: `DCB_PODMAN_E2E=1`, `DCB_OCI_E2E=1`, `DCB_TRIVY_E2E=1`, `DCB_VOLUME_CLONE_E2E=1`, and `DCB_GITHUB_E2E_REPO=owner/repo`. The disposable GitHub creation test also needs `DCB_GITHUB_CREATE_E2E=1` and an OAuth token with `delete_repo`; it skips before creating resources if cleanup permission is absent. Use a temporary `DOCKER_CONFIG` for integration tests. Trivy is a host tool, not an application dependency. Native Windows/PowerShell, Podman Machine, remote SSH/TLS and signed update delivery require their own environments.
