---
title: New installations enable every translated interface language.
type: changed
audience: admin
date: 2026-10-09
---
The installer (wizard and `scripts/install.ts`) used to enable as interface languages only the working languages ticked at install time, so switching the interface to, for example, Catalan or Nepali later meant editing `DEDALO_APPLICATION_LANGS` by hand. A new installation now enables every language the interface is translated into (18 today), and any of them can be the default interface language. The working (data) languages are still a choice — English and Spanish by default, with English as the default data language. Existing installations are not changed. See the [installer reference](./install/installer_reference.md).
