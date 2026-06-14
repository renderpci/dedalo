// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0

/**
* TEST_BOOTSTRAP
* Classic (non-module) script loaded after mocha.js and chai.js.
* Runs during parsing, before the deferred module runners, so the bdd
* interface (describe/it) and the global `assert` exist before any test
* file is imported. Externalized from inline <script> blocks to comply
* with the Content-Security-Policy (see root .htaccess script-src).
*/

// early theme init — runs in <head> before the body paints to avoid a
// theme flash. frame.html passes ?theme=...; index.html falls back to the
// saved preference. The module runners re-apply the same value later.
;(function () {
	try {
		const params = new URLSearchParams(window.location.search)
		let theme = params.get('theme')
		if (theme !== 'light' && theme !== 'dark') {
			theme = localStorage.getItem('dedalo_theme') === 'light' ? 'light' : 'dark'
		}
		document.documentElement.setAttribute('data-theme', theme)
	} catch (e) {}
})()

mocha.setup({
	ui			: 'bdd',
	checkLeaks	: true,
	asyncOnly	: true
})

window.assert = chai.assert
