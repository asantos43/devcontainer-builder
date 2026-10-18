# DevContainer Builder

An Electron workbench for creating, editing, testing and exporting development containers.

[Português](README.pt-BR.md) · [Guide](docs/en/guide.md) · [Architecture](docs/en/architecture.md) · [Validation](docs/en/validation.md) · [Roadmap](TODO.md)

## What it does

- Eight-step creation wizard, followed by a tabbed editor for fine-tuning.
- Existing project import, JSONC preservation and review before saving.
- Dockerfile visual operations, editable comments and a local Monaco source editor.
- Git repositories on the host: initialize, create on GitHub or clone; mount into the container.
- Image/tag discovery, Dev Container Features, lifecycle commands and VS Code customization.
- Host folders and named volumes, including read-only mounts.
- Official Dev Containers CLI for creation; Dockerode for inspection, logs and interactive shell.
- xterm.js terminal, custom environment checks and JSON reports.
- ZIP export with file selection, dependency review and sensitive-file exclusions.
- Portuguese/English UI. No hosted AI service is required.

## Run locally

Requires Node.js 22.16+ and npm. Docker Engine/Desktop is required to run containers. Git and GitHub CLI are required for their respective repository actions.

```sh
npm ci
npm run dev
```

The application bundles the Dev Containers CLI and uses Electron’s Node utility runtime. It does not require a global `devcontainer` installation. Docker, Git and `gh` remain host tools.

```sh
npm run check          # TypeScript, ESLint, domain/file tests
npm run test:e2e       # Build and Playwright Electron tests (graphical session required)
npm run test:docker    # Real Docker build, lifecycle, mounts and exec; pulls Alpine
npm run package:linux # Local Linux AppImage and DEB
npm run package:win   # Local Windows NSIS installer
npm run package:mac   # macOS DMG on macOS
```

Linux and Windows validation/builds run locally. The only GitHub Actions workflow builds and tests macOS Intel and Apple Silicon. It does not publish releases. Signing/notarization requires maintainer credentials; see the guide.

## Existing environments

Opening or saving a project never executes commands or restarts its container. Dockerfiles are not regenerated on import: comments, directives and untouched text are retained. Advanced syntax stays available in source mode. Saving shows a diff and rejects stale writes after external changes.

Review Dockerfiles, host lifecycle commands and mounts before starting an imported project. Docker socket access allows control of the host Docker daemon.

## Project policy

This repository starts private. After the initial commit, changes use a dedicated branch and a pull request into `main`; no automatic merges. The application does not impose this policy on users’ repositories.

Documentation is bilingual. `README.md`, TODO, CHANGELOG, CONTRIBUTING and SECURITY are English; only the README and guides have Portuguese counterparts. Agent instructions live in [AGENTS.md](AGENTS.md) and `.agents/`.

Licensed under [Mozilla Public License 2.0](LICENSE), SPDX `MPL-2.0`.
