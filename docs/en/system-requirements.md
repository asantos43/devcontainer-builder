# Release system requirements

[Português](../pt-BR/system-requirements.md) · [Guide](guide.md)

These are the application's supported minimums. Runtime checks use `src/shared/requirements.ts`; native packaging also declares platform prerequisites.

| Platform | Supported minimum                                                  | Native libraries / installation                                                                                                                                                                                 |
| -------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Windows  | Windows 10 22H2, build 19045; Windows 11; 64-bit x64/arm64 runtime | NSIS checks the Windows build. Use the installer matching the published architecture. Docker Desktop must use Linux containers.                                                                                 |
| macOS    | macOS 13 Ventura; Intel x64 or Apple Silicon arm64                 | The application bundle declares `LSMinimumSystemVersion` through electron-builder. Docker Desktop or Podman Machine is needed only for containers.                                                              |
| Linux    | Desktop glibc distribution, glibc 2.31+; x64/arm64 runtime         | GTK 3, NSS, GBM, ALSA, ATK/AT-SPI, DRM, X11 and xkbcommon libraries. DEB dependencies enforce these requirements. AppImage additionally needs compatible FUSE support, or extraction with `--appimage-extract`. |

Require at least **2 GiB total RAM** and **1 GiB free on the application data filesystem**. These are project policy floors, not estimates for container builds. Reserve additional storage and RAM for downloaded images, repositories, builds and volume backups. The Linux/Windows scripts currently build x64; macOS packaging supports x64 and arm64. A supported runtime architecture does not imply that every artifact is published.

The packaged application includes Electron, React, Monaco, xterm and the Dev Containers CLI. Node.js/npm are needed to develop from source, not to launch a packaged application. Standalone generated lifecycle scripts separately require Node.js and a global Dev Containers CLI.

## Dependencies by operation

- Creating/editing/importing/exporting configurations: no container engine or GitHub account required.
- Building, starting, shell, logs and volumes: Docker 20.10+ or Podman 4.9+, an active API connection and Linux containers. Rootless engines need their socket enabled; macOS/Windows Podman needs a running Podman Machine. Compose projects additionally need a compatible Compose provider.
- Local Git/template repositories: host Git. Private HTTPS Git repositories use the host credential helper; SSH uses existing SSH configuration/agent.
- GitHub creation/cloning: GitHub CLI and an authenticated account with access to the requested repository.
- Private GitHub cloning into a volume: GitHub CLI authentication, or an explicitly selected saved token. Credentials are sent to a disposable helper over stdin and held on tmpfs; they are not stored in the repository or its Git configuration.
- Dependency/image reports: host [Trivy](https://trivy.dev/docs/latest/). It may download vulnerability databases. Image analysis also requires the configured engine CLI to save the managed container's image.
- Saved credentials: Windows DPAPI, macOS Keychain, or Linux Secret Service/KWallet. Unavailable encryption and Linux's `basic_text` fallback are refused.
- Updates: a packaged application and a published release; private releases additionally need a runtime GitHub token.

Run `npm run check:system` locally and use **Settings → Check tools & engine** for operation-specific diagnostics. Startup blocks unsupported OS/architecture, insufficient RAM/storage and unsupported Linux libc. Engine operations explain missing tools, engine version or Linux-container prerequisites. Native library loaders can fail before Electron reaches JavaScript; the DEB package manager and OS bundle/installer metadata are therefore part of enforcement.

## Signing and release verification

Development builds can be unsigned. Set `DCB_RELEASE=1` when building a production Windows/macOS release; packaging fails when signing secrets are missing. Set `CSC_LINK` and `CSC_KEY_PASSWORD` for Windows/macOS. macOS additionally requires `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD` and `APPLE_TEAM_ID` for notarization. Store these in GitHub Actions secrets for macOS, or in the local build environment for Windows. Never commit their values.

Only macOS uses GitHub Actions. Windows/Linux builds and tests stay local. Native Windows/macOS engine tests, remote SSH/TLS/Podman Machine, signing identities and delivery of an actual signed update still require their respective machines/accounts. Boundary tests with simulated host facts do not replace those checks.

Platform baseline sources: [Electron platform support](https://github.com/electron/electron#platform-support) and [Electron 44 macOS baseline](https://www.electronjs.org/blog/electron-44-0#removed-macos-12-support). The Windows 22H2, glibc, RAM and disk floors are this project's explicit support policy.
