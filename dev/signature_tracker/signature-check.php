<?php declare(strict_types=1);
/**
 * Signature Check CLI Tool
 * Command-line interface for signature tracking and comparison
 *
 * Usage:
 *   php dev/signature_tracker/signature-check.php [options]
 *
 * Options:
 *   --create-baseline    Create new baseline from current signatures
 *   --check              Compare current against baseline (default)
 *   --format=FORMAT      Output format: text, json (default: text)
 *   --help               Show this help message
 *
 * @package Dev
 * @subpackage SignatureTracker
 */

// Bootstrap Dédalo if available
$bootstrap_paths = [
    __DIR__ . '/../../config/bootstrap.php',
    __DIR__ . '/../../../config/bootstrap.php',
    __DIR__ . '/../../core/config/bootstrap.php',
];

foreach ($bootstrap_paths as $path) {
    if (file_exists($path)) {
        define('APP_ROOT', dirname(dirname($path)));
        require_once $path;
        break;
    }
}

require_once __DIR__ . '/SignatureComparator.php';

// Parse command line arguments
$options = parseArguments($argv);

if ($options['help'] ?? false) {
    showHelp();
    exit(0);
}

// Initialize comparator
$comparator = new SignatureComparator();

// Create baseline mode
if ($options['create-baseline'] ?? false) {
    echo "Creating baseline...\n";
    
    if ($comparator->createBaseline()) {
        echo "✅ Baseline created successfully\n";
        echo "Location: " . __DIR__ . "/baselines/signatures.json\n";
        exit(0);
    } else {
        echo "❌ Failed to create baseline\n";
        exit(1);
    }
}

// Check/compare mode (default)
$format = $options['format'] ?? 'text';

$result = $comparator->compareAll();

if ($format === 'json') {
    echo json_encode($result, JSON_PRETTY_PRINT) . "\n";
} else {
    echo $comparator->getReport($result);
}

// Exit with error code if breaking changes found
if ($result['status'] === 'changed' && $result['breaking_count'] > 0) {
    exit(2); // Breaking changes detected
}

if ($result['status'] === 'no_baseline') {
    exit(3); // No baseline exists
}

exit(0); // Success

/**
 * PARSE_ARGUMENTS
 * Parse command line arguments
 *
 * @param array $argv Command line arguments
 * @return array Parsed options
 */
function parseArguments(array $argv): array {
    $options = [];
    
    foreach ($argv as $arg) {
        if ($arg === '--help' || $arg === '-h') {
            $options['help'] = true;
        } elseif ($arg === '--create-baseline') {
            $options['create-baseline'] = true;
        } elseif ($arg === '--check') {
            $options['check'] = true;
        } elseif (str_starts_with($arg, '--format=')) {
            $options['format'] = substr($arg, 9);
        }
    }
    
    // Default to check if no action specified
    if (!isset($options['create-baseline']) && !isset($options['help'])) {
        $options['check'] = true;
    }
    
    return $options;
}

/**
 * SHOW_HELP
 * Display help message
 *
 * @return void
 */
function showHelp(): void {
    echo <<<HELP
Dédalo Signature Check Tool
===========================

Detects breaking changes in PHP class/method signatures.

Usage:
  php signature-check.php [options]

Options:
  --create-baseline    Create new baseline from current code
  --check              Compare current code against baseline (default)
  --format=FORMAT      Output format: text, json (default: text)
  --help, -h           Show this help message

Exit Codes:
  0  Success (no changes or only info-level changes)
  1  General error
  2  Breaking changes detected
  3  No baseline exists

Examples:
  # Create baseline
  php signature-check.php --create-baseline

  # Check for changes (text output)
  php signature-check.php

  # Check for changes (JSON output)
  php signature-check.php --format=json

  # In CI pipeline
  php signature-check.php || echo "Breaking changes detected!"

HELP;
}
