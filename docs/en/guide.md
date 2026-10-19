# Installation and usage

[Português](../pt-BR/guide.md) · [Architecture](architecture.md) · [Validation](validation.md)

## Requirements

Use Node.js 22.16+ and npm to develop the app. Install Docker Engine/Desktop or Podman. Podman requires an active API socket on Linux or a running Podman Machine on macOS/Windows. Install Git and GitHub CLI for repository actions. Authenticate with `gh auth login` or the application’s GitHub sign-in button. Keep your normal Git credential helper or SSH setup for private clones.

Run `npm ci`, then `npm run dev`. No global Dev Containers CLI is needed. Monaco workers and fonts are served locally.

## Create a project

Choose **New dev container**. Select an existing local destination folder; cloning requires it to be empty. Choose a template and repository strategy. New GitHub repositories default to private. Select an image or Dockerfile, Features, workspace, additional mounts, environment and optional post-create command.

The final screen lists the operations that will be performed. Create does not build the image. A clone containing an existing Dev Container opens that configuration instead of overwriting it. If remote creation succeeds but a later action fails, the remote remains available: inspect GitHub and open the local project before retrying.

Repository code lives on the host, mounted into the container. Git initialization does not create an automatic commit or push. In Repository, review selected files before committing; push is a separate explicit action. Configure your Git author locally if necessary. Merge/conflict editing is outside this version.

## Edit existing projects

Open the workspace folder or a configuration JSON file. Multiple configurations are selectable. Use tabs for structured editing and Source for arbitrary properties. JSONC comments and unknown fields are preserved.

Dockerfile supports standalone comment blocks, multiline comments and disabled instructions. Use **Comment** in New block. Select a block to edit it. The move-comments option explicitly associates immediately preceding contiguous comments with an instruction during movement. Removing an instruction offers to keep its preceding comments or remove them together. Parser directives stay pinned; edit them in source mode.

Heredocs and unrecognized syntax remain editable in source mode. Visual edits are disabled when safe representation is impossible. Opening/saving without changes preserves Dockerfile bytes; edited blocks leave other text untouched. Review the diff before saving. External file changes require reload to avoid overwriting them.

## Workspace, folders and volumes

The workspace mount uses `${localWorkspaceFolder}` and the configured internal path. Add host folders or named volumes, select their container destination and read-only mode. Volume creation is an explicit action. Removing a mount never deletes data. Paths containing commas are not supported by the mount-string representation. External mounts must be remapped when moving projects.

Mount destinations and workspace paths may start with Dev Container variables, for example `target=${localWorkspaceFolder}`. Named volumes may also use variables such as `${devcontainerId}`. Templates remain unchanged in the saved configuration; the official CLI resolves variables and validates the effective values when starting or testing. See the [Dev Container variable reference](https://github.com/devcontainers/spec/blob/main/docs/specs/devcontainerjson-reference.md#variables-in-devcontainerjson).

`forwardPorts` describes forwarding for compatible IDEs; the application does not implement IDE tunnels. Publish ports explicitly in `runArgs`, for example `["-p", "127.0.0.1:3000:3000"]`. Docker inspection shows actual bindings.

## Run, inspect and test

Save changes, then Start or Test. Review host commands, Features and mounts in the execution dialog. The official CLI handles Features and lifecycle semantics. Docker outside of Docker uses the official Feature; the container can control the host Docker daemon when enabled.

Start is available when the managed container is absent, created or stopped; Stop is available when it is running, paused or restarting. Both are disabled during runtime operations and while the engine status is unknown or unavailable. Status refreshes on project open, engine connection changes, window focus and every three seconds, including changes made with Docker/Podman outside the app.

Terminal opens a shell using the effective user and workspace, preferring the configured shell and falling back to `/bin/sh`. Logs include build, Git and followed container output. Buffers are bounded; copy or export output when needed.

Custom checks run sequentially after startup/inspection, with name, command, working directory, timeout and expected exit code. First failure stops the sequence. Export a JSON report from Tests. Cancellation ends the coordinating process; check for remaining resources. Test process-group cancellation is best-effort when the image lacks `setsid`.

Stop preserves managed containers, including associated Compose services. Remove requires confirmation and preserves named volumes and images. Other projects’ containers are not removed.

## ZIP export

Save, analyze the project and select configuration plus required sources/scripts. Git metadata, common credential files, installed dependencies and artifacts are excluded. Review dependencies and local mounts before export. The archive includes a manifest and usage instructions; unresolved dependencies prevent a claim of complete portability. Docker volume contents are not included.

## Local builds and macOS automation

Linux: `npm run package:linux`. Windows: `npm run package:win` on Windows. macOS: `npm run package:mac` on macOS. Artifacts are written to `release/`. Use `npm run verify:package -- /path/to/executable` to verify a packaged application; on macOS the script discovers the `.app` automatically.

GitHub Actions runs only on macOS, building Intel and Apple Silicon artifacts on PRs/main/manual dispatch. It does not publish releases. Configure `CSC_LINK` and `CSC_KEY_PASSWORD` for signing, and `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` for notarization when available. Unsigned local artifacts are development builds.

## Troubleshooting

Use Settings → Check tools & engine. Choose Docker or Podman. An empty endpoint discovers that engine; Docker follows `DOCKER_HOST` or its current context. Podman follows `CONTAINER_HOST`, its rootless Linux socket, or the active machine socket. Unix sockets, Windows named pipes, TCP/TLS and SSH forwarding are supported. On Linux, obtain normal user access to your Docker/rootless socket; the app never changes its permissions. On Windows, select Linux containers in Docker Desktop and use host-accessible paths. On macOS, use the active Docker Desktop context.

Docker Hub network failures or rate limits can be bypassed with a manual image reference. Arbitrary registries are accepted as references; browsing tags is limited to Docker Hub. Compose is editable in its own tab. See TODO for release verification.

## Themes

Select **Settings → Color theme**, then Save settings. The selected palette applies to the workbench, Monaco source/diff editors and active terminals without disconnecting a shell. Preferences survive restart. Options include Dark/Light Modern, Dark+/Light+, high contrast, Monokai, Solarized, Abyss, Quiet Light, Kimbie Dark and Red. These are built-in workbench palette adaptations; use Import VS Code theme JSON/VSIX in Settings to add external color palettes and contributed TextMate grammars. Theme includes and complete scope rules are retained; extension JavaScript is never executed. Legacy tmTheme and grammar-only bundles are supported; import grammar dependency bundles separately when needed.

## Podman and remote engines

On Linux, enable the rootless API with `systemctl --user start podman.socket`. Its usual endpoint is `unix:///run/user/UID/podman/podman.sock`. Choose Podman in Settings, save and check diagnostics. Use fully qualified image names such as `docker.io/library/alpine:3.22`. Review SELinux labels and bind-mount permissions; a volume workspace avoids changing labels on source folders. Features that require privileged containers or Docker-specific behavior can have additional rootless limitations. For Compose, install a compatible Compose provider and set its executable path if needed.

For SSH, enter `ssh://user@host:port` and the remote socket path (for example `/run/user/1000/podman/podman.sock`). OpenSSH forwards it to a private local socket, shared by the CLI and Dockerode. Authentication uses your SSH agent/config and existing `known_hosts`; the app never accepts unknown host keys automatically. Linux/macOS hosts support this forwarding; on Windows use a TLS endpoint. For TLS, select a certificate directory containing `ca.pem`, `cert.pem`, and `key.pem`. Engine credentials and certificates stay outside project exports. TCP endpoints without TLS should only be used on trusted, locally protected connections.

Bind paths refer to the engine host, including remote engines. Local sources are not uploaded automatically. Use a remote volume workspace or map existing remote paths. Finish runtime operations and disconnect shell/log sessions before changing engine connections.

## Compose and nested engines

Open **Compose** to convert an image/Dockerfile project or edit existing Compose files. Select services, edit image/build/ports/volumes/environment/dependencies, add services and select the development service. YAML source remains editable. Untouched imported YAML remains byte-for-byte identical; visual changes retain comments and unknown fields while YAML formatting may normalize. Multiple override files follow Compose path semantics. Save reviews include all changed YAML files and reject external modifications.

The CLI starts the environment; Stop also stops services carrying the same Compose project and configuration labels. Remove preserves volumes/images. Compose networks can remain for reuse. Build contexts and referenced env/config/secret files require review before ZIP export.

For a separate privileged Docker daemon, select the official **Docker in Docker** Feature. For host-engine access, use the Docker outside of Docker Feature or the socket assistant in Environment; do not add duplicate socket mounts. Podman host sockets can be mapped to `/var/run/docker.sock` for compatible tools. Container user permissions and SELinux policy still apply.

## Registry, OCI, Features and security tools

Settings provides registry sign-in via password stdin to the selected engine. The app never stores passwords in project files. Docker uses its normal credential helper/config; Podman writes the Docker-compatible auth file so the bundled CLI can authenticate OCI requests. Signing out removes that registry login from the selected store.

Create from an OCI template in Settings: enter the reference/options and choose an empty destination. The official CLI applies it in staging first, then copies allowed files and opens the result. Excluded credentials/Git metadata and symlinks are not copied. Applying a template does not execute lifecycle hooks. Review generated files before startup.

Features can query published versions, stage a reference replacement while preserving options, and preview/save an updated lockfile. Save project edits before generating a lockfile; external lockfile changes invalidate the preview. Source offers comparison with another configuration.

Environment can add `${localEnv:NAME}` secret references and mount an SSH agent socket. Actual secret values and private keys should stay on the host. Agent and engine socket forwarding grant the container access to those host services.

Install [Trivy](https://trivy.dev/docs/latest/) on the host to export a CycloneDX SBOM or a JSON vulnerability report from Security. Choose **Project files** or **Built container image**. Image scans analyze the managed container’s immutable image through a temporary engine archive; they do not execute its contents. Trivy may download its databases; scan cancellation is available in the output panel. Reports are saved only to the selected destination.

## Volume repositories and backups

Ports & volumes offers backup of stopped volumes as TAR and restoration into a **new** volume. Backups contain all files, including any secrets present. Restoration accepts files/directories, safe internal relative symbolic links, hard links to archived regular files and POSIX mode/owner/mtime/PAX metadata under `data/`. Absolute/external/cyclic links, devices and conflicting effective paths are rejected. Restore validates a private snapshot before creating the new volume. Interrupted restores preserve partial data in that new volume. Existing volumes are never overwritten or automatically removed.

HTTPS repositories can be cloned into a new volume at `/data/repository`, then selected as the workspace. Private GitHub repositories can use GitHub CLI authentication or a saved access token. Credentials travel through stdin into a disposable helper’s private tmpfs and are never embedded in the repository URL/configuration; credential helpers, redirects and hooks are disabled for that private clone. Cloning uses an Alpine helper with Git and downloads its required packages. Review network availability and the selected branch. ZIP export continues to exclude volume data; use TAR separately.

## Generated standalone scripts

New wizard/OCI projects include these files at the **project root**, next to `.devcontainer`:

- `devcontainer-start.sh` / `devcontainer-start.ps1`
- `devcontainer-stop.sh` / `devcontainer-stop.ps1`
- `devcontainer-shell.sh` / `devcontainer-shell.ps1`

Existing projects can add missing scripts in Repository. Existing script contents are never overwritten. Install Node.js and `npm install -g @devcontainers/cli`, then run `./devcontainer-start.sh`, `./devcontainer-shell.sh` and `./devcontainer-stop.sh`. Shell defaults to `/bin/sh`; pass `/bin/bash` or another command as arguments. PowerShell scripts require PowerShell 7+. Additional startup CLI flags are accepted by the start script.

`DCB_ENGINE=docker|podman` overrides the generated engine default. Configured endpoint, TLS-directory and Compose-executable defaults are included when scripts are generated; environment variables override them. Remap these machine-specific paths after moving a project. Configure `DOCKER_HOST`/`CONTAINER_HOST` and TLS/SSH authentication as needed. Scripts locate their project directory independently of the current working directory and use the same project ownership label as the app. Starting runs the configured lifecycle hooks; stopping preserves persistent data. Scripts are selected by default during ZIP export.

## Application updates and release artifacts

Packaged applications can check published GitHub Releases; enable automatic checks in Settings or use Check updates. Downloads and restart/install are explicit actions. This public repository requires no GitHub token to check releases. No token is stored in project settings or bundled into update metadata. A development `npm run dev` session cannot update itself.

Local packaging never publishes a release. macOS produces DMG and ZIP plus update metadata; publish compatible signed artifacts/metadata manually after review. Automatic checking is off by default. Full end-to-end delivery requires a published release and signing/notarization on the target platform. Platform installers and release credentials still need the verification listed in TODO.

Compose execution uses `COMPOSE_BAKE=false` on providers that support it and `BUILDX_BAKE_ENTITLEMENTS_FS=0` for compatibility with recent Bake versions: the official CLI generates Feature Dockerfiles outside the original build context. Start/Tests and standalone helper scripts therefore run as trusted build operations with host filesystem access; review imported Dockerfiles, Compose files and lifecycle hooks first.

POSIX helpers include `.devcontainer/builder-podman.sh` to replay Podman startup events from the beginning of the CLI operation. Keep this support file with the root scripts when exporting. PowerShell uses the native Podman executable; Podman Machine and its native event behavior still require Windows validation.

## Templates, folder/ZIP import and publishing

Open **Templates and import** in the activity bar, or choose **Use a template or import an existing Dev Container** inside the creation wizard. The development palette covers Node.js/TypeScript, Python, Go, Java, .NET, Rust, PHP, Ruby and Compose/PostgreSQL. Search, preview prerequisites/files, select a configuration and enter template options. Choose a destination, acknowledge the review, then create and open the main editor for fine-tuning. Nothing builds or runs hooks during import.

Sources also include saved templates, folders, ZIPs and Git repositories. Git supports an explicit revision/tag/commit and template subfolder; leave the URL empty to choose a local repository. Native pickers grant source/destination access. Imports use an immutable reviewed snapshot, preserve comments/unknown fields and refuse existing-file replacement, including files that appear after preview. Missing lifecycle helpers are added; existing team helpers are retained and may need their configuration path reviewed for multi-configuration projects.

Use **Use saved files from current project** and **Save reusable template** to build a local library from an existing project. Recognized credential files, Git metadata, dependencies and symlinks are excluded. Review inline secrets and project source before reuse or publication: filename exclusions cannot identify every secret embedded in configuration text. ZIPs reject encrypted/special/duplicate entries, path escapes and nonportable names; limits are 5,000 entries, 64 MiB per file, 256 MiB expanded total and 128 MiB compressed.

Templates can provide `devcontainer-template.json` metadata/options and `${templateOption:NAME}` placeholders. JSONC, Dockerfile and Compose text remain intact except for explicit option substitutions. A named local template can be previewed from Saved templates and **published explicitly** to an OCI registry/namespace after reviewing the destination and enabling the publication checkbox. Registry authentication is separate. No publication happens when saving, importing, building or packaging the application.

## AI coding tools and saved credentials

Select Claude Code, Codex CLI and/or OpenCode in Features, optionally pin their npm versions, then save. The application adds `.devcontainer/builder-ai-tools` and a local Feature reference. That Feature depends on Node.js 22 and installs the selected vendor packages during the trusted container build. Authenticate with each tool inside the container afterward. Accounts, provider access and network downloads are separate from generating the configuration. Custom local Feature files are never overwritten.

Settings offers an encrypted OS credential store for registry login and private volume cloning. Only names are returned to the UI after storage; secret values remain in the main process. This store does not automatically inject secrets into exported configurations or generated lifecycle scripts. Existing `${localEnv:NAME}` references continue to use the host environment.

See [release system requirements](system-requirements.md) for supported platforms, native libraries, per-operation tools and production signing configuration.
