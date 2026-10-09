---
title: Docker installations now pull a published, signed Dédalo image, or build it locally if you prefer, and record the choice in `.dedalo.env`.
type: added
audience: admin
date: 2026-10-09
breaking: true
---
Until now every Docker installation built its own image from the checkout. Dédalo now publishes the engine image, signed, to its own registry and to mirrors — GitHub Container Registry and Docker Hub — and you choose where your installation takes it from ([where the image comes from](./install/docker.md#choose-where-the-image-comes-from)):

- **One of Dédalo's registries.** The [registry table](./install/docker.md#dedalos-registries) says which ones publish today; the registry Dédalo runs itself is the primary, the other two are mirrors of the same images. A registry that is not yet available is never offered. Images are published per release, so until the first stable release is published, the installer builds locally.
- **A registry of your own**, holding copies of the published images ([how to mirror them](./install/docker.md#a-registry-of-your-own)).
- **A local build** from the checkout, with `-f deploy/compose.build.yml` ([a local build](./install/docker.md#a-local-build)).

`./install.sh` asks the question, offers the registries that publish your checkout's version first, and builds locally when none does. With `cosign` installed it checks the image's signature ([checking the signature](./install/docker.md#checking-the-signature)). The answer is written to `.dedalo.env` as five keys — `DEDALO_COMPOSE_FILE`, `DEDALO_IMAGE`, `DEDALO_VERSION`, `DEDALO_IMAGE_MODE`, `DEDALO_IMAGE_VERIFY` ([the keys](./install/docker.md#the-dedaloenv-keys)) — and every later update takes the image from the same place. The compose files no longer build: they run `DEDALO_IMAGE:DEDALO_VERSION`. Updating is now one command, `./deploy/dedalo-image-update.sh --version <version>`, which takes a database backup, gets the image, re-pins `DEDALO_VERSION` and rolls back on its own if the new version does not come up healthy within the health timeout (15 minutes by default, so long boot migrations are waited for) ([upgrading](./install/docker.md#upgrading)); with signature checking on, it also refuses a signed image that is not the version it asked for. Going back after an update that succeeded is a short manual procedure ([rolling back by hand](./install/docker.md#rolling-back-by-hand)). Its old `--mode`, `--image` and `--tag` flags are gone.

**Action for an existing Docker installation.** Add these lines to `.dedalo.env` (on the full stack, create the file with your three `POSTGRES_*` values as well), with the version your checkout declares:

```shell
DEDALO_COMPOSE_FILE=docker-compose.simple.yml
DEDALO_IMAGE=localhost/dedalo
DEDALO_VERSION=7.0.1
DEDALO_IMAGE_MODE=build
DEDALO_IMAGE_VERIFY=none
```

Then build once under the new name and recreate the stack:

```shell
docker compose -f docker-compose.simple.yml -f deploy/compose.build.yml --env-file .dedalo.env build dedalo
docker compose -f docker-compose.simple.yml --env-file .dedalo.env up -d
```

(on the full stack, `docker-compose.yml` instead of `docker-compose.simple.yml`, in the file and in the commands). The first update of such an installation needs `--skip-version-check`. See [an installation from before the image pin](./install/docker.md#an-installation-from-before-the-image-pin).
