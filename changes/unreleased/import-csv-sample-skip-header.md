---
title: The CSV import's column mapper shows a real value from the file as each column's *Sample data*, not the column's own name.
type: fixed
audience: user
date: 2026-10-07
breaking: false
---
When a CSV file was staged in **Import CSV**, the *Sample data* cell of every row in the columns mapper repeated the column's name (the same text as the *Name* cell), because the preview was taken from the file's header line. It now shows the first non-empty value of that column in the data rows — the second line of the file, or a later line when that cell is empty — so you can check that each column is mapped to the right component before importing. Nothing was imported differently: the preview was the only thing affected.
