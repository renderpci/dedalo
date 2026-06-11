<?php declare(strict_types=1);
/**
 * Ontology Check CLI Tool
 * Command-line interface for ontology change detection
 *
 * Usage:
 *   php dev/ontology_tracker/ontology-check.php [options]
 *
 * Options:
 *   --create-baseline    Create new baseline from current ontology
 *   --check              Compare current against baseline (default)
 *   --format=FORMAT      Output format: text, json (default: text)
 *   --help               Show this help message
 *
 * @package Dev
 * @subpackage OntologyTracker
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

require_once __DIR__ . '/OntologyComparator.php';

// Parse command line arguments
$options = parseArguments($argv);

if ($options['help'] ?? false) {
    showHelp();
    exit(0);
}

// Initialize comparator
$comparator = new OntologyComparator();

// Create baseline mode
if ($options['create-baseline'] ?? false) {
    echo "Creating ontology baseline...\n";
    
    if ($comparator->createBaseline()) {
        echo "✅ Ontology baseline created successfully\n";
        echo "Location: " . __DIR__ . "/baselines/ontology.json\n";
        exit(0);
    } else {
        echo "❌ Failed to create ontology baseline\n";
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
Dédalo Ontology Check Tool
==========================

Detects breaking changes in ontology structure and tipo -> model mappings.

Usage:
  php ontology-check.php [options]

Options:
  --create-baseline    Create new baseline from current database
  --check              Compare current database against baseline (default)
  --format=FORMAT      Output format: text, json (default: text)
  --help, -h           Show this help message

Exit Codes:
  0  Success (no changes or only info-level changes)
  1  General error
  2  Breaking changes detected (tipo model changes, column removals, etc.)
  3  No baseline exists

Examples:
  # Create baseline (requires working Dédalo with database)
  php ontology-check.php --create-baseline

  # Check for ontology changes
  php ontology-check.php

  # Check with JSON output for CI parsing
  php ontology-check.php --format=json

Breaking Change Examples:
  🔴 Tipo model changed: 'numisdata3' changed from 'section' to 'component'
  🔴 Column removed: 'dd_ontology.custom_field' removed
  🟡 Index removed: 'idx_matrix_dd_section' removed from 'matrix_dd'
  🟢 New tipo added: 'newcomponent1' added with model 'component_input_text'

Note: This tool requires a working Dédalo database connection.

HELP;
}
