---
title: Installer: one interruption block on Ctrl-C, a resume that re-checks and tells everything, the salt on a terminal resume, and clearer screens.
type: fixed
audience: admin
date: 2026-10-14
---
- **Ctrl-C during a step that runs a child** (the engine steps, a build) ends as one *install interrupted* block with exit code 130 and the run recorded *interrupted* — never also an *install failed* block, or exit 1.
- **A `--resume` that completes the install** shows the generated `DEDALO_SALT_STRING` when it runs on a terminal (the docs always said so; it printed only the command that reads it), and the closing block reminds you to keep it with your backups. Its closing *To do on this host* lists the notes of every step, the ones done in an earlier run included.
- **A `--resume` after earlier steps ran again** (after an `--abort` of a served instance) probes the public address again instead of trusting the old result; every resumed step says whether it was *verified again* or had *nothing to re-check*, and a resume of a complete install says `install already complete — every done step that has a check was verified again`.
- **A refusal is worded `refused:`**, never *install failed* — for example `--abort` of a sealed install. An `--abort` that keeps a served instance now closes its run record.
- **The ontology's RETIRED-property notices** (for ontology authors) no longer reach the operator's terminal during an install.
- **Screens:** the Install type starts on Production, the recommended route; an unsupported system ends with *This system cannot run this route — quit, or go back to choose another route*; a failed check is marked ✗ on the step rail; the System check's warnings stay in view under the next screen, drawn with `!` and `✗`; `back` re-asks the question you left and runs the check again; a re-check before the Review names the answer that changed it; yes/no switches need Enter; the Review's `w` says it writes the answers and quits. In plain mode the bootstrap's dependency install draws no progress bar (`--no-progress`).
