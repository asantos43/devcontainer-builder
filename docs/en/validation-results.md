# Implementation validation — 2026-10-18

[Português](../pt-BR/validation-results.md)

Validated locally on Linux x64 with Node.js 22.23.1, Electron 44.9.0 and Docker Engine 29.9.1.

| Check                                                                 | Result                                                                     |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| TypeScript, ESLint, Prettier                                          | Passed                                                                     |
| Domain/filesystem/runtime regression tests                            | 113 passed                                                                 |
| Electron/Playwright scenarios with Docker/Podman/OCI/Trivy opt-ins    | 23 distinct scenarios passed after targeted rerun; 1 permission-gated skip |
| CLI build, lifecycle, host workspace, named volume and Dockerode exec | Passed                                                                     |
| Official Docker outside of Docker Feature, non-root host access       | Passed                                                                     |
| Interactive shell, remoteEnv, disconnect on stop                      | Passed                                                                     |
| ZIP export and rebuild in a separate folder                           | Passed                                                                     |
| Live Docker Hub image search and tag discovery                        | Passed                                                                     |
| Linux AppImage and DEB generation                                     | Passed                                                                     |
| Packaged Linux window and bundled CLI                                 | Passed                                                                     |
| npm audit, including production dependencies                          | No known vulnerabilities                                                   |
| macOS Intel / Apple Silicon                                           | Blocked before runner startup by GitHub account billing/spending limits    |
| Windows execution and installer validation                            | Pending a Windows machine                                                  |
| Windows signing and macOS signing/notarization                        | Pending maintainer credentials                                             |
| Creating/pushing a remote through the application                     | Private creation, selected commit and push passed                          |

The macOS workflow exists exclusively for macOS. GitHub reported that jobs could not start because recent account payments failed or the spending limit must be increased. No macOS test/build result is claimed. Resolve billing and rerun the workflow; Linux/Windows remain local.

Context7 MCP was registered globally and OAuth completed. Playwright MCP and its browser were installed and a real `about:blank` navigation succeeded. These are developer tools, separate from the application’s test dependencies.

The initial implementation was delivered through PR #1 and subsequently merged by the maintainer. Follow-up changes use their own branch and pull request, without automatic merge. Build artifacts remain in the local ignored `release/` folder; no release was published.

## Themes, Podman and workbench extensions

This follow-up was validated on Fedora Linux x64 using Docker 29.9.1, Podman 5.8.9, CLI 0.89.0, Monaco 0.57.0 and Trivy 0.76.0. The Trivy Linux binary was downloaded from its official release into `/tmp` and checked against the release SHA-256 manifest; it is not a bundled application dependency.

- The full Electron suite passed 13 scenarios; its disposable GitHub-creation scenario was skipped because deletion permission is absent.
- TypeScript, ESLint, formatting and 59 unit/domain/filesystem tests passed; npm audit found no known vulnerabilities.
- Theme persistence, Monaco/xterm palette changes and Compose comment preservation passed in Electron.
- Real Docker and rootless Podman startup, shell, stop, standalone scripts and volume TAR export/restore passed. The corrected Podman scenario passed three consecutive repetitions.
- Compose built the development service and stopped its associated service containers.
- OCI template creation, Feature metadata inspection, public clone into a named volume, real CycloneDX output and dependency vulnerability reports passed.
- Private GitHub remote creation, selected-file commit and push passed. Cleanup returned HTTP 403 because the OAuth token lacks repository deletion permission. The fixture `asantos43/dcb-validation-dcb-e2e-x1skxl` was left **private and archived**; TODO tracks manual removal. Future disposable-repository tests skip before creation without `delete_repo` scope.
- Linux AppImage/DEB generation and the packaged window, bundled CLI and updater module passed. The updater's private-release credential requirement was verified without contacting releases. No release was published.

Actual remote SSH/TLS servers, native Windows/PowerShell, Podman Machine, platform signing/notarization and installation of a signed application update remain unvalidated. Live registry login with user credentials was not performed; stdin/redaction handling has subprocess regression coverage. These limits are tracked in TODO and the guides.

## Remaining software roadmap implementation

On this branch, TypeScript, ESLint, formatting and 113 tests across 14 test files passed. The full Electron run exercised 24 scenarios: 22 passed, the authenticated-volume scenario failed, and the permission-gated remote-creation scenario was skipped. The stdin connection bug was corrected, then both the private-volume clone and VSIX theme scenarios passed in a targeted rerun (including importing the theme before first opening Monaco). This gives 23 distinct passing scenarios; no native Windows/macOS execution is implied.

- Wizard palette/options, folder/ZIP review, conflicts, reusable snapshots, comment preservation and no-hook import passed through Electron. Local Git revision/subfolder checkout, archive rejection limits and OCI publication command construction have domain/filesystem regression coverage.
- A real Docker build installed Claude Code, Codex CLI and OpenCode through the generated local Feature. All three version commands succeeded as the non-root development user; no provider account login was performed.
- Docker and rootless Podman passed scripts, shell and TAR backup/restore, including relative symbolic/hard links and executable permissions. Private GitHub volume cloning passed and the restored Git configuration contained no forwarded credential.
- Trivy image export/analysis produced real CycloneDX output without starting the fixture container or running its hooks. Existing filesystem SBOM/vulnerability checks also passed.
- Native Linux system diagnostics passed. Supported/unsupported OS facts and production signing requirements were validated with simulated platform inputs, including a Windows target built from Linux.
- AppImage and DEB generation passed with declared native dependencies. The packaged application window, bundled CLI and private-update credential preflight passed. npm audit reported zero known vulnerabilities.
- The native Linux credential-store probe reported unavailable encryption with `basic_text`; no plaintext fallback was enabled and no credential was saved. Encryption adapter serialization, round trips and rejection cases have unit coverage. Real Secret Service/KWallet, macOS Keychain and Windows DPAPI round trips remain environment checks.
- Actual OCI publication, live registry authentication, native installers/engines, signing/notarization, remote engines and signed update delivery were not performed. Deleting the archived validation repository was retried and returned HTTP 403 with the current GitHub credential.

Linux artifacts remain in ignored `release/`; no application release or OCI template was published. The macOS workflow remains the only CI workflow.

## Public repository and macOS validation

After the repository became public, the Intel and Apple Silicon runners started. The first run exposed a helper-test /var versus /private/var path assertion; canonical roots and symlink entry-point coverage corrected it. Both architectures passed the complete [follow-up workflow](https://github.com/asantos43/devcontainer-builder/actions/runs/39190217041): 115 domain tests passed and one Linux-only test skipped, plus 12 Electron scenarios passed and 12 external-integration opt-ins skipped per architecture. Both generated unsigned DMG/ZIP packages and passed packaged window, CLI 0.89.0 and updater guard checks.

The public-update follow-up passed 116 tests and 12 Electron scenarios locally on Linux, with 12 integration opt-ins skipped. Linux AppImage/DEB packages and the packaged updater without a GitHub token also passed. The 0.1.0 public preview notes record signing and native engine limitations; historical private-repository/billing outcomes above describe earlier runs.
