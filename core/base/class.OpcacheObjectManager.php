<?php declare(strict_types=1);
/**
 * OpcacheObjectManager
 * * A high-performance data persistence layer designed to leverage PHP's OPcache.
 * * This class serializes PHP variables (arrays and objects) into minified .php files.
 * By using 'include', the data is compiled into opcodes and stored in Shared Memory (SHM).
 * Subsequent reads bypass parsing and lexing, resulting in near-instant data retrieval.
 * * @package    Cache
 * @author     AI Assistant
 * @version    1.1.0
 */
class OpcacheObjectManager
{

    /**
     * Serializes a variable into a minified PHP string using short array syntax.
     * Automatically removes redundant numeric keys to minimize size and parse time.
     * This method contains the core logic for transforming the output of var_export
     * into a production-ready, OPcache-optimized string.
     * @param mixed $data The variable to process.
     * @return string The generated "<?php return [...];" string.
     */
    public static function generateCode($data): string
    {
        $code = var_export($data, true);
        $tokens = token_get_all("<?php " . $code);
        
        $output = "<?php return ";
        $stack = []; 
        $isPendingArray = false;
        
        $count = count($tokens);
        for ($i = 0; $i < $count; $i++) {
            $token = $tokens[$i];

            if (is_array($token)) {
                $type = $token[0];
                $value = $token[1];

                if ($type === T_OPEN_TAG || $type === T_COMMENT || $type === T_DOC_COMMENT || $type === T_WHITESPACE) {
                    continue;
                }

                // IDENTIFY REDUNDANT NUMERIC KEYS (e.g., 0 =>)
                if ($type === T_LNUMBER) {
                    if (self::isNextSignificantTokenAnArrow($tokens, $i)) {
                        // Skip this number AND the arrow that follows it
                        $i = self::skipToAfterArrow($tokens, $i);
                        continue;
                    }
                }

                if ($type === T_ARRAY) {
                    $isPendingArray = true;
                    continue;
                }

                $output .= $value;
                if ($isPendingArray) $isPendingArray = false; 

            } else {
                // Handle structural symbols
                if ($token === '(') {
                    if ($isPendingArray) {
                        $output .= '[';
                        $stack[] = true;
                        $isPendingArray = false;
                    } else {
                        $output .= '(';
                        $stack[] = false;
                    }
                } elseif ($token === ')') {
                    $isArray = array_pop($stack);
                    $output .= $isArray ? ']' : ')';
                } else {
                    $output .= $token;
                }
                
                if ($token !== '(') $isPendingArray = false;
            }
        }

        return $output . ";";
    }

    /**
     * Look ahead to see if the next non-whitespace tokens form '=>'
     */
    private static function isNextSignificantTokenAnArrow(array $tokens, int $index): bool
    {
        $foundEqual = false;
        for ($j = $index + 1; $j < count($tokens); $j++) {
            $t = $tokens[$j];
            if (is_array($t) && $t[0] === T_WHITESPACE) continue;
            
            // In some PHP versions, => is a single T_DOUBLE_ARROW
            if (is_array($t) && $t[0] === T_DOUBLE_ARROW) return true;
            
            // In others/manual parsing, check for '=' then '>'
            if ($t === '=') { $foundEqual = true; continue; }
            if ($t === '>' && $foundEqual) return true;
            
            return false;
        }
        return false;
    }

    /**
     * Returns the index of the token after the '=>'
     */
    private static function skipToAfterArrow(array $tokens, int $index): int
    {
        $foundEqual = false;
        for ($j = $index + 1; $j < count($tokens); $j++) {
            $t = $tokens[$j];
            if (is_array($t) && $t[0] === T_DOUBLE_ARROW) return $j;
            if ($t === '=') { $foundEqual = true; continue; }
            if ($t === '>' && $foundEqual) return $j;
        }
        return $index;
    }

    /**
     * Saves the generated code to a file atomically.
     * * @param string $path The destination path.
     * @param mixed  $data The variable to cache.
     * @return bool True on success.
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
        
        if ($success && function_exists('opcache_invalidate')) {
            opcache_invalidate($path, true);
        }

        return $success;
    }

    /**
     * Loads cached data from the filesystem via OPcache.
     * * If OPcache is enabled, this method does not "read" the file from disk after
     * the first hit; instead, it returns the compiled data structure from RAM.
     * * 
     * * @param string $path The absolute path to the cached .php file.
     * * @return mixed The cached data structure, or null if the file is missing.
     */
    public static function load(string $path) : mixed
    {
        if (!file_exists($path)) {
            return null;
        }

        // The include statement executes the 'return' inside the cache file
        return include $path;
    }
}