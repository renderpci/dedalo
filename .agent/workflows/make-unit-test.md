---
description: Generates or updates PHPUnit tests for a target PHP class following Dédalo v7 standards.
---

# Workflow: PHP Unit Test Generator

This workflow automates the creation of unit tests for components and core classes.

### 1. Analysis
Read the target class file to identify:
- Namespace and Class Name.
- Parent class (to determine if it should extend `BaseTestCase`).
- Public methods and their signatures/DocBlocks.
- Dependencies in the constructor.

### 2. Scaffold Test File
Check if `test/server/components/[ClassName]_Test.php` exists. If not, create it using this template:
```php
<?php declare(strict_types=1);
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';

final class [ClassName]_test extends BaseTestCase {
    public static $model = '[ClassName]';
    // ...
}
```

### 3. Generate Test Methods
Identify all public methods in the target class. For each method `method_name`, create a corresponding `test_method_name` that:
- Logs in the test user.
- Builds an instance of the component/class.
- Calls the method with sample data (when is available) from file `samples/data.json` of the current class.
- Asserts the return type and expected value.
- Remove test methods not existing in the component/class.

### 4. Verification
// turbo
Run the newly created or updated test:
`./vendor/bin/phpunit test/server/components/[ClassName]_Test.php`

### 5. Final Report
Provide a summary of:
- Methods covered.
- Test outcome (Passed/Failed).
- Recommendations for further edge-case testing.