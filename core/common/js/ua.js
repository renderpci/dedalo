// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, tool_posterframe */
/*eslint no-undef: "error"*/



/**
* UA
* User-agent / browser capability detector for Dédalo v7.
*
* Provides static methods to probe whether the current browser supports the
* technologies required by AI/ML features (WebGPU, Transformers.js) and to
* identify the browser name and version via both the modern User-Agent Client
* Hints API and the traditional `navigator.userAgent` string.
*
* Usage pattern — all methods are called directly on the constructor function
* (static dispatch); the constructor itself is only instantiated when a caller
* needs to accumulate results across multiple checks into `this.results`:
*
*   const detector = new ua();
*   await ua.check_transformers_webgpu.call(detector);
*   console.log(detector.results);
*
* Main static methods:
*   check_transformers_webgpu  — orchestrates a full WebGPU + Transformers.js check
*   check_browser              — quick sync browser-name flags via UA string
*   check_webgpu               — async WebGPU adapter/device probe
*   check_transformers_js      — checks whether Transformers.js globals are present
*   check_performance          — benchmarks basic CPU compute speed
*   get_browser_info_modern    — browser info via User-Agent Client Hints API
*   get_browser_info_legacy    — browser info via traditional UA-string parsing
*   get_detailed_browser_info  — picks modern or legacy parser automatically
*   get_webgpu_recommendations — human-readable remediation advice
*/
export const ua = function() {

	// results accumulator — populated by check_transformers_webgpu
	this.results = {};
}//end ua




/**
* CHECK_TRANSFORMERS_WEBGPU
* Orchestrates a complete capability check for AI inference in the browser.
*
* Runs all four probes sequentially (browser info, WebGPU, Transformers.js,
* performance) and assembles the results into `this.results`. Sets
* `results.overall` to the WebGPU supported flag as the primary gate —
* Transformers.js with WebGPU backend is the minimum requirement for
* on-device model inference in Dédalo.
*
* (!) This method must be called with `this` bound to a `ua` instance so
* that `self.results` accumulates correctly. Use `new ua()` and then
* `await ua.check_transformers_webgpu.call(instance)`.
*
* @returns {Promise<Object>} Resolves to `this.results`, which has the shape:
*   {
*     browser:      {Object}  — output of get_detailed_browser_info()
*     webgpu:       {Object}  — output of check_webgpu()
*     transformers: {Object}  — output of check_transformers_js()
*     performance:  {Object}  — output of check_performance()
*     overall:      {boolean} — true when WebGPU is supported
*   }
*/
ua.check_transformers_webgpu = async function() {

	const self = this

	self.results = {
		browser			: await self.get_detailed_browser_info(),
		webgpu			: await self.check_webgpu(),
		transformers	: await self.check_transformers_js(),
		performance		: await self.check_performance()
	};

	// overall is keyed on WebGPU: without it Transformers.js cannot use GPU acceleration
	self.results.overall = self.results.webgpu.supported;

	return self.results;
}//end check_transformers_webgpu



/**
* CHECK_BROWSER
* Synchronous, lightweight browser identification via UA-string regex tests.
*
* Uses simple regex heuristics rather than the Client Hints API, so it is
* available immediately without an async call. Suitable for quick gating
* decisions (e.g. showing a WebGPU warning banner) where a rough answer is
* enough. For accurate version numbers use `get_detailed_browser_info()`.
*
* Edge detection requires the double-negative guard (`!/Edge/.test`) because
* Chromium-based Edge also injects "Chrome" into its UA string.
*
* @returns {Object} Detection result with the shape:
*   {
*     user_agent:  {string}  — raw navigator.userAgent string
*     is_chrome:   {boolean} — true for Chrome/Chromium (excludes Edge)
*     is_firefox:  {boolean} — true for Firefox
*     is_safari:   {boolean} — true for Safari (excludes Chrome/Chromium)
*     recommended: {boolean} — true when WebGPU support is considered reliable
*   }
*/
ua.check_browser = function() {


	const user_agent	= navigator.userAgent;
	const is_chrome		= /Chrome/.test(user_agent) && !/Edge/.test(user_agent);
	const is_firefox	= /Firefox/.test(user_agent);
	const is_safari		= /Safari/.test(user_agent) && !/Chrome/.test(user_agent);

	return {
		user_agent: user_agent,
		is_chrome,
		is_firefox,
		is_safari,
		recommended: is_chrome || is_firefox // WebGPU support is best in these
	};
}//end check_browser



/**
* CHECK_WEBGPU
* Probes the browser's WebGPU implementation end-to-end.
*
* Goes beyond merely checking `navigator.gpu` — it requests a real GPU adapter
* and then a logical device to confirm that the hardware and driver stack are
* actually usable. The device is destroyed immediately after the check to
* release GPU resources; it is not retained for inference use.
*
* Three failure modes are distinguished:
*   1. `navigator.gpu` absent — browser has no WebGPU support at all.
*   2. `requestAdapter()` returns null — GPU exists but no suitable adapter
*      (e.g. hardware acceleration disabled, no compatible GPU).
*   3. `requestDevice()` throws — adapter found but device creation failed
*      (driver crash, out of memory, feature mismatch).
*
* @returns {Promise<Object>} Resolves (never rejects) to one of:
*   Success: { supported: true,  adapter_info: { features: Array, limits: GPULimits } }
*   Failure: { supported: false, reason: {string} }
*/
ua.check_webgpu = async function() {
	if (!navigator.gpu) {
		return { supported: false, reason: 'navigator.gpu not available' };
	}

	try {
		const adapter = await navigator.gpu.requestAdapter();
		if (!adapter) {
			return { supported: false, reason: 'No GPU adapter found' };
		}

		const device = await adapter.requestDevice();
		// destroy immediately — we only needed the device to confirm it can be created
		device.destroy();

		return {
			supported: true,
			adapter_info: {
				features: Array.from(adapter.features),
				limits: adapter.limits
			}
		};
	} catch (error) {
		return { supported: false, reason: error.message };
	}
}//end check_webgpu



/**
* CHECK_TRANSFORMERS_JS
* Checks whether the Hugging Face Transformers.js library is available in the
* current browser context.
*
* Detection strategy: looks for `window.pipeline` (the primary inference
* entry point) or `window.env` (the library's runtime configuration object).
* Either presence is treated as evidence that Transformers.js has been loaded.
*
* The `typeof window === 'undefined'` guard makes the function safe to call
* in Web Worker or SSR contexts where there is no global `window`.
*
* (!) This check only confirms that the library is loaded, not that a model
* has been downloaded or that inference will succeed. A `{ supported: true }`
* result should always be combined with `check_webgpu()` before enabling GPU
* inference features.
*
* @returns {Promise<Object>} Resolves to:
*   Success: { supported: true }
*   Failure: { supported: false, reason: {string} }
*/
ua.check_transformers_js = async function() {
	if (typeof window === 'undefined') {
		return { supported: false, reason: 'Not in browser environment' };
	}

	// Check if Transformers.js is available
	if (typeof window.pipeline === 'undefined' &&
		typeof window.env === 'undefined') {
		return { supported: false, reason: 'Transformers.js not loaded' };
	}

	return { supported: true };
}//end check_transformers_js



/**
* CHECK_PERFORMANCE
* Benchmarks the browser's raw CPU compute speed with a simple floating-point
* loop to estimate whether the device is fast enough for ML inference.
*
* Runs one million `Math.sqrt` iterations and records the wall-clock time.
* This deliberately uses a tight synchronous loop — it blocks the main thread
* for the duration, so it should not be called in a latency-sensitive context.
* Call it during an initialisation phase before the UI is interactive.
*
* The 1 000 ms threshold (`acceptable: duration < 1000`) is intentionally
* lenient; it only filters out severely constrained devices. On a modern
* desktop this loop typically completes in under 10 ms.
*
* @returns {Promise<Object>} Resolves to:
*   {
*     basic_compute_time: {number}  — elapsed milliseconds for the loop
*     acceptable:         {boolean} — true when duration is under 1 000 ms
*   }
*/
ua.check_performance = async function() {
	// Simple performance check
	const start_time = performance.now();
	// Perform a simple computation to test basic capability
	let result = 0;
	for (let i = 0; i < 1000000; i++) {
		result += Math.sqrt(i);
	}
	const duration = performance.now() - start_time;

	return {
		basic_compute_time: duration,
		acceptable: duration < 1000 // arbitrary threshold
	};
}//end check_performance



/**
* GET_BROWSER_INFO_MODERN
* Identifies the browser using the User-Agent Client Hints API
* (`navigator.userAgentData`), which provides structured, entropy-preserving
* brand data that is more reliable than UA-string parsing.
*
* The `brands` array returned by the API can contain multiple entries
* (e.g. both "Chromium" and "Google Chrome" for Chrome). This method resolves
* that ambiguity by checking each known brand in priority order and taking
* only the first match. Unknown browsers fall through to `name: 'unknown'`.
*
* Returns early with `is_modern_api: false` when the API is absent (Firefox,
* Safari, and all non-Chromium browsers as of 2024). Callers should always
* check `is_modern_api` and fall back to `get_browser_info_legacy()`.
*
* @returns {Object} Browser identification with the shape:
*   Success (API available):
*     {
*       is_modern_api: {boolean} — always true on this path
*       user_agent:    {string}  — raw navigator.userAgent (legacy fallback string)
*       platform:      {string}  — OS platform string or 'unknown'
*       name:          {string}  — 'Chrome' | 'Firefox' | 'Safari' | 'Edge' | 'unknown'
*       version:       {string}  — version string from the matched brand entry
*       full_brand:    {string}  — raw brand string from the brands array
*     }
*   Failure (API not supported):
*     { is_modern_api: false, error: {string} }
*/
ua.get_browser_info_modern = function() {
	// Check if User-Agent Client Hints API is available
	if (!navigator.userAgentData || !navigator.userAgentData.brands) {
		return {
			is_modern_api: false,
			error: 'User-Agent Client Hints API not supported'
		};
	}

	const brands		= navigator.userAgentData.brands;
	const platform		= navigator.userAgentData.platform || 'unknown';
	const user_agent	= navigator.userAgent;

	// Find main browser brand
	const chrome_brand = brands.find(brand =>
		brand.brand.includes('Chromium') ||
		brand.brand.includes('Google Chrome')
	);

	const firefox_brand = brands.find(brand =>
		brand.brand.includes('Firefox')
	);

	const safari_brand = brands.find(brand =>
		brand.brand.includes('Safari')
	);

	const edge_brand = brands.find(brand =>
		brand.brand.includes('Microsoft Edge')
	);

	const browser_info = {
		is_modern_api	: true,
		user_agent		: user_agent,
		platform		: platform,
		name			: 'unknown',
		version			: 'unknown',
		full_brand		: 'unknown'
	};

	if (chrome_brand) {
		browser_info.name		= 'Chrome';
		browser_info.version	= chrome_brand.version;
		browser_info.full_brand	= chrome_brand.brand;
	} else if (firefox_brand) {
		browser_info.name		= 'Firefox';
		browser_info.version	= firefox_brand.version;
		browser_info.full_brand	= firefox_brand.brand;
	} else if (safari_brand) {
		browser_info.name		= 'Safari';
		browser_info.version	= safari_brand.version;
		browser_info.full_brand	= safari_brand.brand;
	} else if (edge_brand) {
		browser_info.name		= 'Edge';
		browser_info.version	= edge_brand.version;
		browser_info.full_brand	= edge_brand.brand;
	}

	return browser_info;
}//end get_browser_info_modern



/**
* GET_DETAILED_BROWSER_INFO
* Resolves the most accurate browser information available in the current
* environment, automatically choosing between the modern Client Hints API
* and the legacy UA-string parser.
*
* Strategy:
*   1. If `navigator.userAgentData.brands` is present (Chromium-family browsers),
*      delegate to `get_browser_info_modern()` and tag the result with
*      `method: 'brands'`.
*   2. Otherwise fall back to `get_browser_info_legacy()` and tag the result
*      with `method: 'parsing'` and `is_modern_api: false`.
*
* The returned object always contains at minimum: `name`, `version`,
* `user_agent`, `method`, and `is_modern_api`.
*
* (!) Although the method is declared `async`, it does not currently await
* any promise — the signature is async for future compatibility (e.g. if
* `getHighEntropyValues()` is added for version resolution).
*
* @returns {Promise<Object>} Browser info object (same shape as
*   `get_browser_info_modern()` / `get_browser_info_legacy()`) with an
*   additional `method` property: `'brands'` or `'parsing'`.
*/
ua.get_detailed_browser_info = async function () {

	const self = this

	// Try modern API first
	if (navigator.userAgentData && navigator.userAgentData.brands) {
		const modern_info = self.get_browser_info_modern();
		if (modern_info.is_modern_api) {
			return {
				...modern_info,
				method: 'brands'
			};
		}
	}

	// Fallback to traditional userAgent parsing
	return {
		...self.get_browser_info_legacy(),
		method: 'parsing',
		is_modern_api: false
	};
}



/**
* GET_BROWSER_INFO_LEGACY
* Identifies the browser by parsing the traditional `navigator.userAgent`
* string. Used as a fallback when the User-Agent Client Hints API is
* unavailable (Firefox, Safari, non-Chromium environments).
*
* Parsing rules, in priority order:
*   Chrome  — UA contains 'Chrome' but NOT 'Edg' (avoids false-positive on Edge)
*   Firefox — UA contains 'Firefox'
*   Safari  — UA contains 'Safari' but NOT 'Chrome' (Chromium injects 'Safari')
*   Edge    — UA contains 'Edg' (both 'Edg/' for Chromium Edge and 'Edge/' legacy)
*
* Note that Chrome-based browsers (Brave, Opera, Vivaldi) will be reported as
* 'Chrome' because they share the same UA token. This is intentional — for
* WebGPU feature detection the distinction is irrelevant.
*
* @returns {Object} Browser info with the shape:
*   {
*     name:       {string} — 'Chrome' | 'Firefox' | 'Safari' | 'Edge' | 'unknown'
*     version:    {string} — dotted version string or 'unknown' when not matched
*     user_agent: {string} — raw navigator.userAgent string
*   }
*/
ua.get_browser_info_legacy = function() {
	const user_agent = navigator.userAgent;
	const browser_info = {
		name		: 'unknown',
		version		: 'unknown',
		user_agent	: user_agent
	};

	// Traditional parsing as fallback
	if (user_agent.includes('Chrome') && !user_agent.includes('Edg')) {
		const match = user_agent.match(/Chrome\/([0-9.]+)/);
		browser_info.name = 'Chrome';
		browser_info.version = match ? match[1] : 'unknown';
	} else if (user_agent.includes('Firefox')) {
		const match = user_agent.match(/Firefox\/([0-9.]+)/);
		browser_info.name = 'Firefox';
		browser_info.version = match ? match[1] : 'unknown';
	} else if (user_agent.includes('Safari') && !user_agent.includes('Chrome')) {
		const match = user_agent.match(/Version\/([0-9.]+)/);
		browser_info.name = 'Safari';
		browser_info.version = match ? match[1] : 'unknown';
	} else if (user_agent.includes('Edg')) {
		const match = user_agent.match(/Edg\/([0-9.]+)/);
		browser_info.name = 'Edge';
		browser_info.version = match ? match[1] : 'unknown';
	}

	return browser_info;
}//end get_browser_info_legacy



/**
* GET_WEBGPU_RECOMMENDATIONS
* Generates a list of human-readable remediation steps based on the failure
* reasons detected by a prior `check_transformers_webgpu()` call.
*
* (!) This method reads `this.results`, which is only populated after calling
* `check_transformers_webgpu()` on the same instance. Calling it before that
* will throw because `this.results.webgpu` is undefined.
*
* Returns an empty array when everything is supported — callers can use
* `recommendations.length === 0` as a "all good" signal without additional
* checks.
*
* Recommendation groups:
*   WebGPU not supported — actionable steps for the user (flags, browser choice,
*     driver update).
*   Transformers.js not loaded — actionable steps for the integrator (import
*     check, connectivity).
*
* @returns {Array} Array of {string} recommendation messages, possibly empty.
*/
ua.get_webgpu_recommendations = function() {
	const recommendations = [];

	if (!this.results.webgpu.supported) {
		recommendations.push('Enable WebGPU in your browser flags');
		recommendations.push('Use Chrome, Safari or Firefox Technology Preview');
		recommendations.push('Update your graphics drivers');
	}

	if (!this.results.transformers.supported) {
		recommendations.push('Make sure Transformers.js is properly imported');
		recommendations.push('Check your internet connection for model downloads');
	}

	return recommendations;
}//end get_webgpu_recommendations



// @license-end