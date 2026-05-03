---
name: Debugging PHP Null Property Assignment Errors
description: Systematic approach to identify and fix PHP errors where properties are being assigned to null or non-object values in Dédalo codebase
---

# Debugging PHP Null Property Assignment Errors

## Overview

This skill helps debug and fix PHP errors of the type "Attempt to assign property 'X' on null" or similar property assignment errors on non-object values. This is a common issue in Dédalo when iterating over data arrays that may contain mixed types (objects, null, arrays, primitives).

## When to Use This Skill

- When encountering errors like "Attempt to assign property 'X' on null"
- When seeing TypeErrors related to property access on non-objects
- When debugging iterations over data arrays in component classes
- When adding defensive programming checks to prevent crashes

## Debugging Process

### 1. Analyze the Error Message

Extract key information from the error:
- **Property name**: What property is being assigned? (e.g., `paginated_key`)
- **File path**: Where did the error occur?
- **Line number**: Exact location of the problematic code
- **Stack trace**: What called the problematic code?

### 2. Examine the Problematic Code

```bash
# View the file at the error line with context
view_file --lines around the error line
```

Look for:
- Loops iterating over arrays/collections
- Direct property assignments without type checks
- Assumptions that all elements are objects

### 3. Identify the Root Cause

Common patterns that cause this error:

**Pattern 1: Assuming all array elements are objects**
```php
// PROBLEMATIC CODE
foreach ($data as $key => $value) {
    $value->some_property = $something; // Crashes if $value is null
}
```

**Pattern 2: Not checking return values**
```php
// PROBLEMATIC CODE
$item = $this->get_item($id);
$item->property = $value; // Crashes if get_item returns null
```

**Pattern 3: Mixed data types in arrays**
```php
// PROBLEMATIC CODE
$data = [object, null, object, array()];
foreach ($data as $item) {
    $item->prop = 'x'; // Will crash on null and array
}
```

### 4. Search for Similar Patterns

Use grep to find similar occurrences in the codebase:

```bash
# Find the property name usage
grep_search --pattern "property_name" --match-per-line true

# Find the method that caused the issue
grep_search --pattern "method_name" --match-per-line true
```

### 5. Apply the Fix

**Solution: Add Type Checking**

```php
// FIXED CODE - Add is_object() check
foreach ($data as $key => $value) {
    if (is_object($value)) {
        $value->some_property = $something;
    }
}

// Or with null coalescing for single items
if (isset($item) && is_object($item)) {
    $item->property = $value;
}
```

**Alternative: Filter before iteration**
```php
// Filter out non-objects before processing
$valid_items = array_filter($data, 'is_object');
foreach ($valid_items as $item) {
    $item->property = $value;
}
```

### 6. Consider Edge Cases

Questions to ask:
- Should null values be in this array? If not, investigate why they appear
- Should the code handle null values differently (e.g., skip, log, default value)?
- Are there other places in the codebase with the same pattern?

### 7. Test the Fix

Create a test case or verify with existing tests:

```bash
# Run relevant component tests
./vendor/bin/phpunit --configuration test/server/phpunit.xml test/server/components/component_XXX_Test.php
```

## Common Dédalo Patterns

### Working with Component Data

Component data in Dédalo can contain:
- Locator objects
- Null values (empty/unset data)
- Arrays (in some cases)
- Primitive values

Always check the type before assuming object structure.

### Pagination Context

When adding pagination metadata (like `paginated_key`):

```php
// Correct pattern
foreach ($data_paginated as $key => $value) {
    if (is_object($value)) {
        $value->paginated_key = $key + $offset;
    }
}
```

### Relation/Portal Data

Portal and relation components often have mixed data types. Always validate:

```php
$data = $component->get_data();
if (!empty($data)) {
    foreach ($data as $locator) {
        if (is_object($locator) && isset($locator->section_id)) {
            // Process locator
        }
    }
}
```

## Prevention Best Practices

1. **Type Hints**: Use PHP 8 type hints where possible
2. **Null Checks**: Always check before property access on variables
3. **Array Filtering**: Filter arrays to expected types before processing
4. **Defensive Programming**: Assume data might be malformed
5. **Documentation**: Document expected data structures in docblocks

## Example Fix: The paginated_key Case

**Before (Line 3742 in component_common.php):**
```php
foreach ($data_paginated as $key => $value) {
    $paginated_key = $key + $offset;
    $value->paginated_key = $paginated_key; // ERROR: crashes on null
}
```

**After:**
```php
foreach ($data_paginated as $key => $value) {
    if (is_object($value)) {
        $paginated_key = $key + $offset;
        $value->paginated_key = $paginated_key;
    }
}
```

**Why it works:**
- The `is_object()` check ensures we only try to set properties on actual objects
- Null values and other non-object types are safely skipped
- No change in behavior for valid data

## Troubleshooting

**Issue**: Fix doesn't resolve the error
- Check if there are multiple locations with the same pattern
- Verify the error file/line matches where you made changes
- Check if caching is involved (clear opcache if needed)

**Issue**: Breaking existing functionality
- The skipped items might be needed for other logic
- Consider logging when items are skipped for investigation
- Review the data flow to understand why nulls exist

**Issue**: Too many similar errors in codebase
- Consider creating a helper method for safe property assignment
- Refactor common patterns into reusable validation functions

## Related Files in Dédalo

Common places where this pattern appears:
- `core/component_common/class.component_common.php` - get_data_paginated
- `core/component_relation_common/class.component_relation_common.php` - validate_data_element
- `core/sections/sections_json.php` - pagination handling
- `core/common/class.locator.php` - property setters

## Summary Checklist

- [ ] Analyzed error message and identified the exact location
- [ ] Examined the code and identified the pattern causing the issue
- [ ] Searched for similar occurrences in the codebase
- [ ] Applied type checking before property assignment
- [ ] Considered edge cases and data flow
- [ ] Tested the fix with relevant test cases
- [ ] Documented the change if part of a larger refactoring
