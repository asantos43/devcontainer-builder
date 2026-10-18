#!/bin/sh
set -eu
if [ "$1" = events ] && [ -n "${DCB_PODMAN_EVENTS_SINCE:-}" ]; then
  shift
  exec podman events --since "$DCB_PODMAN_EVENTS_SINCE" "$@"
fi
exec podman "$@"
