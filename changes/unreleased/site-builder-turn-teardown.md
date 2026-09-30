---
title: A site builder turn whose egress gate fails to close now still ends, instead of leaving the session running forever.
type: fixed
audience: admin
date: 2026-09-30
---
When the daemon could not remove a turn's per-run egress directory (for example, the host refused the unlink), the turn's remaining cleanup was skipped: the driver's MCP configuration stayed in the workspace and the session never left the running state. Each cleanup step now runs on its own. The turn ends normally, and the failure is written as an `[egress]` line in the session log. The same holds for a build or git step: its gate failing to close no longer replaces the step's own result, and the `[egress]` line goes to the build log. A run refused after its gate opened (for example, an environment value with a control character) now reports that refusal, not the error from closing the gate.
