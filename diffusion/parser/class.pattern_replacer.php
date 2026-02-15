<?php declare(strict_types=1);
/**
 * Advanced Pattern Replacement with Empty Value Handling
 *
 * This class provides sophisticated pattern replacement functionality that gracefully
 * handles empty or null values while maintaining proper formatting and spacing.
 */
class pattern_replacer {

    /**
     * Temporary marker used to identify empty values during processing
     */
    private const EMPTY_MARKER = '___EMPTY___';

    /**
     * Replaces placeholders in a pattern string with provided values
     *
     * This method uses a two-phase approach:
     * 1. Replace all placeholders, marking empty values with a temporary marker
     * 2. Clean up the result by removing markers and fixing punctuation/spacing
     *
     * @param string $pattern The pattern string containing ${variable} placeholders
     * @param array $values Indexed array of values to replace placeholders with
     * @return string The processed string with placeholders replaced and formatting cleaned
     *
     * @example
     * $replacer = new pattern_replacer();
     * $result = $replacer->replace('${a}, ${b}, ${c} /${d}', ['Juan', 'Perez', null, '2025']);
     * // Returns: 'Juan, Perez /2025'
     */
    public function replace(string $pattern, array $values) : string {
        $placeholder_index = 0;

        // Phase 1: Replace all placeholders with values or empty markers
        // Uses preg_replace_callback to process each placeholder individually
        $result = preg_replace_callback(
            '/\$\{([^}]+)\}/',  // Matches ${anything} pattern
            function($matches) use ($values, &$placeholder_index) {
                // Check if we have a value for this placeholder position
                if ($placeholder_index < count($values)) {
                    $value = $values[$placeholder_index];
                    $placeholder_index++;

                    // Return actual value or empty marker for null/empty values
                    return ($value !== null && $value !== '') ? $value : self::EMPTY_MARKER;
                }

                // No value available for this placeholder
                return self::EMPTY_MARKER;
            },
            $pattern
        );

        // Phase 2: Clean up the result by handling empty markers and formatting
        return $this->cleanup_formatting($result);
    }

    /**
     * Cleans up text formatting by removing empty value markers and fixing punctuation
     *
     * This method processes the text in a specific order to handle various edge cases:
     * - Empty values between punctuation marks
     * - Empty values at the beginning or end of the string
     * - Spacing issues around removed content
     *
     * @param string $text Text containing empty markers to be cleaned up
     * @return string Cleaned text with proper formatting
     */
    private function cleanup_formatting( string $text ) : string {
        // Define cleanup patterns in order of processing priority
        // Each pattern targets a specific formatting scenario
        $cleanup_patterns = [
            // Remove empty value followed by comma and optional space
            // Example: "John, ___EMPTY___, Smith" → "John, Smith"
            '/___EMPTY___\s*,\s*/' => '',

            // Replace empty value between commas with single comma
            // Example: "John, ___EMPTY___, Smith" → "John, Smith"
            '/,\s*___EMPTY___\s*,/' => ',',

            // Remove comma before empty value that's followed by slash
            // Example: "John, ___EMPTY___ /2025" → "John /2025"
            '/,\s*___EMPTY___\s*\//' => ' /',

            // Remove empty value at end of string after comma
            // Example: "John, Smith, ___EMPTY___" → "John, Smith"
            '/,\s*___EMPTY___\s*$/' => '',

            // Remove empty value at start of string before comma
            // Example: "___EMPTY___, Smith" → "Smith"
            '/^\s*___EMPTY___\s*,\s*/' => '',

            // Remove any remaining empty markers
            // This catches any markers not handled by above patterns
            '/___EMPTY___/' => '',

            // Normalize multiple consecutive spaces to single space
            // Example: "John    Smith" → "John Smith"
            '/\s+/' => ' ',
        ];

        // Apply each cleanup pattern sequentially
        foreach ($cleanup_patterns as $pattern => $replacement) {
            $text = preg_replace($pattern, $replacement, $text);
        }

        // Remove any leading or trailing whitespace
        return trim($text);
    }
}

/**
 * Convenience function for quick pattern replacement
 *
 * @param string $pattern Pattern string with ${variable} placeholders
 * @param array $values Array of values to substitute
 * @return string Processed string with proper formatting
 */
function replace_pattern_advanced(string $pattern, array $values) : string {
    $replacer = new pattern_replacer();
    return $replacer->replace($pattern, $values);
}

// ================================================================================
// USAGE EXAMPLES AND DEMONSTRATIONS
// ================================================================================

// echo "Advanced Pattern Replacement - Usage Examples\n";
// echo str_repeat("=", 60) . "\n\n";

// // Create an instance of the pattern_replacer class
// $replacer = new pattern_replacer();

// // ---- Example 1: Basic name formatting with missing middle name ----
// echo "Example 1: Name formatting with missing values\n";
// echo str_repeat("-", 40) . "\n";

// $pattern1 = '${firstName}, ${lastName}, ${middleName} /${year}';
// $values1 = ['Juan', 'Perez', null, '2025'];

// echo "Pattern: '$pattern1'\n";
// echo "Values:  " . json_encode($values1) . "\n";
// echo "Result:  '" . $replacer->replace($pattern1, $values1) . "'\n";
// echo "Expected: 'Juan, Perez /2025'\n\n";

// // ---- Example 2: Mixed empty strings and values ----
// echo "Example 2: Handling empty strings\n";
// echo str_repeat("-", 40) . "\n";

// $pattern2 = '${first}, ${second}, ${third} /${fourth}';
// $values2 = ['Juan', '', 'Garcia', '2025'];

// echo "Pattern: '$pattern2'\n";
// echo "Values:  " . json_encode($values2) . "\n";
// echo "Result:  '" . $replacer->replace($pattern2, $values2) . "'\n";
// echo "Expected: 'Juan, Garcia /2025'\n\n";

// // ---- Example 3: Multiple empty values ----
// echo "Example 3: Multiple consecutive empty values\n";
// echo str_repeat("-", 40) . "\n";

// $pattern3 = '${a}, ${b}, ${c} /${d}';
// $values3 = ['', 'Perez', '', '2025'];

// echo "Pattern: '$pattern3'\n";
// echo "Values:  " . json_encode($values3) . "\n";
// echo "Result:  '" . $replacer->replace($pattern3, $values3) . "'\n";
// echo "Expected: 'Perez /2025'\n\n";

// // ---- Example 4: Date-like patterns ----
// echo "Example 4: Date formatting with missing components\n";
// echo str_repeat("-", 40) . "\n";

// $pattern4 = '${year}/${month}/${day}';
// $values4 = ['2025', null, '15'];

// echo "Pattern: '$pattern4'\n";
// echo "Values:  " . json_encode($values4) . "\n";
// echo "Result:  '" . $replacer->replace($pattern4, $values4) . "'\n";
// echo "Expected: '2025/15'\n\n";

// // ---- Example 5: Sentence patterns ----
// echo "Example 5: Sentence with optional components\n";
// echo str_repeat("-", 40) . "\n";

// $pattern5 = 'Hello ${name}, welcome to ${place}${exclamation}';
// $values5 = ['John', '', '!'];

// echo "Pattern: '$pattern5'\n";
// echo "Values:  " . json_encode($values5) . "\n";
// echo "Result:  '" . $replacer->replace($pattern5, $values5) . "'\n";
// echo "Expected: 'Hello John!'\n\n";

// // ---- Example 6: Using the convenience function ----
// echo "Example 6: Using convenience function\n";
// echo str_repeat("-", 40) . "\n";

// echo "Using replace_pattern_advanced() function:\n";
// $result = replace_pattern_advanced('${a}, ${b}, ${c}', ['First', null, 'Third']);
// echo "Result: '$result'\n";
// echo "Expected: 'First, Third'\n\n";

// // ---- Edge Cases ----
// echo "Edge Cases:\n";
// echo str_repeat("-", 40) . "\n";

// echo "1. All empty values:\n";
// $allEmpty = $replacer->replace('${a}, ${b}, ${c}', [null, '', null]);
// echo "   Result: '$allEmpty'\n\n";

// echo "2. More placeholders than values:\n";
// $morePatterns = $replacer->replace('${a}, ${b}, ${c}, ${d}', ['Only', 'Two']);
// echo "   Result: '$morePatterns'\n\n";

// echo "3. No placeholders:\n";
// $noPatterns = $replacer->replace('Just plain text', ['Unused', 'Values']);
// echo "   Result: '$noPatterns'\n";
