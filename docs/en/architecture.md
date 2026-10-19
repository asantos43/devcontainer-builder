# Architecture

[Português](../pt-BR/architecture.md)

Electron main owns filesystem capabilities, dialogs, settings, child processes, GitHub CLI, Docker and archives. Preload exposes a typed `BuilderAPI` through a context-isolated, sandboxed bridge. IPC arguments are validated with Zod and requests must originate from the main window/frame. Renderer has no Node integration. Navigation and new windows are blocked.

The React wizard and editors share JSONC/domain functions. JSONC edits apply AST-based patches. Dockerfile blocks retain their original raw text and offsets; operations change only selected blocks. Directives are pinned, comments remain explicit and unsupported syntax stays in source mode. Paths are checked lexically and through realpath to prevent symlink escapes. Stale disk snapshots block saves.

Project configuration remains standard Dev Containers JSONC. `builder.json` beside the selected configuration stores versioned custom tests. Global preferences and recent projects live in Electron userData. No service account or token is stored in project files.

The bundled CLI runs in Electron utilityProcess with the selected Docker endpoint. Dockerode reads that same endpoint for inspection, ownership checks, shell, logs and volumes. Managed containers carry a stable label derived from the project root/config path. Cleanup never includes persistent volumes. Host Git and GitHub CLI preserve the user’s credential setup.

Streams publish typed events. Renderer buffers and process captures are bounded. Operations carry cancellation signals; sessions/streams are disposed on close. ZIP selection rejects unsafe paths, symlinks and recognized sensitive files; dependency review is explicit.

Development uses Vite, Tailwind and local Monaco workers. electron-builder packages the application, CLI and Electron runtime. Linux and Windows validation is local; only macOS has GitHub Actions. See validation for practical coverage and outstanding platform checks.

The engine adapter selects Docker or Podman, shares its API endpoint with Dockerode, and handles TLS certificates or a local SSH socket tunnel. Podman event replay is isolated in a generated POSIX executable adapter. Compose documents participate in the same stale-write protection and rollback as JSONC and Dockerfiles. Project-root helpers reuse the same root/config ownership hash.

Theme palettes are semantic CSS variables shared with Monaco and xterm. Monaco owns its editor/model lifetimes directly; the global hover delegate uses application-lifetime services to survive temporary diff disposal. Terminal components remain mounted behind preferences.

Maintenance IPC covers native registry credential stores, staged OCI creation, reviewed Feature lockfiles, volume clone/TAR operations, filesystem Trivy reports and explicit updater actions. IPC exposes fixed operations; an explicit application preference selects the Compose provider executable. Native dialogs select file destinations. Persistent volumes are not overwritten by restoration. No code runs when a project is merely opened or saved.

Template/import snapshots are bounded immutable file maps held in main. Source review and destination capabilities are separate; exclusive writes reject conflicts, preserve source comments and never run hooks. Folder/Git/ZIP snapshots and catalog projects feed the same editor. Local AI tool Feature files are generated on save and execute only during an explicit build. OCI publishing stages a reviewed snapshot and invokes the bundled CLI only after the publication action.

External color themes and TextMate grammars are declarative data. Main validates bundles and includes, and renderer tokenizes through bundled Oniguruma WASM; no extension host or JavaScript is loaded. Credentials use Electron safeStorage with an OS encryption backend and expose no plaintext read IPC. Authenticated volume helpers receive tokens through an upgraded stdin stream and tmpfs, with Git redirects/credential helpers/hooks disabled. TAR restoration validates resolved link graphs before allocating a new volume. Shared requirement policies drive startup checks, diagnostics and documented packaging minimums.
