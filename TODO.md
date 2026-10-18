# Roadmap

## First release

- [x] Guided creation and existing project import
- [x] Lossless JSONC and Dockerfile editing, including comments
- [x] Git/GitHub repositories and workspace mounts
- [x] Dev Containers CLI runtime, Dockerode logs and terminal
- [x] Custom tests and portable ZIP export
- [x] English/Portuguese UI and documentation
- [x] Local Linux/Windows builds; macOS-only GitHub Actions

## Workbench extensions

- [x] Docker Compose visual editing and execution
- [x] Docker in Docker and remote Docker endpoints
- [x] Registry authentication and OCI templates
- [x] SSH agent and secrets assistants
- [x] Clone into volumes and volume backup/restore
- [x] Feature updates and configuration comparison
- [x] Filesystem dependency SBOM/vulnerability reports through Trivy and opt-in application update checks
- [x] Persistent VS Code theme palettes across workbench, editors and terminals
- [x] Docker/Podman selection and rootless API support
- [x] Generated POSIX/PowerShell start, stop and shell scripts at project root

## AI coding tools in Dev Container Features

- [ ] Add selectable options in the Features editor to install Claude Code, Codex CLI and OpenCode inside the generated Dev Container.

## Template library and Dev Container import

- [ ] Create reusable templates from existing Dev Container projects, preserving JSONC/Dockerfile/Compose comments, Features, supporting files and lifecycle helper scripts.
- [ ] Read templates from local or remote Git repositories, with repository revision and template subfolder selection.
- [ ] Provide a searchable template palette for common development environments, including Node.js/TypeScript, Python, Go, Java, .NET, Rust, PHP, Ruby and Compose-based stacks.
- [ ] Show template descriptions, prerequisites and configurable options in the creation wizard, then open the generated project in the main editor for fine-tuning.
- [ ] Import a Dev Container from a folder into a selected workspace, building on the existing open-in-place workflow.
- [ ] Import a Dev Container from a ZIP archive, discovering configurations and their supporting files.
- [ ] Preview import contents and choose the destination/configuration before writing; preserve existing files and never run lifecycle hooks during import.
- [ ] Validate ZIP paths and extraction limits, reject entries that escape the destination, and exclude credentials and Git metadata when creating reusable templates.

## Release verification

- [ ] Validate Windows installer and Docker Desktop on a Windows machine
- [ ] Validate macOS Intel/Apple Silicon workflow and local Docker Desktop
- [ ] Configure Windows signing and macOS signing/notarization credentials
- [x] Exercise private GitHub remote creation, selected-file commit and push with a dedicated test repository
- [ ] Delete archived validation repository `asantos43/dcb-validation-dcb-e2e-x1skxl` with an account/token that can delete repositories
- [ ] Validate SSH/TLS against actual remote engines and Podman Machine on macOS/Windows
- [ ] Validate signed update delivery from a published release on each platform

## Follow-up capabilities

- [ ] Import arbitrary VS Code theme extensions and their complete token grammars
- [ ] Scan built container images in addition to filesystem dependencies
- [ ] Clone private repositories directly into volumes with isolated credential forwarding
- [ ] Restore archives with safe symbolic/hard links and special metadata
- [ ] OCI template publishing and dedicated secret-store integrations
