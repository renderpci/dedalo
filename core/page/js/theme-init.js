/**
 * theme-init
 *
 * Early theme initialization to prevent flash of wrong theme.
 * This script runs synchronously in the head before any other content.
 * Must be loaded before the main module script.
 */
(function(){
	try {
		const t = localStorage.getItem('dedalo_theme');
		if (t === 'dark') document.documentElement.setAttribute('data-theme','dark');
	} catch(_){}
})();
