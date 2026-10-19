# Validation

Run typecheck, lint and domain tests before committing. Exercise Electron through Playwright when available. Record unexecuted Docker or platform checks explicitly. Verify exported archives do not contain credentials or Git metadata.

The macOS workflow builds and tests macOS only. Linux and Windows use local scripts. Changes after the initial commit require a branch and PR.

Use `npm run check`, `npm run format:check` and `npm run test:e2e`. Opt into the real Electron/Docker/ZIP-rebuild scenario with `DCB_DOCKER_E2E=1 npx playwright test`. `DCB_FEATURE_SMOKE=1 npm run test:docker` also validates non-root Docker outside of Docker access. These Docker tests create and clean their own containers; build images/cache may remain.

Additional Electron opt-ins: `DCB_PODMAN_E2E=1`, `DCB_OCI_E2E=1`, `DCB_TRIVY_E2E=1`, `DCB_VOLUME_CLONE_E2E=1`, and `DCB_GITHUB_E2E_REPO=owner/repo`. The disposable GitHub creation test also needs `DCB_GITHUB_CREATE_E2E=1` and an OAuth token with `delete_repo`; it skips before creating resources if cleanup permission is absent. Use a temporary `DOCKER_CONFIG` for integration tests. Trivy is a host tool, not an application dependency. Native Windows/PowerShell, Podman Machine, remote SSH/TLS and signed update delivery require their own environments.

Roadmap integration opt-ins: `DCB_AI_E2E=1` builds the local Feature and runs all three CLI version commands; `DCB_PRIVATE_VOLUME_E2E=1` with `DCB_GITHUB_E2E_REPO` clones the selected private GitHub repository into a disposable volume; `DCB_IMAGE_SCAN_E2E=1` exports a built image for host Trivy. These use local Docker/network and clean their own containers/volumes. No AI account login is performed.

Run `npm run check:system`; `DCB_RELEASE=1 npm run check:release` must reject missing signing credentials on Windows/macOS. Platform requirement unit tests simulate host facts and do not establish Windows/macOS installer compatibility. Live OCI publication and each platform’s OS credential-store backend need explicit environment coverage.
