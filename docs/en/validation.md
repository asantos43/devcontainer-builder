# Validation

[Português](../pt-BR/validation.md)

Run `npm ci`, `npm run check`, `npm run format:check`, and `npm run test:e2e` in a graphical desktop session. Electron tests exercise the real main/preload/renderer, mock only native file pickers and use disposable folders. They cover wizard creation, local Git, comment editing/saving, bilingual UI and the bundled CLI’s Electron utility runtime.

Domain/file tests cover JSONC comment retention, CRLF, unknown properties, Dockerfile comments/directives, disabled instructions, source fallback, mount validation, stale saves, symlink boundaries and ZIP selection. They never contact GitHub or Docker.

`npm run test:docker` requires a live Docker daemon. It pulls Alpine, creates a temporary workspace and named volume, builds/starts with the official CLI, checks a lifecycle hook, inspects mounts, runs Dockerode exec and removes its own container/volume. Build images/cache may remain. It never removes unrelated resources. GitHub remote creation/push tests require a dedicated test account and are not performed automatically.

Use `npm run package:linux` locally on Linux or `npm run package:win` locally on Windows. Validate the unpacked executable with `npm run verify:package -- /path/to/executable`. macOS automation runs the same core/interface checks and verifies its packaged app on Intel and Apple Silicon. Real Docker Desktop checks remain a local macOS task when the runner has no daemon.

## Release acceptance

Record exact outcomes before release: checks, Electron UI, Docker smoke, Linux installer, Windows installer, macOS workflow, signed installer validation, GitHub private clone/create/push, Docker outside of Docker and rebuilding an exported ZIP in a clean folder. Never claim pending platform checks passed. See the PR for the implementation run’s actual results.

Additional local integration checks:

```sh
DCB_DOCKER_E2E=1 npx playwright test
DCB_FEATURE_SMOKE=1 npm run test:docker
```

On PowerShell set the corresponding `$env:` variable before running the command.

[Recorded implementation results](validation-results.md)
