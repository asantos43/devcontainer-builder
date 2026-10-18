# Security

Report vulnerabilities privately using the repository owner’s GitHub contact or private vulnerability reporting when enabled. Do not disclose credentials in public issues.

Opening a project must not execute its commands. Building a dev container may execute arbitrary Dockerfile instructions and lifecycle commands; Docker socket access grants control over the host Docker daemon. Review projects before running them.

Renderer code must not access Node.js, the filesystem, credentials or Docker directly. Validate all IPC inputs and senders. Never record tokens in project files, logs or exported archives.
