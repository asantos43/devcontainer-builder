# Installation and usage

[Português](../pt-BR/guide.md) · [Architecture](architecture.md) · [Validation](validation.md)

## Requirements

Use Node.js 22.16+ and npm to develop the app. Install Docker Engine on Linux or Docker Desktop using Linux containers on Windows/macOS. Install Git and GitHub CLI for repository actions. Authenticate with `gh auth login` or the application’s GitHub sign-in button. Keep your normal Git credential helper or SSH setup for private clones.

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

`forwardPorts` describes forwarding for compatible IDEs; the application does not implement IDE tunnels. Publish ports explicitly in `runArgs`, for example `["-p", "127.0.0.1:3000:3000"]`. Docker inspection shows actual bindings.

## Run, inspect and test

Save changes, then Start or Test. Review host commands, Features and mounts in the execution dialog. The official CLI handles Features and lifecycle semantics. Docker outside of Docker uses the official Feature; the container can control the host Docker daemon when enabled.

Terminal opens a shell using the effective user and workspace, preferring the configured shell and falling back to `/bin/sh`. Logs include build, Git and followed container output. Buffers are bounded; copy or export output when needed.

Custom checks run sequentially after startup/inspection, with name, command, working directory, timeout and expected exit code. First failure stops the sequence. Export a JSON report from Tests. Cancellation ends the coordinating process; check for remaining resources. Test process-group cancellation is best-effort when the image lacks `setsid`.

Stop preserves the managed container. Remove requires confirmation and preserves named volumes and images. Other projects’ containers are not removed.

## ZIP export

Save, analyze the project and select configuration plus required sources/scripts. Git metadata, common credential files, installed dependencies and artifacts are excluded. Review dependencies and local mounts before export. The archive includes a manifest and usage instructions; unresolved dependencies prevent a claim of complete portability. Docker volume contents are not included.

## Local builds and macOS automation

Linux: `npm run package:linux`. Windows: `npm run package:win` on Windows. macOS: `npm run package:mac` on macOS. Artifacts are written to `release/`. Use `npm run verify:package -- /path/to/executable` to verify a packaged application; on macOS the script discovers the `.app` automatically.

GitHub Actions runs only on macOS, building Intel and Apple Silicon artifacts on PRs/main/manual dispatch. It does not publish releases. Configure `CSC_LINK` and `CSC_KEY_PASSWORD` for signing, and `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` for notarization when available. Unsigned local artifacts are development builds.

## Troubleshooting

Use Settings → Check tools & Docker. An empty Docker endpoint follows `DOCKER_HOST` or the current Docker context. Unix/rootless sockets and Windows named pipes are supported; SSH/TCP remote endpoints are not. On Linux, obtain normal user access to your Docker/rootless socket; the app never changes its permissions. On Windows, select Linux containers in Docker Desktop and use host-accessible paths. On macOS, use the active Docker Desktop context.

Docker Hub network failures or rate limits can be bypassed with a manual image reference. Arbitrary registries are accepted as references; browsing tags is limited to Docker Hub. Compose is source-only. See TODO for planned capabilities.
