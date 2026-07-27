<?php declare(strict_types=1);
/**
* CLASS OPCACHEOBJECTMANAGER
* Low-level PHP-file serialization layer that turns arbitrary PHP data into
* OPcache-optimized executable cache files.
*
* Rather than JSON or serialize(), this class encodes data as a PHP source file
* of the form `<?php return [...];`. On the first include PHP compiles the file
* to opcodes and stores them in shared memory. Every subsequent include fetches
* the data structure directly from that in-memory opcode cache — no disk I/O,
* no parsing, no deserialization cost.
*
* Responsibilities:
* - generateCode() — converts any PHP variable to a compact, short-array-syntax
*   PHP source string, stripping redundant sequential integer keys and trailing
*   commas so the produced file is as small as possible.
* - save()         — atomically writes the generated code to disk and evicts the
*   previous version from OPcache so the next include sees fresh data.
* - load()         — reads a previously saved cache file via include and returns
*   the contained value.
*
* Design notes:
* - All methods are static; the class is used as a utility namespace — never
*   instantiated.
* - Custom objects stored through this manager must implement __set_state() so
*   that var_export() can reconstruct them upon include. Plain arrays and scalars
*   work without any requirement.
* - The atomic write uses a temp-file + rename() to avoid readers seeing a
*   partially-written file on concurrent access.
*
* Primary consumer: dd_cache (core/base/class.dd_cache.php), which wraps this
* class and adds user-scoped file naming, background-process support, and
* automatic cleanup on logout.
*
* Also used directly by core/component_security_access/calculate_tree.php to
* emit a compiled access-tree file via generateCode().
*
* Loaded unconditionally by core/base/class.loader.php.
*
* @package Dédalo
* @subpackage Core
*/
class OpcacheObjectManager
{
    /**
     * GENERATECODE
     * Converts an arbitrary PHP variable into a minified, executable PHP source
     * string of the form `<?php return <value>;` using short array syntax.
     *
     * The method relies on var_export() to produce an initial representation and
     * then re-tokenizes it to apply two transformations that reduce file size:
     *
     * 1. Key elision for sequential integer arrays.
     *    var_export() always emits explicit integer keys (e.g. `0 => 'a'`).
     *    When a key matches the natural PHP auto-increment counter for its array
     *    — tracked per nesting level in $indexStack — the `<key> =>` pair is
     *    stripped so the array becomes a compact list literal.  Sparse arrays
     *    (where a gap resets the counter) keep their explicit keys.
     *
     * 2. Trailing-comma removal.
     *    var_export() adds a trailing comma after the last element of every
     *    array.  Because all whitespace is stripped, the comma is always the
     *    last character of $output when the closing delimiter is reached; a
     *    single substr() truncation removes it before appending `]`.
     *
     * Additionally, `array(…)` long syntax produced by var_export() is rewritten
     * to `[…]` short syntax, and all whitespace tokens are discarded, yielding a
     * fully minified string.
     *
     * (!) Objects in $data must implement __set_state() or they will produce
     *     PHP code that cannot be round-tripped via include.
     *
     * @param mixed $data - the variable to serialize (array, scalar, or object
     *                      with __set_state())
     * @return string     - a complete, minified PHP source string beginning with
     *                      `<?php return ` and ending with `;`
     */
    public static function generateCode($data): string
    {
        $code = var_export($data, true);
        $tokens = token_get_all("<?php " . $code);

        $output = "<?php return ";

        $stack = [];      // Tracks if we are inside an array [] or a regular block ()
        $indexStack = []; // Tracks expected integer indices for sparse array detection

        $isPendingArray = false;
        $count = count($tokens);

        for ($i = 0; $i < $count; $i++) {
            $token = $tokens[$i];

            if (is_array($token)) {
                $type = $token[0];
                $value = $token[1];

                // 1. Skip non-code tokens
                if ($type === T_OPEN_TAG || $type === T_COMMENT || $type === T_DOC_COMMENT || $type === T_WHITESPACE) {
                    continue;
                }

                // 2. INTELLIGENT KEY REMOVAL
                if ($type === T_LNUMBER) {
                    if (self::isNextSignificantTokenAnArrow($tokens, $i)) {
                        $intVal = (int)$value;
                        $shouldRemove = false;

                        if (!empty($indexStack)) {
                            $currentIndex = end($indexStack);
                            if ($intVal === $currentIndex) {
                                // Key matches the natural sequence counter: mark for removal
                                // and advance the counter for this nesting level.
                                $shouldRemove = true;
                                $keys = array_keys($indexStack);
                                $indexStack[end($keys)]++;
                            } else {
                                // Sparse gap: keep the explicit key and jump the counter to
                                // the value PHP would use for the next auto-increment.
                                $keys = array_keys($indexStack);
                                $indexStack[end($keys)] = $intVal + 1;
                            }
                        }

                        if ($shouldRemove) {
                            // Skip the integer token, whitespace, and the `=>` arrow so
                            // only the value is emitted, turning `0 => 'x'` into `'x'`.
                            $i = self::skipToAfterArrow($tokens, $i);
                            continue;
                        }
                    }
                }

                // 3. Handle 'array' keyword
                // var_export() always uses the long-form `array(…)` syntax.
                // Setting $isPendingArray defers the opening `(` so it can be
                // rewritten to `[` when the paren is encountered below.
                if ($type === T_ARRAY) {
                    $isPendingArray = true;
                    continue;
                }

                $output .= $value;
                if ($isPendingArray) $isPendingArray = false;

            } else {
                // Handle Symbols
                if ($token === '(') {
                    if ($isPendingArray) {
                        // Rewrite `array(` to `[` and push a nesting level with
                        // an index counter starting at 0.
                        $output .= '[';
                        $stack[] = true;
                        $indexStack[] = 0;
                        $isPendingArray = false;
                    } else {
                        // Non-array parenthesis (e.g. inside a __set_state call):
                        // pass through unchanged and push a non-array marker.
                        $output .= '(';
                        $stack[] = false;
                    }
                } elseif ($token === ')') {
                    $isArray = array_pop($stack);
                    if ($isArray) {
                        // --- NEW FIX: Remove Trailing Comma ---
                        // Since we stripped whitespace, the comma is strictly the last char.
                        if (substr($output, -1) === ',') {
                            $output = substr($output, 0, -1);
                        }
                        // --------------------------------------

                        // Close the short-array syntax and discard the per-level index counter.
                        $output .= ']';
                        array_pop($indexStack);
                    } else {
                        $output .= ')';
                    }
                } else {
                    $output .= $token;
                }

                // Any symbol other than `(` following a T_ARRAY means the pending-
                // array flag was set erroneously; clear it to avoid corrupting state.
                if ($token !== '(') $isPendingArray = false;
            }
        }

        return $output . ";";
    }

    /**
     * ISNEXTSIGNIFICANTTOKENANARROW
     * Scans forward from $index to determine whether the next non-whitespace
     * token sequence is a fat-arrow (`=>`).
     *
     * Used by generateCode() to decide whether an integer token is an array
     * key (followed by `=>`) or a plain value, before deciding to elide it.
     *
     * The method handles two tokenizer representations of `=>`:
     * - T_DOUBLE_ARROW  — the standard single token produced by PHP >= 7.
     * - `=` followed by `>`  — a split-token fallback present in some tokenizer
     *   versions or hand-composed token streams.
     *
     * @param array $tokens - full token array from token_get_all()
     * @param int   $index  - position of the current integer token to look ahead from
     * @return bool         - true when the next significant token(s) form `=>`
     */
    private static function isNextSignificantTokenAnArrow(array $tokens, int $index): bool
    {
        for ($j = $index + 1; $j < count($tokens); $j++) {
            $t = $tokens[$j];
            if (is_array($t) && $t[0] === T_WHITESPACE) continue;

            // Standard T_DOUBLE_ARROW (=>)
            if (is_array($t) && $t[0] === T_DOUBLE_ARROW) return true;

            // Fallback for manual composition or specific tokenizer versions
            if ($t === '=') {
                // Check next for '>'
                $k = $j + 1;
                while(isset($tokens[$k]) && is_array($tokens[$k]) && $tokens[$k][0] === T_WHITESPACE) $k++;
                if (isset($tokens[$k]) && $tokens[$k] === '>') return true;
                return false;
            }

            return false;
        }
        return false;
    }

    /**
     * SKIPTOAFTERARROW
     * Advances the loop index past the `=>` fat-arrow token sequence so that
     * generateCode() can resume emitting output at the value that follows the
     * arrow, effectively dropping the `<key> =>` pair from the output.
     *
     * Returns the index of the last token consumed (either the T_DOUBLE_ARROW
     * token or the `>` character of a split `=`+`>` pair).  The caller's for-
     * loop will then increment once more before reading the next token, so the
     * value token following the arrow is processed normally.
     *
     * If no arrow is found (should not happen in practice given the prior call
     * to isNextSignificantTokenAnArrow()), the original $index is returned
     * unchanged to avoid corrupting the loop position.
     *
     * @param array $tokens - full token array from token_get_all()
     * @param int   $index  - position of the integer key token to skip from
     * @return int          - index of the last consumed arrow token, or $index
     *                        if no arrow was found
     */
    private static function skipToAfterArrow(array $tokens, int $index): int
    {
        for ($j = $index + 1; $j < count($tokens); $j++) {
            $t = $tokens[$j];
            if (is_array($t) && $t[0] === T_WHITESPACE) continue;

            if (is_array($t) && $t[0] === T_DOUBLE_ARROW) return $j;

            if ($t === '=') {
                $k = $j + 1;
                while(isset($tokens[$k]) && is_array($tokens[$k]) && $tokens[$k][0] === T_WHITESPACE) $k++;
                if (isset($tokens[$k]) && $tokens[$k] === '>') return $k;
            }
        }
        return $index;
    }

    /**
     * SAVE
     * Serializes $data to a PHP cache file at $path using an atomic write
     * strategy, then evicts the old version from OPcache.
     *
     * Write procedure:
     * 1. generateCode() converts $data to a minified PHP source string.
     * 2. The string is written to a uniquely-named temp file in the same
     *    directory as $path (same-filesystem rename guarantee).
     * 3. rename() atomically replaces $path with the temp file — readers
     *    always see either the old complete file or the new complete file,
     *    never a partial write.
     * 4. opcache_invalidate() is called with $force=true so the old opcode
     *    entry is evicted immediately; the next include recompiles from disk
     *    and re-populates shared memory with the fresh data.
     *
     * The temp-file suffix is 16 hex characters from random_bytes(8), making
     * collisions between concurrent writers astronomically unlikely.
     *
     * (!) If the rename() fails the temp file is left on disk. Callers should
     *     treat a false return as a hard error and investigate filesystem
     *     permissions or disk-full conditions.
     *
     * @param string $path - absolute path to the destination cache file
     * @param mixed  $data - value to cache (array, scalar, or object with
     *                       __set_state())
     * @return bool        - true when the file was written and renamed
     *                       successfully; false on any I/O failure
     */
    public static function save(string $path, $data): bool
    {
        $finalContent = self::generateCode($data);

        // Atomic Write
        $temp = $path . bin2hex(random_bytes(8)) . '.tmp';
        if (file_put_contents($temp, $finalContent, LOCK_EX) === false) {
            return false;
        }

        $success = rename($temp, $path);

        // Evict old opcodes so the next include sees the new file.
        // The function_exists() guard handles environments where the OPcache
        // extension is disabled (e.g. CLI with opcache.enable_cli=0).
        if ($success && function_exists('opcache_invalidate')) {
            opcache_invalidate($path, true);
        }

        return $success;
    }

    /**
     * LOAD
     * Reads a previously saved cache file and returns its embedded value.
     *
     * The file is loaded via include, which causes PHP to either:
     * - Fetch the precompiled opcodes from OPcache shared memory (fast path,
     *   no disk I/O after the first hit), or
     * - Compile the file fresh, cache the opcodes, and return the value
     *   (first-hit or post-invalidation path).
     *
     * Returns null when the file does not exist rather than triggering an
     * include warning, allowing callers to treat a cache miss as a recoverable
     * condition.
     *
     * (!) The return type is `mixed` because the cached value may be any PHP
     *     type (array, scalar, object). Callers must validate the returned
     *     value before use.
     *
     * @param string $path - absolute path to the cached .php file written by
     *                       save()
     * @return mixed       - the value returned by the included file, or null
     *                       when the file does not exist
     */
    public static function load(string $path): mixed
    {
        if (!file_exists($path)) {
            return null;
        }
        return include $path;
    }
}
