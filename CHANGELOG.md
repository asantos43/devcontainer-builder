# Changelog

All notable changes are documented here.

## [Unreleased]

### Added

- Persistent VS Code palette selection for the workbench, Monaco source/diff editors and xterm terminals.
- Docker/Podman engine selection, rootless socket discovery, SSH forwarding and TLS endpoint configuration.
- Compose service/YAML editing, multi-file persistence/export and coordinated service shutdown.
- Official Docker in Docker Feature and assistants for host-engine/SSH-agent sockets and secret references.
- Registry sign-in/out through engine credential stores and staged OCI template creation.
- Feature version inspection, reviewed lockfile updates and configuration comparison.
- Public repository cloning into volumes and portable TAR volume backup/restore with path validation.
- Trivy filesystem dependency SBOM/vulnerability reports and opt-in packaged application update checks.
- Generated project-root start/stop/shell helpers for POSIX shell and PowerShell; existing helpers are preserved.
- macOS ZIP/update metadata artifacts alongside DMG, with publishing kept manual.

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

- Accept Dev Container variable references in mount destinations, workspace paths and volume names without replacing the saved templates.
- Keep terminal sessions mounted while application preferences are open.
- Restore Monaco hover factories to application-lifetime services after temporary diff editors close.
- Normalize Docker/Podman archive paths and start temporary volume helpers before API file access.
- Use the requested volume name after Dockerode 5 volume creation.
- Support CLI-generated Dockerfiles outside Compose build contexts with current Buildx.

- Wait for CLI stdout/stderr to drain after utility-process exit before parsing the container result.
- Keep merged configuration out of CLI logs and display readable build output.
- Disconnect shell sessions and refresh runtime status when stopping a container.
- Disable repository filesystem-monitor hooks during automatic Git status inspection.
