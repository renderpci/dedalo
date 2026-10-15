---
title: Resetting a hierarchy to its seed can no longer delete it without restoring it.
type: fixed
audience: admin
date: 2026-10-01
---
"Reset to seed" (Add hierarchy) and the installer's hierarchy step now apply each hierarchy all-or-nothing. The reset used to delete the hierarchy's terms first and load the seed in a separate step: if the seed then failed to load, the hierarchy was left empty — every edit and addition gone and the seed not restored. A models file that failed to load, or a failed update of the record counter, was ignored and the hierarchy reported as imported. Now the delete, the terms, the models and the counter are one database transaction: if any part fails, nothing changes and the hierarchy is reported as failed with the reason.
