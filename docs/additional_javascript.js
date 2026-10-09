

// @license magnet:?xt=urn:btih:1f739d935676111cfff4b4693e3816e664797050&dn=gpl-3.0.txt GPL-v3-or-Later
//
// MATOMO PAGE VIEWS — one per page the reader SEES, not one per full load.
//
// mkdocs.yml enables Material's `navigation.instant`: an in-site link is fetched
// by XHR and swapped into the live document, so this file runs ONCE per visit.
// A bare `trackPageView` here counted only the landing page — every page reached
// through the nav, search or an internal link was invisible to the statistics.
//
// Material's `document$` (a ReplaySubject(1)) emits on DOMContentLoaded AND after
// every instant swap, so tracking inside the subscription is the single code path
// for both: the first emission is the landing view (Matomo reads document.referrer
// itself), each later one an SPA view whose referrer is the previous page.
// Without Material's bundle (no document$) it degrades to the classic single view.
// Gate: test/unit/docs_versioning_tripwire.test.ts.
var _paq = window._paq = window._paq || [];
(function() {
  var u="//analytics.render.es/";
  _paq.push(['setTrackerUrl', u+'matomo.php']);
  _paq.push(['setSiteId', '1']);

  if (typeof document$ === 'undefined') {
    _paq.push(['trackPageView']);
    _paq.push(['enableLinkTracking']);
  } else {
    var previousUrl = null;
    document$.subscribe(function() {
      var url = window.location.href;
      if (url === previousUrl) return;
      if (previousUrl !== null) {
        _paq.push(['setReferrerUrl', previousUrl]);
      }
      _paq.push(['setCustomUrl', url]);
      _paq.push(['setDocumentTitle', document.title]);
      _paq.push(['trackPageView']);
      // re-scan the swapped-in content for outlinks/downloads
      _paq.push(['enableLinkTracking']);
      previousUrl = url;
    });
  }

  var d=document, g=d.createElement('script'), s=d.getElementsByTagName('script')[0];
  g.type='text/javascript'; g.async=true; g.src=u+'matomo.js'; s.parentNode.insertBefore(g,s);
})();
// @license-end
