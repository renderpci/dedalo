---
title: The date picker button works in the search panel on a phone
type: fixed
audience: user
date: 2026-10-15
---
In the search panel a date field's calendar button was floated above its input — in the compact search card that put it **on the label** and under the field's close (✕) control, and it stayed hidden until the field had focus. Clicking it did nothing: on a phone the ✕ sat on top, and the click activated the field (auto-focusing the input), which closed the picker the same click had opened.

The button now sits at the **end of the input row**, always visible, clear of the label and the field controls, and its click opens the calendar and keeps it open. A date range gets a single picker button for the row.
