# Architecture

[Português](../pt-BR/architecture.md)

Electron main owns filesystem capabilities, dialogs, settings, child processes, GitHub CLI, Docker and archives. Preload exposes a typed `BuilderAPI` through a context-isolated, sandboxed bridge. IPC arguments are validated with Zod and requests must originate from the main window/frame. Renderer has no Node integration. Navigation and new windows are blocked.

The React wizard and editors share JSONC/domain functions. JSONC edits apply AST-based patches. Dockerfile blocks retain their original raw text and offsets; operations change only selected blocks. Directives are pinned, comments remain explicit and unsupported syntax stays in source mode. Paths are checked lexically and through realpath to prevent symlink escapes. Stale disk snapshots block saves.

Project configuration remains standard Dev Containers JSONC. `builder.json` beside the selected configuration stores versioned custom tests. Global preferences and recent projects live in Electron userData. No service account or token is stored in project files.

The bundled CLI runs in Electron utilityProcess with the selected Docker endpoint. Dockerode reads that same endpoint for inspection, ownership checks, shell, logs and volumes. Managed containers carry a stable label derived from the project root/config path. Cleanup never includes persistent volumes. Host Git and GitHub CLI preserve the user’s credential setup.

Streams publish typed events. Renderer buffers and process captures are bounded. Operations carry cancellation signals; sessions/streams are disposed on close. ZIP selection rejects unsafe paths, symlinks and recognized sensitive files; dependency review is explicit.

Development uses Vite, Tailwind and local Monaco workers. electron-builder packages the application, CLI and Electron runtime. Linux and Windows validation is local; only macOS has GitHub Actions. See validation for practical coverage and outstanding platform checks.
