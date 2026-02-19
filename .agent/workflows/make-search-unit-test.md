---
description: Generates or updates PHPUnit tests for the `resolve_query_object_sql` method using samples from `search.md`.
---

This workflow automates the creation of search-specific unit tests by parsing standardized markdown samples from `search.md`.

### 1. Identify Target Component
Identify the PHP class (e.g., `component_input_text`) that inherits from `component_string_common` or uses the `search_component_string_common` trait.

### 2. Locate search.md
Find the sample file. It should be at:
`core/component_string_common/samples/search.md`

### 3. Parse search.md
Extract each test case from the markdown file. A case consists of:
- **Case Title**: The `### [Number]. [Title]` header.
- **Input Object**: The JSON block following `Param $query_object:`.
- **Expected Object**: The JSON block following `Parsed result:`.

### 4. Scaffold the Test Class
Create or update the test file at `test/server/components/[ClassName]_Search_Test.php`.

**Template Snippet:**
```php
<?php declare(strict_types=1);
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';

final class [ClassName]_Search_Test extends BaseTestCase {
    public static $model = '[ClassName]';

    /**
     * @dataProvider search_samples_provider
     */
    public function test_resolve_query_object_sql(array $input, array $expected, string $msg) {
        $this->login_as_admin();
        
        // Convert input array to object for the method
        $query_object = json_decode(json_encode($input));

        $result = [ClassName]::resolve_query_object_sql($query_object);

        $this->assertNotFalse($result, "Case failed: $msg");
        
        // Normalize line breaks for comparison
        $expected_sentence = str_replace(["\r\n", "\r", "\n"], ' ', $expected['sentence']);
        $result_sentence   = str_replace(["\r\n", "\r", "\n"], ' ', $result->sentence);
        
        $this->assertEquals($expected_sentence, $result_sentence, "Sentence mismatch in case: $msg");
        $this->assertEquals($expected['params'], (array)$result->params, "Params mismatch in case: $msg");
    }

    public static function search_samples_provider() : array {
        return [
            // Extracted cases go here
            'Case 1' => [ [input_array], [expected_array], 'Case Description' ],
            ...
        ];
    }
}
```

### 5. Populate Data Provider
Inject all parsed cases into the `search_samples_provider` method. Convert JSON samples to PHP associative arrays for the provider.

### 6. Verification
// turbo
Run the tests:
`./vendor/bin/phpunit test/server/components/[ClassName]_Search_Test.php`

### 7. Documentation
Ensure the test file includes a comment indicating it was generated from `search.md`.
