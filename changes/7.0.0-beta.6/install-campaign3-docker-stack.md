---
title: The Docker and Trial installs now start a working nginx, publish only what they serve, and say why a check failed.
type: fixed
audience: admin
date: 2026-10-13
---
- **Docker route:** the generated nginx site includes the media rule files where the engine writes them (`/srv/dedalo/media/dedalo_media_protection*.nginx.conf`). Before, it named files that did not exist in the container, and nginx restarted forever.
- **`stack_up` waits for nginx to stay up.** It checks that nginx is running, is not restarting, and accepts its configuration. If not, the step fails and quotes nginx's `[emerg]` line, instead of reporting "the stack is up".
- **`--abort` of a completed install keeps PostgreSQL running.** It removes only the `dedalo`, `nginx` and `backup` containers (and `certbot`), so `--resume` can start them again. The abort also names the images it keeps.
- **An untrusted certificate is refused early.** On the Docker route, an institution certificate whose chain this host does not trust is refused at the System check, which names its issuer and how to install the CA. A failed `stack_health` probe says why: for example, `the certificate chain is not trusted by this host`.
- **The trial publishes plain HTTP only:** no port 443 and no certificate volumes. This needs Docker Compose 2.24.4 or newer.
- **A local image build shows each build step as it runs.**
- **The backup container stops cleanly** on `docker compose stop` instead of being killed (exit 137).
- **The Docker and Trial pages** now cover installing Docker per distribution (Podman is not supported), the `docker` group, the bootstrap tools (`curl`, `unzip`, `git`), the firewall bypass of published ports, and how to read `DEDALO_SALT_STRING` from the volume. The `dc` helper is now `ddc`.
