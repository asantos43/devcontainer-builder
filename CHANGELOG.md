# Changelog

All notable changes are documented here.

## [Unreleased]

### Added

- Electron/React/TypeScript workbench styled with Tailwind, with English and Portuguese UI.
- Eight-step creation wizard and structured configuration tabs.
- Lossless JSONC editing and Dockerfile instructions, comments, directives and source fallback.
- Existing project import, diff review, external-change detection and save rollback.
- Git/GitHub initialization, private/public remote creation and cloning into a host workspace.
- Docker Hub image/tag discovery and Dev Container Feature configuration.
- Host folders, named volumes, port settings, lifecycle hooks and VS Code customization.
- Bundled Dev Containers CLI with Electron utility runtime; Dockerode inspection, logs and shell.
- xterm.js output, environment checks, cancellation and JSON reports.
- Selected-file ZIP export with dependency review and sensitive-file exclusions.
- MPL-2.0 license, bilingual guides and AI agent instructions.
- Local Linux/Windows packaging and a macOS-only build/test workflow.
- Domain, filesystem, Electron UI and opt-in Docker integration tests.

### Fixed

- Wait for CLI stdout/stderr to drain after utility-process exit before parsing the container result.
- Keep merged configuration out of CLI logs and display readable build output.
- Disconnect shell sessions and refresh runtime status when stopping a container.
- Disable repository filesystem-monitor hooks during automatic Git status inspection.
