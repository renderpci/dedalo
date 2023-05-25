// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0

!(function () {
	"use strict";
	const e = function () {};
	e.prototype.request = async function (e) {
		const t = e.url || page_globals.JSON_TRIGGER_URL,
			n = e.method || "POST",
			r = e.mode || "cors",
			s = e.cache || "no-cache",
			o = e.credentials || "same-origin",
			c = e.headers || { "Content-Type": "application/json" },
			a = e.redirect || "follow",
			i = e.referrer || "no-referrer",
			u = e.body;
		u.code || (u.code = page_globals.API_WEB_USER_CODE), u.lang || (u.lang = page_globals.WEB_CURRENT_LANG_CODE);
		return fetch(t, { method: n, mode: r, cache: s, credentials: o, headers: c, redirect: a, referrer: i, body: JSON.stringify(u) })
			.then(function (e) {
				if (!e.ok) throw (console.warn("-> handle_errors response:", e), Error(e.statusText));
				return e;
			})
			.then((e) => e.json().then((e) => e))
			.catch((e) => (console.error("!!!!! [page data_manager.request] ERROR:", e), { result: !1, msg: e.message, error: e }));
	};
	(window.data_manager = new e()),
		(window.event_manager = new (function () {
			(this.events = []),
				(this.last_token = -1),
				(this.subscribe = function (e, t) {
					const n = "event_" + String(++this.last_token),
						r = { event_name: e, token: n, callback: t };
					return this.events.push(r), n;
				}),
				(this.unsubscribe = function (e) {
					return this.events.map((t, n, r) => {
						t.token === e && r.splice(n, 1);
					});
				}),
				(this.publish = function (e, t = {}) {
					const n = this.events.filter((t) => t.event_name === e);
					if (n) {
						return n.map((e) => e.callback(t));
					}
					return !1;
				}),
				(this.get_events = function () {
					return this.events;
				}),
				(this.fire_event = function (e, t) {
					var n;
					if (e.ownerDocument) n = e.ownerDocument;
					else {
						if (9 != e.nodeType) throw new Error("Invalid node passed to fireEvent: " + e.id);
						n = e;
					}
					if (e.dispatchEvent) {
						var r = "";
						switch (t) {
							case "click":
							case "mousedown":
							case "mouseup":
								r = "MouseEvents";
								break;
							case "focus":
							case "change":
							case "blur":
							case "select":
								r = "HTMLEvents";
								break;
							default:
								throw "fireEvent: Couldn't find an event class for event '" + t + "'.";
						}
						var s = "change" != t;
						(o = n.createEvent(r)).initEvent(t, s, !0), (o.synthetic = !0), e.dispatchEvent(o, !0);
					} else if (e.fireEvent) {
						var o;
						((o = n.createEventObject()).synthetic = !0), e.fireEvent("on" + t, o);
					}
				}),
				(this.when_in_dom = function (e, t) {
					const n = new MutationObserver(function (r) {
						document.contains(e) && (n.disconnect(), t(this));
					});
					return n.observe(document, { attributes: !1, childList: !0, characterData: !1, subtree: !0 }), n;
				});
		})());
})();



// @license-end
