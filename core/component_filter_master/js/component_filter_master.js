// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



/**
* COMPONENT_FILTER_MASTER
* Client-side module for the user project-assignment component (component_filter_master).
*
* `component_filter_master` is the JS counterpart of the PHP class `component_filter_master`
* (core/component_filter_master/class.component_filter_master.php). On the server side the
* class overrides `save()` (to flush permission caches) and `propagate_filter()` (no-op),
* but the client-side behaviour is identical to `component_filter`: same rendering,
* same checkbox interaction, same change-handler flow.
*
* Because no client-side behaviour differs from its parent, this module simply re-exports
* `component_filter` under the `component_filter_master` name. The Dédalo dynamic-import
* system resolves component class names from the component's `model` property at runtime;
* both names must be importable as ES modules. This alias file is what makes the name
* `component_filter_master` resolvable without duplicating any logic.
*
* Usage:
* ```js
* // The import loader resolves this module automatically based on the component tipo.
* // Direct usage follows the same pattern as component_filter:
* const instance = new component_filter_master()
* await instance.init(options)
* ```
*
* @module component_filter_master
* @see component_filter   (../../component_filter/js/component_filter.js) — full implementation.
* @see class.component_filter_master.php — server-side overrides (save, propagate_filter).
* @see docs/core/components/component_filter_master.md — data model and properties reference.
*/

// imports
	import {component_filter} from '../../component_filter/js/component_filter.js'



/**
* COMPONENT_FILTER_MASTER
* Named re-export alias for `component_filter`.
*
* Exposes `component_filter` as `component_filter_master` so that the Dédalo
* dynamic-import loader can resolve this component by its PHP class name without
* any additional client-side implementation. All functionality — constructor,
* prototype methods, rendering, change handling — is inherited wholesale from
* `component_filter`.
*
* This is intentionally an identity alias (`component_filter_master === component_filter`
* at runtime), not a subclass. If the client side ever needs to diverge from
* `component_filter` behaviour (e.g. different UI for permission management vs.
* record filtering), replace this alias with a dedicated class that extends or
* reimplements `component_filter`.
*
* @type {Function} component_filter_master - Constructor function, identical to `component_filter`.
*/
// alias of component_filter
	export const component_filter_master = component_filter



// @license-end
