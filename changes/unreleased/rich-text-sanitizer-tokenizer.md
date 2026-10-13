---
title: Rich text is cleaned by a real HTML parser when it is saved.
type: security
audience: user
date: 2026-10-11
wc: WC-2026-10-11-rich-text-sanitizer-tokenizer
---
Text fields with formatting are cleaned of anything that could run a script when they are saved. That cleaning used to pattern-match the text, which missed some disguised forms (for example an encoded `javascript:` link or an event handler written without a space) and sometimes changed ordinary text that merely mentioned such words. It now reads the text the way a browser does: disguised forms are caught, and text and formatting that are not dangerous come back exactly as written. Embedded SVG, MathML, frames, `noscript`, `title` and `textarea` blocks are now removed together with their content, HTML comments are removed, an attribute written twice on one tag is kept once with its first value (the one a browser uses), and a tag left unfinished at the very end of a value is dropped, as a browser would drop it. The cleaning is repeated on its own result until nothing changes, so removing one dangerous piece can never join the text around it into a new one. Dropping it takes the same short time however long the unfinished part is; in the rare value where the end cannot be found that way, the whole value is kept as plain visible text rather than lost. Values saved before this update are not changed until they are saved again.
