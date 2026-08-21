/**
 * Test-only client model fixture for client_instances_inflight_tripwire.test.ts.
 * Imported by instances.js get_instance() through the DEDALO_TOOLS_URLS seam
 * (model 'tool_gate_ok' → `${DEDALO_TOOLS_URLS.tool_gate_ok}/js/tool_gate_ok.js`).
 * Counts constructions and inits on globalThis.__gate_counters so the gate can
 * assert the build ran exactly once under concurrency.
 */
export function tool_gate_ok() {
	globalThis.__gate_counters.constructed++;
}
tool_gate_ok.prototype.init = async function(options) {
	globalThis.__gate_counters.init_started++;
	// span real async time so a concurrent second caller lands INSIDE the build
	// window (between the cache miss and instances_map.set)
	await new Promise((resolve) => setTimeout(resolve, 20));
	globalThis.__gate_counters.init_finished++;
	this.options = options;
	this.is_init = true;
	return true;
};
