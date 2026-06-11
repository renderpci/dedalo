---
description: Audit shell-command execution sites (exec, shell_exec, popen, proc_open, passthru, system) for command injection. Run after /security-audit.
---

# Command-Exec Audit

Read `.windsurf/workflows/security-audit.md` first for the shared A/B/C/D rubric and output conventions.

## Inventory grep

Production-only sweep:

```bash
rg -nB 1 'shell_exec\(|exec\([^a]|popen\(|proc_open\(|passthru\(|system\(|backtick' \
   --type php -g '!lib/**' -g '!vendor/**' -g '!test/**' -g '!**/acc/**'
```

`exec\([^a]` excludes `executeQuery` etc. Adjust regex to your stack.

For each call site, show 3 lines of context:

```bash
rg -nA 2 -B 3 '<symbol>' --type php -g '!lib/**' -g '!vendor/**' -g '!test/**'
```

## Per-site classification

For each match, answer:

1. What's the binary path? (constant `BIN_PATH` ⇒ A; user-controlled ⇒ D.)
2. What variables are interpolated?
3. Where do those variables come from? (Trace upstream to entry point.)
4. Are they wrapped in `escapeshellarg` / `escapeshellcmd`?

### Quick verdict table

| Pattern | Class |
|---|---|
| `exec(BIN_PATH . " --flag=" . escapeshellarg($v))` | A |
| `shell_exec("rm " . escapeshellarg($server_path))` | A |
| `shell_exec("rm $server_constant_path")` | B |
| `shell_exec($cmd_from_admin_form)` (superuser only) | C |
| `exec("sh $user_uploaded_filename")` | **D** |
| `popen("$user_supplied_cmd 2>&1", 'r')` | **D** |

## Common D-class patterns to watch for

- **User-uploaded filenames** interpolated raw inside double-quoted shell context. The double quote terminates on `"`; injection follows. *(Example: SEC-038 `crop_50.php`.)*
- **`exec(...)` wrappers** in helpers (`exec_sh_file`, `live_execute_command`) that interpolate `$file` raw — the helper itself must enforce escaping.
- **Install / first-run wizards** that take web-form input and write `define('DEDALO_DBHOST', '...')`. Check whether subsequent shell calls quote the constant.
- **`process::read/stop`** and similar helpers using `tail $file` / `kill $pid` — `(int)` cast pid; `escapeshellarg` file.

## Common false positives

- `curl_exec($ch)` — not a shell call, ignore.
- `executeQuery`, `executeStatement` — DB methods, not shell.
- `// exec(...)` comment-only matches.
- Diagnostic helpers with constant arguments (`shell_exec('whoami')`, `shell_exec('uname -a')`).

## Threat-model recheck (do this before classifying as D)

For every suspect site, ask: **does an HTTP/CLI entry point actually write the interpolated value?**

If the value is a `define()` constant in `config/bootstrap.php` and `bootstrap.php` is hand-edited by a deployer with filesystem access:
- The "RCE via constant" finding collapses to **defence-in-depth** (Low).
- An attacker who can edit `config.php` can already run arbitrary PHP.

Document the recheck in the findings doc — many medium findings turn out Low after this step (cf. SEC-041 install hardening).

## Fix patterns

- **`escapeshellarg($value)`** for every interpolated argument. Quotes the value safely.
- **`escapeshellcmd()`** is weaker — prefer `escapeshellarg` per-arg.
- **`(int)$pid`** instead of `escapeshellarg` for numeric values.
- **`proc_open` with arg array** when the command structure is complex; bypasses the shell entirely.
- **Refactor helpers** so the helper itself enforces escaping. Don't trust every caller.

### Example fix

```php
// before (D)
$cmd = ImageMagick::path() . " \"$source\" -resize 800 \"$target\"";
shell_exec($cmd);

// after (A)
$cmd = ImageMagick::path()
    . ' ' . escapeshellarg($source)
    . ' -resize 800 '
    . escapeshellarg($target);
shell_exec($cmd);
```

## Trip-wire fixes (defence-in-depth)

Even when current callers pass server-built paths, harden the helper. Future callers may regress. Mark with a `SEC-NNN` comment explaining the trip-wire intent.

## Verification

```bash
php -l <edited file>
# Test the affected feature: image upload, PDF text extraction, install, etc.
```

## Helpers worth retiring (zero callers)

If a helper has zero callers (`rg --type php "<helper_name>" -g '!test/**' -g '!vendor/**' -g '!core/common/class.exec_.php'`) and uses raw interpolation, **delete it**. Leave a `SEC-NNN` marker comment explaining what was removed and a safer reintroduction path.

## Output

Append to `security-audit/cmdexec-findings.md` and mirror SEC-NNN rows in `security-audit/security-findings.md`.
