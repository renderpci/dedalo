---
description: Audit XSS sinks (server-side reflection + DOM-based sinks like innerHTML, insertAdjacentHTML, document.write). Covers PHP and JS layers. Run after /security-audit.
---

# XSS Audit

Read `.windsurf/workflows/security-audit.md` first for the shared rubric.

## Surface

Audit both layers:

1. **Server-side reflection** — PHP files that `echo` / `print` / interpolate user data into HTML.
2. **DOM-based sinks** — JS that writes user data via `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, `eval`, `new Function`, dangerous attribute setters.

## Inventory grep

### Server-side (PHP)

```bash
rg -n 'echo\s|<\?=|print\s' --type php \
   -g '!lib/**' -g '!vendor/**' -g '!test/**' -g '!**/acc/**'
```

### Client-side (JS)

```bash
rg -nE 'innerHTML|outerHTML|insertAdjacentHTML|document\.write|\.html\(|new Function|eval\(' \
   --type js -g '!lib/**' -g '!vendor/**' -g '!test/**' -g '!**/dist/**' -g '!**/build/**'
```

### Sanitizer reuse audit

```bash
rg -n 'safe_xss\b|htmlspecialchars\b|sanitize_text\b' --type php \
   -g '!lib/**' -g '!vendor/**' -g '!test/**'
```

Look for ad-hoc clones of the central sanitizer that drift out of sync.

## Per-site classification

| Pattern | Class |
|---|---|
| `echo htmlspecialchars($user_value, ENT_QUOTES, 'UTF-8')` | A |
| `el.textContent = api.msg` | A |
| `el.innerHTML = '<b>' + safe_xss(name) + '</b>'` | A (if `safe_xss` is allowlist-strict) |
| `el.innerHTML = api.msg` | **D** |
| `el.insertAdjacentHTML('beforeend', user_label)` | **D** |
| `echo $rqo->source->name` (no escape) | **D** |
| `eval(json)` / `new Function(code)` | **D** |
| Sanitizer using **denylist** (`str_replace('<script>', '')`) | **D** (insufficient) |

## Common D-class patterns

- **Notification renderers** that interpolate `api_response.msg` into `insertAdjacentHTML`. Replace with `appendChild(document.createTextNode(...))`.
- **CKEditor / WYSIWYG label paths** that re-render user-stored HTML via regex-template substitution without re-sanitizing on read.
- **`target="_blank"` anchors** missing `rel="noopener noreferrer"` — separate finding (low) but still XSS-adjacent.
- **Pre-auth install pages** that echo `api_response.msg` back to the user — install flow runs before the main session, sanitizer may not be loaded.
- **Denylist sanitizers** that strip `<script>` but leave `<img onerror>`, `<svg onload>`, `javascript:` URLs, inline event handlers.

## Sanitizer hardening

If you find a denylist sanitizer (SEC-034 pattern), the minimal fix is to:

1. **Strip inline event handlers** with a regex that matches `\son\w+\s*=`.
2. **Neutralise `javascript:` / `vbscript:` / `data:text/html`** in `href`, `src`, `action`, `formaction`, `xlink:href`.
3. **Document the migration** to a full allowlist (HTML Purifier or DOMDocument-based) as deferred work.

## Fix patterns

### Replace `innerHTML` with safe DOM

```js
// before (D)
target.insertAdjacentHTML('beforeend', userValue);

// after (A)
const frag = document.createDocumentFragment();
userValue.split('\n').forEach((part, i) => {
    if (i > 0) frag.appendChild(document.createElement('br'));
    if (part.length) frag.appendChild(document.createTextNode(part));
});
target.appendChild(frag);
```

### Replace `innerHTML +=` with `textContent`

```js
// before (D)
el.innerHTML = '[' + lang + ']';

// after (A)
el.textContent = '[' + lang + ']';
```

### Server-side: `safe_xss_recursive` on JSON

A flat `safe_xss($json_string)` does NOT sanitize values inside the JSON because it just regex-strips at the string level. Recurse:

```php
function safe_xss_recursive(mixed $value) : mixed {
    if (is_string($value)) return safe_xss($value);
    if (is_array($value))  return array_map('safe_xss_recursive', $value);
    if (is_object($value)) {
        foreach ($value as $k => $v) $value->$k = safe_xss_recursive($v);
        return $value;
    }
    return $value;
}
```

Apply at the API entry point (`dd_manager` decoded `_REQUEST['rqo']`).

### Anchor hardening

Every `target="_blank"`-emitting code path:

```html
<a href="..." target="_blank" rel="noopener noreferrer">
```

Audit emit sites in JS template strings too.

## Threat-model recheck

- **Stored XSS:** the user's own browser, OR another user viewing the same record? The latter is severe; the former is annoying.
- **Reflected XSS:** does the URL/form parameter survive a round-trip? Modern browsers' XSS auditors are **gone** — assume no defence.
- **Pre-auth surface:** install pages, login error rendering, password reset flows. These need extra care because the main sanitizer pipeline may not run.

## Verification

```bash
php -l <file>
vendor/bin/phpunit -c test/server/phpunit.xml test/server/components/component_text_area_Test.php
```

Manually verify in the browser:
- Save a record with content like `<img src=x onerror=alert(1)>` and reload.
- Check `<a target="_blank">` anchors have `rel="noopener noreferrer"`.

## Deferred items (document, do not block on)

- **CSP / SRI / Trusted Types** — full migration. Track as an open follow-up; mention in the findings doc.
- **Allowlist-based HTML sanitizer** (replace denylist) — substantial work; track separately.

## Output

`security-audit/xss-findings.md` with the standard structure. Mirror SEC-NNN rows in `security-findings.md`.
