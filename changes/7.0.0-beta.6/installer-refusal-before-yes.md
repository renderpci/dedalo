---
title: The installer says what its system check would refuse on the Review, before `yes`, and a refusal never loses your answers.
type: fixed
audience: admin
date: 2026-10-14
---
An untrusted certificate chain, Apache beside a running nginx, an image version other than the installer's, or a port already in use were refused only after you typed `yes` — and every answer had to be typed again. The Review now measures the same system check the run makes and lists what it refuses as errors; install is offered once they are fixed. The **Image version** field refuses a tag other than the installer's own (or its `-dev` tag) at once, and the Docker and Trial check refuses a published port something else already listens on. If the check still refuses at `yes`, the session stays on the Review with your answers; if the run is refused after it started, before it changed anything, your answers are written to an answers file and the command that runs them again is printed. See [Installer reference › Interactive mode](./install/installer_reference.md#interactive-mode).
