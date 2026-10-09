# GENERATED — engineering/image_registries.json · regenerate: bun run registries:gen
# Do not edit: test/unit/image_registries_tripwire.test.ts compares this file with the render.
#
# The OFFICIAL registries Dédalo publishes its signed image to, PROVISIONED ones only,
# primary first, then the mirrors. Four parallel bash 3.2 arrays (index i describes one
# registry). Iterate by index up to the array length: expanding a whole EMPTY array
# is an error under `set -u` in bash 3.2.
# Sourced by install.sh, deploy/dedalo-image-update.sh and the host image updater.
#
# Not provisioned yet (never offered, no address):
#   gitdedalo — The OCI registry on the gitdedalo host has not been stood up yet (it needs TLS, authenticated push and anonymous pull); until then this entry names no address.
# shellcheck shell=bash disable=SC2034
DEDALO_REGISTRY_IDS=('ghcr' 'dockerhub')
DEDALO_REGISTRY_LABELS=('GitHub Container Registry' 'Docker Hub')
DEDALO_REGISTRY_ROLES=('mirror' 'mirror')
DEDALO_REGISTRY_REPOSITORIES=('ghcr.io/dedalia-org/dedalo' 'docker.io/dedalia/dedalo')
DEDALO_IMAGE_SIGNING_ISSUER='https://token.actions.githubusercontent.com'
DEDALO_IMAGE_SIGNING_IDENTITY_REGEXP='^https://github\.com/dedalia-org/dedalo/\.github/workflows/image-release\.yml@refs/(tags/v[0-9]+\.[0-9]+\.[0-9]+|heads/master)$'
