# Agent instructions

Read `.agents/architecture.md` and `.agents/validation.md` before changing code.

After the first commit, use a dedicated feature/fix/docs/chore branch and submit a PR into main. Never commit or push directly to main. Do not merge without an explicit request.

Preserve Dockerfile comments, directives, formatting and unknown JSONC properties. Opening or saving a project must never execute hooks or restart containers.

README.md and project governance documents are English. README.pt-BR.md and docs/pt-BR are Portuguese. Maintain both guide languages; do not translate TODO, CHANGELOG, CONTRIBUTING or SECURITY.

The project license is MPL-2.0. GitHub Actions must only run on macOS. Linux and Windows validation is local.
