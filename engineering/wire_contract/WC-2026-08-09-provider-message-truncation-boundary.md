# WC-2026-08-09-provider-message-truncation-boundary — the translator error message is cut at 512 BYTES, on a character boundary

- **Date:** 2026-08-09 (remediation of audits/2026-08_oh1_beta §5.6, workstream
  T1 "translation tools"; adversarial-review defect *"`truncateProviderMessage`
  uses UTF-16 code units where PHP uses BYTES, and `slice` can split a surrogate
  pair"*).
- **Decision:** DEC-15 (deliberate divergence), DEC-12 (tripwire in the same
  change).

## What this covers

`tool_lang` / `tool_lang_multi` `automatic_translation`: the `msg` returned when
the translation provider fails. A failing Apertium/babel box answers with a whole
HTML error page, so the message is truncated before it reaches the response.

## Shape before (PHP)

`tools/tool_lang/class.tool_lang.php:270`

```php
$msg = strlen($translate->msg) > 512 ? substr($translate->msg, 0, 512).'..' : $translate->msg;
```

`strlen` and `substr` count **bytes**. On a message whose 513th byte falls inside
a multi-byte UTF-8 sequence, PHP emits the leading bytes of a half character —
a malformed UTF-8 string, which then makes PHP's own `json_encode` of the
response fail (`JSON_ERROR_UTF8`, no `JSON_INVALID_UTF8_*` flag is passed).

## Shape after (TS)

`src/core/tools/translation.ts::truncateProviderMessage` spends the **same
512-byte budget**, measured with `TextEncoder`, and then walks the cut back off
any UTF-8 continuation byte (`10xxxxxx`) so it lands on the start of a character.
A character that straddles byte 512 is dropped **whole**; the `..` suffix is
unchanged.

Consequence, and the whole of the divergence: where PHP would have produced 512
bytes ending in a partial character, TS produces 509–511 bytes ending in a
complete one. For any message whose byte 512 is already a character boundary —
every pure-ASCII error page, which is what a mode-not-installed answer is — the
two are byte-identical.

## Reason

The port previously counted `String.length` (UTF-16 code units) and cut with
`slice`, which is wrong twice over:

1. **Wrong budget.** 512 code units is 512 bytes only for ASCII. A Spanish or
   Greek error page truncated at a completely different point than PHP, and a
   message PHP truncated could pass through untouched (400 `ñ` = 400 code units
   but 800 bytes). Matching PHP means counting bytes.
2. **Wrong boundary.** `slice` cuts between UTF-16 code units, so it can split a
   surrogate pair and leave a **lone surrogate** in the string. That is not a
   representable character; it survives `JSON.stringify` as `\udXXX` and lands in
   the client as a replacement glyph or a decode error.

Reproducing PHP's byte-split exactly is not an option worth having: a JS string
cannot hold a partial UTF-8 sequence at all, and the behaviour being copied is
one that breaks PHP's own response encoder. So the budget is ported and the
boundary is corrected — the smallest divergence that keeps the message a valid
string.

## Gate reconciliation

- `test/unit/translation_pipeline_native.test.ts` →
  `describe('truncateProviderMessage (PHP tool_lang:270 strlen/substr)')`. Pins:
  pass-through below the budget; exactly 512 bytes NOT truncated (PHP's `>`);
  the budget is bytes, not code units (400 `ñ`); no unpaired surrogate survives an
  astral-character message; a `€` straddling byte 512 is dropped whole rather than
  halved. **RED before the change** (4 of 6 cases), green after.
- **No re-harvest.** The frozen oracle store carries no failing-translator
  fixture — the PHP shape above is recorded from the frozen source, as a fossil.
  The gate is a native unit gate, not a differential.
