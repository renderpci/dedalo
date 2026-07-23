/**
 * design-init
 *
 * Early-execution design-line bootstrap to eliminate "flash of wrong design".
 *
 * LOADING CONTRACT
 * ----------------
 * This file is intentionally NOT a JS module. It is loaded as a plain
 * synchronous <script src="js/design-init.js"> in <head> — before the
 * deferred module bundle (index.js) and before any CSS paint — so the correct
 * `data-design` attribute is on <html> before the first frame. It mirrors
 * theme-init.js exactly; the two compose (design × theme).
 *
 * IIFE PATTERN
 * ------------
 * Wrapped in an immediately-invoked function expression to avoid leaking any
 * temporary variables into the global scope shared by classic scripts.
 *
 * STORAGE KEY COUPLING
 * --------------------
 * The literal string 'dedalo_design' must stay in sync with DESIGN_KEY in
 * core/page/js/design.js, which owns the authoritative set_design() /
 * get_design() functions used at runtime. A mismatch would apply one design
 * here and another once the module loads, causing a visible flicker.
 *
 * CLASSIC-DEFAULT OPTIMISATION
 * ----------------------------
 * Only the 'redesign' value requires an explicit `data-design` attribute;
 * classic is the CSS default (no attribute), so nothing needs to be set or
 * removed for it. This keeps the critical path minimal and guarantees that
 * installations which never opt in are wholly unaffected.
 *
 * ERROR GUARD
 * -----------
 * localStorage access is wrapped in try/catch because it throws in blocked
 * third-party iframes, restricted private-browsing modes, or under storage
 * quota policies. The fallback is a silent no-op → default (classic) design.
 */
(function(){
	try {
		const d = localStorage.getItem('dedalo_design');
		// (!) Only act on explicit 'redesign'; any other stored value (or
		// absence) leaves the attribute unset, defaulting to classic via CSS.
		if (d === 'redesign') document.documentElement.setAttribute('data-design','redesign');
	} catch(_){}
})();
