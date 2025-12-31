<?php declare(strict_types=1);
/**
 * OpcacheObjectManager
 * * A high-performance data persistence layer designed to leverage PHP's OPcache.
 * This class serializes PHP variables into minified .php files with short array syntax.
 * * FIXES APPLIED:
 * 1. Added Index Tracking ($indexStack) to prevent corruption of sparse/associative arrays.
 * 2. Only removes numeric keys if they match the natural PHP auto-increment sequence.
 * * @package    Cache
 * @version    1.2.0
 */
class OpcacheObjectManager
{
    /**
     * Serializes a variable into a minified PHP string using short array syntax.
     * * FIX 1: Smartly removes numeric keys (handles sparse arrays).
     * * FIX 2: Removes trailing commas for cleaner, smaller code.
     * * @param mixed $data The variable to process.
     * @return string The generated "<?php return [...];" string.
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
                                $shouldRemove = true;
                                $keys = array_keys($indexStack);
                                $indexStack[end($keys)]++; 
                            } else {
                                $keys = array_keys($indexStack);
                                $indexStack[end($keys)] = $intVal + 1;
                            }
                        }

                        if ($shouldRemove) {
                            $i = self::skipToAfterArrow($tokens, $i);
                            continue;
                        }
                    }
                }

                // 3. Handle 'array' keyword
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
                        $output .= '[';
                        $stack[] = true;        
                        $indexStack[] = 0;      
                        $isPendingArray = false;
                    } else {
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
                        
                        $output .= ']';
                        array_pop($indexStack); 
                    } else {
                        $output .= ')';
                    }
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
     * Returns the index of the token that completes the '=>'
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
     * Saves the generated code to a file atomically.
     * @param string $path The destination path.
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
     * Loads cached data.
     * @param string $path The absolute path to the cached .php file.
     * @return mixed The cached data structure, or null if missing.
     */
    public static function load(string $path): mixed
    {
        if (!file_exists($path)) {
            return null;
        }
        return include $path;
    }
}