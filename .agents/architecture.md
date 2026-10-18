# Architecture

Electron main owns files, processes, Git, GitHub, Docker and exports. A sandboxed preload exposes narrow typed IPC. React renders the interface with no Node integration. Shared domain modules own configuration and lossless edits.

The creation wizard passes its configuration to the same model used by the editor. Runtime creation delegates to the bundled Dev Containers CLI; Dockerode owns inspection, logs and shell. Host repositories are mounted into containers.

Do not erase unknown configuration fields or regenerate imported Dockerfiles destructively. Track owned runtime resources and never remove persistent data implicitly.
