---
title: Error messages now show their details instead of placeholders like `{section_tipo}`.
type: fixed
audience: user
date: 2026-10-02
breaking: false
---
About twenty error messages showed their placeholders literally, for example *The link into '{section_tipo}' was refused ({constraint})* or *Your daily AI budget is used up ({budget_kind}: {limit})*. They now show the actual values: the section, the limit, the file size, the action that was still running. The affected messages include link refusals, the AI budget, export limits and quotas, duplicate-request notices, image and file size limits, and unknown API actions.
