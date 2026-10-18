// SPDX-License-Identifier: MPL-2.0
// Replay events from the start of the CLI invocation. Podman can establish its
// event subscription after `run` has already emitted its start event.
export const podmanAdapterSh = `#!/bin/sh
set -eu
if [ "$1" = events ] && [ -n "\${DCB_PODMAN_EVENTS_SINCE:-}" ]; then
  shift
  exec podman events --since "$DCB_PODMAN_EVENTS_SINCE" "$@"
fi
exec podman "$@"
`
