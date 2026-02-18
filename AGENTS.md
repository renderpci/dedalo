# Dédalo — Agent Development Guidelines

This file provides comprehensive guidance for AI coding agents working in the Dédalo repository. Follow these patterns, commands, and conventions to ensure consistent, high-quality contributions.

## Interactions
- In all interactions and commit messages, be extremely concise and precise and sacrifice grammar for the sake of concision.

## Project Overview

**Dédalo** is a PHP-based knowledge management system for Cultural Heritage using an ontology-driven model. Key characteristics:
- PHP 8.3+ with strict typing
- PostgreSQL 16+ with JSONB storage
- Runtime object construction from ontology definitions
- MVC architecture with component-based UI

## Development Commands

### Dependencies
```bash
# Install PHP development dependencies
composer install

# Update dependencies
composer update
```

### Testing
```bash
# Run all tests
vendor/bin/phpunit

# Run specific test suite
vendor/bin/phpunit --testsuite "unit components"
vendor/bin/phpunit --testsuite "unit search"
vendor/bin/phpunit --testsuite "unit API"

# Run single test file
vendor/bin/phpunit test/server/components/component_text_area_Test.php

# Run with coverage
vendor/bin/phpunit --coverage-html coverage/
```

### Documentation
```bash
# Build documentation
mkdocs build

# Serve documentation locally
mkdocs serve
```

## Code Style Guidelines

### PHP Standards

#### File Structure
- **Declaration**: Always start with `<?php declare(strict_types=1);`
- **Class Header**: Comprehensive docblock with purpose, features, and package info
- **Order**: Constants → Properties → Constructor → Methods (public → protected → private)

#### Naming Conventions
- **Classes**: `snake_case` (e.g., `component_text_area`, `class.search.php`)
- **Methods**: `snake_case` with descriptive names (e.g., `get_identifier()`, `is_empty()`)
- **Properties**: `snake_case` with visibility modifiers
- **Constants**: `UPPER_SNAKE_CASE` (e.g., `DEDALO_ENTITY`, `SHOW_DEBUG`)
- **Files**: `class.{classname}.php` for classes, `trait.{traitname}.php` for traits

#### Type Declarations
```php
// Always declare return types
public function get_identifier() : string {
    return $this->tipo;
}

// Use nullable types where appropriate
public function is_empty(?object $data_item) : bool {
    // implementation
}

// Declare parameter types in method signatures
private function build_component_instance(
    string $model,
    string $tipo,
    int $section_id,
    string $mode,
    string $lang,
    string $section_tipo
): component_common {
    // implementation
}
```

#### Documentation Standards
```php
/**
 * METHOD_DESCRIPTION
 * Detailed explanation of purpose and behavior
 *
 * @param type $param_name Description of parameter
 * @return type Description of return value
 * @throws Exception Description of when exception is thrown
 *
 * @package Dedalo
 * @subpackage Core
 */
```

### Import and Include Patterns

#### File Organization
```php
<?php declare(strict_types=1);

// Core includes first
include_once 'trait.select.php';
include_once 'trait.from.php';

// Class documentation
/**
 * CLASS DESCRIPTION
 * Comprehensive explanation of purpose and features
 */

class search {
    // Use traits for code organization
    use select, from, where, order, count, utils;

    // Implementation
}
```

#### Component Structure
```php
<?php declare(strict_types=1);
/**
 * CLASS COMPONENT_[TYPE]
 * Determine the logic of the [type] component
 *
 * Key features:
 * - Feature 1 description
 * - Feature 2 description
 * - Inherited behavior explanation
 *
 * @package Dedalo
 * @subpackage Core
 */
class component_text_area extends component_string_common {

    // Class constants
    public const CONSTANT_NAME = 'value';

    // Properties with visibility
    public $arguments;
    protected $protected_property;
    private static $static_property = [];

    // Constructor (if needed)
    public function __construct(object $options) {
        parent::__construct($options);
        // Additional initialization
    }

    // Public methods
    public function is_empty(?object $data_item) : bool {
        // Implementation
    }

    // Protected methods
    protected function validate_data(object $data) : bool {
        // Implementation
    }

    // Private methods
    private function internal_process() : void {
        // Implementation
    }
}
```

## Error Handling

### Exception Patterns
```php
// Use typed exceptions with descriptive messages
if (empty($this->get_tipo())) {
    throw new Exception("Error Processing Request. empty tipo", 1);
}

// Validate inputs early
public function get_identifier() : string {
    if (empty($this->get_tipo())) {
        throw new Exception("Cannot generate identifier: tipo is empty", 1);
    }

    return $this->tipo;
}
```

### Null Safety
```php
// Use null coalescing and null-safe operators
$value = $data_item->value ?? null;
$result = $object?->method()?->property;

// Check for null before operations
if ($data_item !== null) {
    $processed = $this->process_data($data_item);
}
```

## Testing Patterns

### Test File Structure
```php
<?php declare(strict_types=1);
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';

final class component_text_area_test extends BaseTestCase {

    // Test configuration
    public static $model = 'component_text_area';
    public static $tipo = 'test17';
    public static $section_tipo = 'test3';

    // Helper methods
    private function build_component_instance() {
        $this->user_login();

        $component = component_common::get_instance(
            self::$model,
            self::$tipo,
            1, // section_id
            'edit', // mode
            DEDALO_DATA_NOLAN, // lang
            self::$section_tipo
        );

        return $component;
    }

    // Test methods
    public function test_is_empty() {
        $component = $this->build_component_instance();
        $result = $component->is_empty(null);
        $this->assertTrue($result);
    }
}
```

### Test Naming
- **Files**: `{classname}_Test.php`
- **Methods**: `test_{method_name}_{scenario}`
- **Classes**: `{classname}_test` extending `BaseTestCase`

## Component Development

### Creating New Components
1. **Copy existing component**: Use `core/component_text_area/` as template
2. **Update class name**: Change to `component_{new_type}`
3. **Modify inheritance**: Extend appropriate common class
4. **Update references**: Change all namespaced references
5. **Register component**: Use Development Area after deployment

### Component Directory Structure
```
core/component_{type}/
├── class.component_{type}.php          # Main class
├── component_{type}_json.php           # JSON API handler
├── js/
│   ├── component_{type}.js             # Main JavaScript
│   ├── view_default_edit_{type}.js     # Edit view
│   ├── view_default_list_{type}.js     # List view
│   └── render_edit_component_{type}.js # Edit renderer
├── css/
│   └── component_{type}.less           # Styles
└── samples/
    └── api_data.json                    # Sample returned data by JSON API
    └── data.json                        # Sample data stored in database
    └── context.json                     # Sample context returned by JSON API
```

## Database and Ontology

### Database Patterns
- **Tables**: Use `matrix_` prefix (e.g., `matrix_dd`, `matrix_list`)
- **JSONB**: Store data in JSONB format for flexibility
- **Queries**: Use prepared statements and parameter binding

### Ontology Integration
- **Runtime construction**: Objects built from ontology definitions
- **Descriptors**: Use thesaurus for indexation and relationships
- **Locators**: Implement universal locator pattern for references
- **Sample ontology definition**: Use a SQL query to get the ontology definition

## Configuration

### Config Files
- **Samples**: Use `config/sample.*.php` as templates
- **Production**: Copy to `config/*.php` and modify
- **Constants**: Define behavior via `DEDALO_*` constants
- **Never edit**: Sample files directly

### Environment Constants
```php
// Core configuration
define('DEDALO_ENTITY', 'your_entity_name');
define('SHOW_DEBUG', false); // Set to true in development
define('DEDALO_DATA_LANG', 'lg-eng');
define('DEDALO_DATA_NOLAN', 'lg-nolan');

// Development only
define('DEVELOPMENT_SERVER', true);
define('IS_UNIT_TEST', true); // In test environment
```

## Security Considerations

### Input Validation
- **Type checking**: Use strict typing and validate inputs
- **SQL injection**: Use prepared statements
- **XSS prevention**: Sanitize user inputs
- **Authentication**: Check user permissions in area handlers

### Data Access
- **User context**: Always validate user permissions
- **Project filtering**: Apply project-based data filtering
- **Maintenance mode**: Respect maintenance mode settings

## Performance Guidelines

### Optimization Patterns
- **Caching**: Use appropriate caching strategies
- **Lazy loading**: Load data only when needed
- **Batch operations**: Process multiple items together
- **Memory management**: Clean up large objects

### Database Optimization
- **Indexes**: Add indexes for frequently queried columns
- **JSONB queries**: Use efficient JSONB query patterns
- **Connection pooling**: Reuse database connections

## Common Pitfalls to Avoid

1. **Hardcoding paths**: Use `DEDALO_*` constants for paths
2. **Direct config editing**: Never edit `sample.*` files
3. **Missing type declarations**: Always declare parameter and return types
4. **Inconsistent naming**: Follow established naming conventions
5. **Breaking ontology contracts**: Preserve ontology compatibility
6. **Ignoring error handling**: Always handle potential exceptions
7. **Skipping tests**: Write tests for new functionality

## Integration Points

### External Dependencies
- **FFmpeg**: Video processing and transcoding
- **ImageMagick**: Image manipulation
- **Xpdf**: PDF text extraction
- **PostgreSQL**: Primary database storage

### API Endpoints
- **JSON API**: Under `core/api/`

## Git Commit Standards
All commits generated by agents must follow the Conventional Commits specification:

- **Format:** `<type>(<scope>)<optional !>: <description>`
- **Types:** `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`.
- **Breaking Changes:** Append a `!` after the type/scope to signal a breaking change (e.g., `feat(api)!: rewrite auth logic`).
- **Description Rules:** - Use the imperative, present tense ("change" not "changed").
  - No period at the end.
  - Keep the header first line under 50 characters if possible.
  - If the description exceeds 50 characters, use a blank line to separate the header from the body.
  - The body should provide additional context or details about the change.

## When in Doubt

1. **Search patterns**: Use `grep` to find existing implementations
2. **Follow examples**: Reference similar components or classes
3. **Check tests**: Review existing test files for usage patterns
4. **Preserve contracts**: Don't break ontology or API contracts
5. **Ask for clarification**: Request guidance for high-impact changes

This document serves as the primary reference for AI agents working in the Dédalo codebase. Follow these guidelines to ensure consistent, maintainable, and secure contributions to the project.