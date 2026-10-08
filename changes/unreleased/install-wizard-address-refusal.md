---
title: When the install wizard refuses your browser, it now names the address it saw — and `./install.sh --wizard` asks who may open it.
type: fixed
audience: admin
date: 2026-10-08
wc: WC-2026-10-08-install-ip-denied-names-address
---
Until it is finished, the wizard answers only the addresses in `DEDALO_INSTALL_ALLOWED_IPS`. Behind the stack's proxy the engine sees an address few people would guess (Docker Desktop: `192.168.65.1`). `./install.sh --wizard` started the stack without naming anyone, so every wizard install was refused, with no hint of what to allow. The refusal now says *"The installer is not allowed from this address (192.168.65.1)"*, and the engine log names it too. `./install.sh --wizard` asks which addresses may open the wizard; it suggests the private network ranges. See [Simple install](./install/quickstart.md#path-2-browser-wizard).
