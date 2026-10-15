---
title: A refused save no longer leaves an empty record behind.
type: fixed
audience: developer
date: 2026-09-29
---
A save to a record that does not exist yet creates the record first. When the change itself was
then refused (for example, removing a value the field does not hold), the answer was a failure,
but the new empty record stayed, the section's id counter had moved to its id, and the activity
log recorded its creation. A refused save now leaves nothing behind: no record, no counter move,
no history or activity entry. The answer to the request is unchanged. A save run inside a
larger operation (an import row, for example) leaves that choice to the operation, which rolls
the row back as before.
