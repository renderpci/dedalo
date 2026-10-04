// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global*/
/*eslint no-undef: "error"*/



/**
 * SW.JS — TOMBSTONE OF A RETIRED SERVICE-WORKER URL
 * The Dédalo service worker lives at core/service_worker.js. This URL is where v6
 * (and v7 until 2026-10-02) registered it, and it must keep answering FOREVER with
 * this file: it is the only way to evict a worker that a browser still holds here.
 *
 * Why it exists (the v6 → v7 migration):
 * v6 registered core/sw.js as a CLASSIC worker that answers every '.js' request
 * cache-first from the fixed 'dedalo_files' cache via caches.match(). Opening v7 in
 * that browser, index.js?ckcachebust=… misses (query string) and comes from the
 * network, but its unversioned static imports hit the v6 cache: the page runs v7
 * and v6 modules mixed. And the worker never went away — the browser's update check
 * re-fetched core/sw.js under the CLASSIC registration, got v7's MODULE worker
 * (static `import`), failed to parse it, and kept v6. Even v7's login.js, which
 * would have re-registered as a module, was itself served from the v6 cache.
 *
 * What it does: the browser re-fetches a registration's script on every navigation
 * into its scope, bypassing the HTTP cache. Here it gets THIS file, which installs
 * under any registration type, takes over at once, deletes the v6 cache, unregisters
 * itself and reloads the windows that ran v6 code.
 *
 * (!) RULES (gated by test/unit/sw_tombstone_tripwire.test.ts):
 * - NO import / export / importScripts: must parse as a classic AND a module worker,
 *   whatever type the registration it lands in was created with.
 * - NO fetch listener: once active, every request goes to the network.
 * - It deletes ONLY the v6 key 'dedalo_files'. Versioned keys ('dedalo_files_<v>')
 *   may belong to the current service_worker.js, which supersedes the orphans of a
 *   retired sw.js registration itself (delete_old_caches) on its next pass.
 */



// string legacy_cache_name. The v6 fixed cache key. v7 never creates it (its keys
// are versioned), so its presence is the proof that this browser ran v6 here.
const legacy_cache_name = 'dedalo_files'



/**
 * INSTALL EVENT
 * Replace the old worker NOW: waiting for every tab to close would leave the v6
 * worker serving its cache for as long as one Dédalo tab stays open.
 */
self.addEventListener('install', (event) => {
	event.waitUntil(self.skipWaiting())
})



/**
 * ACTIVATE EVENT
 * claim → purge → unregister → reload the windows that ran v6 code.
 * Never rejects: a failure must not leave this worker stuck half-way.
 */
self.addEventListener('activate', (event) => {
	event.waitUntil((async () => {
		try {
			// control the open windows, so navigate() below is allowed on them
			await self.clients.claim()

			const had_legacy_cache = await caches.delete(legacy_cache_name)

			// pages already loaded stay controlled until they unload — harmless, this
			// worker intercepts nothing — and the registration is gone after that
			await self.registration.unregister()

			// Reload only when v6 code may have run in them. A browser that held a v7
			// worker at this URL already runs the right code: reloading it would
			// interrupt a user mid-edit for nothing.
			if (had_legacy_cache) {
				const windows = await self.clients.matchAll({type: 'window'})
				await Promise.all(windows.map(client => client.navigate(client.url).catch(() => null)))
			}
		} catch (error) {
			console.error(')) sw.js tombstone failed:', error)
		}
	})())
})



// @license-end
