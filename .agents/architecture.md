# Architecture

Electron main owns files, processes, Git, GitHub, Docker/Podman and exports. A sandboxed preload exposes narrow typed IPC. React renders the interface with no Node integration. Shared domain modules own configuration and lossless edits.

The creation wizard passes its configuration to the same model used by the editor. Runtime creation delegates to the bundled Dev Containers CLI; Dockerode owns inspection, logs and shell. Host repositories are mounted into containers.

Do not erase unknown configuration fields or regenerate imported Dockerfiles destructively. Track owned runtime resources and never remove persistent data implicitly.

Engine connection discovery, TLS and SSH forwarding live in `src/main/engine.ts`; the CLI and Dockerode must use the same endpoint. Podman CLI adapters replay events from the operation start to avoid a subscription race. Settings cannot switch engines while runtime operations or sessions are active. The renderer shares semantic themes with Monaco and xterm; keep terminal instances mounted while preferences are open.

Compose YAML is edited through document nodes, tracked in project baselines and saved transactionally with JSONC/Dockerfiles. Preserve original bytes on untouched files. Associated Compose containers are identified using both project/config-file labels after verifying the primary container ownership label. Volume restore validates a private TAR snapshot and only creates new volumes. Registry passwords travel over stdin and are redacted from subprocess output. OCI templates stage into an empty selected destination without executing hooks.

Standalone helpers are generated at the project root without overwriting existing files, with a Podman support adapter under `.devcontainer/`. Keep adapters selected during export. Application update checks are opt-in; downloads and installation require explicit application actions. Publishing releases remains manual.

Template/import operations live in `library.ts` and `archives.ts`: snapshot approved source bytes before destination review, reject archive escapes and never overwrite conflicts or run hooks. Only explicit runtime actions execute the local AI tools Feature. OCI publishing is an explicit action, not a side effect of import/save.

Declarative VS Code bundles are parsed in main; renderer TextMate tokenization uses bundled Oniguruma WASM. Never execute extension JavaScript. Saved credentials use Electron safeStorage with an OS backend; plaintext has no renderer read API. Private volume cloning forwards credentials over stdin into temporary tmpfs files and disables Git credential helpers/redirects/hooks. TAR restore resolves link graphs before creating a fresh volume. Shared platform requirements drive startup diagnostics and packaging documentation; native platform validation remains separate from simulated policy tests.
