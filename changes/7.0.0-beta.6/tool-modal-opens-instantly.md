---
title: A tool that opens in a dialog appears at once, even on a slow connection.
type: changed
audience: user
date: 2026-10-01
---
Before, clicking a tool button on a component or section (for example
"Propagate component data") showed nothing until the tool's program files and
styles had downloaded. On a slow network the page looked frozen for several
seconds, and a second click could open the tool twice. Now the dialog opens on
the click with the tool's name, icon and a loading spinner, and the tool fills
in when it is ready. Clicking again while it loads does not open a second copy,
and closing the dialog before it finishes loading cancels the tool cleanly.
