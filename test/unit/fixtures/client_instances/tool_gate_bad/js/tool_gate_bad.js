/**
 * Test-only client model fixture for client_instances_inflight_tripwire.test.ts.
 * The named export constructs to a NON-OBJECT: a constructor that returns a
 * function makes `new tool_gate_bad()` yield that function, so
 * `typeof instance_element !== 'object'` is true inside get_instance().
 * Pre-fix, that branch did `return null` inside the Promise executor's .then()
 * and the returned Promise NEVER settled — every awaiting caller hung forever.
 * The gate asserts get_instance() resolves (to null) instead.
 */
export function tool_gate_bad() {
	return function not_an_object() {};
}
