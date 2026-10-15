---
title: Tool windows and dialogs: readable buttons and one consistent header
type: changed
audience: user
date: 2026-09-27
---
Every tool keeps its own colour, but that colour no longer makes text hard to read.

- **Buttons** painted in a tool's colour now always pair it with a readable label
  colour (at least 4.5:1, in the light and the dark theme). Before, some tools put
  dark text on their colour — the *Replace* and *Delete* buttons of *Propagate
  component data* were barely legible on red.
- **Headers** look the same in every tool and every dialog, whether the tool opens
  in a dialog or in its own window: a light bar with the tool's colour as a thin top
  edge and a faint tint, the same shadow, and the title in the normal text colour.
  Plain dialogs (confirmations, record pickers) use the same header instead of a dark
  bar. Several tools that showed the generic orange edge now show their own colour.
- The dialog's **minimise and close** buttons are larger click targets and show a
  visible outline when reached with the keyboard.
