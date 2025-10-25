// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, tool_posterframe */
/*eslint no-undef: "error"*/



/**
* UA
* User Agent / Browser
* Check the user agent technologies
*/
export const ua = function() {

	this.results = {};
}//end ua




/**
* CHECK_TRANSFORMERS_WEBGPU
*/
ua.check_transformers_webgpu = async function() {

	const self = this

	self.results = {
		browser			: await self.get_detailed_browser_info(),
		webgpu			: await self.check_webgpu(),
		transformers	: await self.check_transformers_js(),
		performance		: await self.check_performance()
	};

	self.results.overall = self.results.webgpu.supported;

	return self.results;
}//end check_transformers_webgpu



/**
* CHECK_BROWSER
* a simple browser detection
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