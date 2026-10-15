---
title: The debug info bar is one thin line on a tablet or phone
type: changed
audience: admin
date: 2026-10-15
---
On a narrow screen the developer info strip under the menu (server code version, database, PostgreSQL and runtime versions, memory, sapi…) wrapped to **three lines**, taking a large slice of the screen before any content.

Below 1024px it is now **one thin line** whose values scroll sideways, so every value stays reachable and nothing is hidden; the menu reserves far less height for it. On a desktop it is unchanged.
