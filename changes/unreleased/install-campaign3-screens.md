---
title: The installer's screens now say what each route does, take a typed `yes` everywhere, and write `--write-answers` at the Review.
type: fixed
audience: admin
date: 2026-10-13
---
- **The trial asks no HTTPS port**, and its HTTP port is described as plain HTTP. Its acknowledgement now says what the documentation says: for an evaluation only, never real records.
- **An acknowledgement takes a typed `yes` on the full screen too**, as in plain mode; Space still ticks it. The screen says how, in its own words.
- **A pre-filled answer is replaced by the first key you type**, so the entity name no longer reads `museoMuseo de prueba`. Enter keeps the default.
- **`--write-answers` works on an interactive run.** The file is written at every Review whose plan is valid, so quitting there keeps it. A session that ends before a valid Review says the file was not written.
- **The Review speaks for the route.** Its "same as" line and the next step after `write <path>` give the route's own command (`sudo sh install.sh` on production, `sh install.sh` on Docker and Trial). "Install now" says whether the image is pulled and verified, pulled from your registry, or built here. The Docker and Trial Review no longer shows the production text about packages. The engine is handed only the passwords the plan uses.
- **The Ontologies screen is in English and shows each heading once.** Group names come from the installer's language, every typology is one group, and the typology groupers (`hierarchytype`, `hierarchymtype`) are no longer offered.
- **The System check says each row's state once** (`warn: Processor unknown`, not `warn: warn`). An unsupported operating system offers only quit, or back to another route, never "Retry". A check that passes moves on with its rows headed by its name.
- **One step count.** Plain mode's `Step n of N` and the full screen's rail count the same steps. A created production database asks only its name: the role is the service user, with no host, port or password.
- **The thesaurus advice of an interactive run** points to the Thesauri step and to Maintenance › Install hierarchies, never to command-line flags. The trial's To-do gives this machine's address, not `localhost`.
- **Smaller fixes:** the header of an interrupted install no longer says "nothing installed yet"; the route cursor starts on the `--route` default; an empty password field breaks no rule until you type; plain mode's bootstrap output is uncoloured; the footer no longer shows `null` for a development build.
- **The installer reference, the troubleshooting page and the installation hub** describe the real screen order, the System check rows per route, the firewall and own-CA cases, `restart` after `a2enmod`, the salt on `--resume`, and what `--abort` keeps once an instance has served.
