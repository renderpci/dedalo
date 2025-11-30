# API Performance Optimization Recommendations

## Critical Issues Found

### 🔴 **Issue 1: Debug dump() in Production Code (Line 150)**

**Current Code:**
```php
dump($rqo, ' rqo ++ '.to_string());
```

**Problem:** This debug statement executes on EVERY request, adding overhead.

**Optimization:**
```php
// Remove or wrap in debug check
if (SHOW_DEBUG === true) {
    dump($rqo, ' rqo ++ '.to_string());
}
```

**Impact:** ~0.5-2ms saved per request

---

## High-Priority Optimizations

### ⚠️ **Issue 2: Multiple Separate Loops (Lines 106-114)**

**Current Code:**
```php
foreach ($_POST as $key => $value) {
    $rqo->options->{$key} = safe_xss($value);
}
foreach ($_GET as $key => $value) {
    $rqo->options->{$key} = safe_xss($value);
}
foreach ($_FILES as $key => $value) {
    $rqo->options->{$key} = $value;
}
```

**Problem:** Three separate loops when processing could be combined or optimized.

**Optimization:**
```php
// Combine POST and GET processing
foreach (array_merge($_POST, $_GET) as $key => $value) {
    $rqo->options->{$key} = safe_xss($value);
}
// FILES don't need sanitization
foreach ($_FILES as $key => $value) {
    $rqo->options->{$key} = $value;
}
```

**Impact:** ~0.1-0.3ms saved per request with parameters

---

### ⚠️ **Issue 3: Redundant JSON Decoding Check (Line 89)**

**Current Code:**
```php
$str_json = file_get_contents('php://input');
if (!empty($str_json)) {
    $rqo = json_decode($str_json);
}
```

**Problem:** No error handling for invalid JSON. Should use `json_handler::decode()` for consistency.

**Optimization:**
```php
$str_json = file_get_contents('php://input');
if (!empty($str_json)) {
    $rqo = json_handler::decode($str_json);
    // Optional: Add error handling
    if ($rqo === null && json_last_error() !== JSON_ERROR_NONE) {
        error_log('Invalid JSON in request: ' . json_last_error_msg());
    }
}
```

**Impact:** Better error handling, consistent with rest of codebase

---

### ⚠️ **Issue 4: Inefficient safe_xss() Calls in Loops (Lines 107, 110, 129, 131)**

**Current Code:**
```php
foreach ($_REQUEST as $key => $value) {
    if (in_array($key, request_query_object::$direct_keys)) {
        $rqo->{$key} = safe_xss($value);
    } else {
        $rqo->source->{$key} = safe_xss($value);
    }
}
```

**Problem:** `safe_xss()` is called on every parameter. If this function is expensive, it adds up.

**Optimization Options:**

**Option A - Lazy Sanitization:**
```php
// Only sanitize when actually used (requires changes in consuming code)
// Store raw values and sanitize in getters
```

**Option B - Batch Sanitization:**
```php
// If safe_xss supports arrays
$sanitized = array_map('safe_xss', $_REQUEST);
foreach ($sanitized as $key => $value) {
    // ... assign values
}
```

**Option C - Skip Sanitization for Known Safe Keys:**
```php
$safe_keys = ['action', 'dd_api', 'prevent_lock']; // Known safe internal keys
foreach ($_REQUEST as $key => $value) {
    $sanitized_value = in_array($key, $safe_keys) ? $value : safe_xss($value);
    // ... assign
}
```

**Impact:** Depends on `safe_xss()` implementation - could save 1-5ms per request

---

### ⚠️ **Issue 5: Repeated isset() Checks for Performance Monitor (Lines 159, 212, 220, 307, 322)**

**Current Code:**
```php
if (isset($perf_monitor) && $perf_monitor->is_active()) {
    $perf_monitor->checkpoint('...');
}
```

**Problem:** Repeated checks add minor overhead.

**Optimization:**
```php
// At the top, create a flag
$perf_active = isset($perf_monitor) && $perf_monitor->is_active();

// Then use:
if ($perf_active) {
    $perf_monitor->checkpoint('...');
}
```

**Impact:** ~0.05ms saved per request (minor but cleaner)

---

## Medium-Priority Optimizations

### 💡 **Issue 6: PHP Version Check on Every Request (Lines 65-73)**

**Current Code:**
```php
$minimum_version = '8.3.0';
if (version_compare(phpversion(), $minimum_version, '<')) {
    // error response
}
```

**Problem:** This check runs on every request but PHP version never changes during runtime.

**Optimization:**
```php
// Cache the result using a static variable or constant
static $version_checked = null;
if ($version_checked === null) {
    $minimum_version = '8.3.0';
    if (version_compare(phpversion(), $minimum_version, '<')) {
        $version_checked = false;
        // error response
    } else {
        $version_checked = true;
    }
}
if ($version_checked === false) {
    // error response
}
```

**Better:** Move this check to a bootstrap/initialization file that runs once.

**Impact:** ~0.1ms saved per request

---

### 💡 **Issue 7: Unnecessary String Concatenation in Headers (Line 48)**

**Current Code:**
```php
$allow_headers = [
    'Content-Type',
    'Content-Range'
];
header('Access-Control-Allow-Headers: ' . implode(', ', $allow_headers));
```

**Problem:** Array creation and implode on every request for static values.

**Optimization:**
```php
// Just use a constant string
header('Access-Control-Allow-Headers: Content-Type, Content-Range');
```

**Impact:** ~0.01ms saved per request (minor)

---

### 💡 **Issue 8: Session Management Could Be Optimized (Lines 199-204, 226-228)**

**Current Code:**
```php
$session_closed = false;
if (isset($rqo->prevent_lock) && $rqo->prevent_lock === true) {
    session_write_close();
    $session_closed = true;
}
// ... later ...
if ($session_closed === false) {
    session_write_close();
}
```

**Optimization:**
```php
// Always close session early if prevent_lock is set
// Otherwise close after dd_manager
if (isset($rqo->prevent_lock) && $rqo->prevent_lock === true) {
    session_write_close();
} else {
    // Close session after dd_manager (existing code)
    session_write_close();
}
```

**Impact:** Cleaner code, same performance

---

## Low-Priority Optimizations

### 📝 **Issue 9: Large Commented Code Blocks**

**Lines 166-177, 272-291, 295-298:** Large commented blocks should be removed to reduce file size and parsing time.

**Optimization:** Remove dead code or move to documentation.

**Impact:** ~0.01ms saved, cleaner codebase

---

### 📝 **Issue 10: Redundant Object Creation in Error Responses**

**Lines 54-59, 67-72, 256-267:** Multiple places create similar error response objects.

**Optimization:**
```php
// Create a helper function
function create_error_response(string $msg, bool $log = true): stdClass {
    if ($log) {
        error_log('Error: ' . $msg);
    }
    $response = new stdClass();
    $response->result = false;
    $response->msg = $msg;
    return $response;
}

// Usage:
$response = create_error_response('Ignored preflight call ' . $_SERVER['REQUEST_METHOD']);
echo json_encode($response, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
exit(0);
```

**Impact:** Cleaner code, minimal performance impact

---

## Recommended Implementation Priority

### Phase 1 - Immediate (High Impact)
1. ✅ **Remove/wrap debug dump() statement** (Line 150)
2. ✅ **Profile safe_xss() function** - determine if it's a bottleneck
3. ✅ **Use json_handler::decode() consistently** (Line 89)

### Phase 2 - Quick Wins (Medium Impact)
4. ✅ **Combine POST/GET loops** (Lines 106-114)
5. ✅ **Cache performance monitor active state** (Lines 159+)
6. ✅ **Simplify CORS headers** (Line 48)

### Phase 3 - Code Quality (Low Impact)
7. ✅ **Remove commented code blocks**
8. ✅ **Create error response helper function**
9. ✅ **Move PHP version check to bootstrap**

---

## Expected Overall Impact

Implementing all optimizations:
- **Best case:** 2-8ms improvement per request
- **Typical case:** 1-3ms improvement per request
- **Code quality:** Significantly improved maintainability

---

## Monitoring Recommendations

Use the performance monitoring system to track:
1. Time spent in `request_parsed` checkpoint (sanitization overhead)
2. Time between `before_dd_manager` and `after_dd_manager` (main bottleneck)
3. Memory usage patterns

The dashboard at `https://localhost:8443/v7/core/api/v1/json/performance/performance_viewer.php` will show these metrics in real-time.
