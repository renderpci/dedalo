// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0

/**
* DESIGN
* Application-level design-line controller for Dédalo v7.
*
* Dédalo ships more than one visual design language at once, each a fully
* self-contained "design line". This controller selects the active line and
* persists the choice, exactly mirroring the light/dark theme mechanism
* (`core/page/js/theme.js`) — the two axes compose (design × theme).
*
* Lines:
* - 'classic'  — the untouched historical design. This is the implicit
*                default: NO `data-design` attribute is set, so classic renders
*                from the base `:root` tokens and unmodified component CSS.
* - 'redesign' — the "Calm Scholarly" line. Applied via `data-design="redesign"`
*                on `<html>`; a scoped override layer (`page/css/redesign/`)
*                redefines tokens and adds structural rules under that selector,
*                leaving classic byte-for-byte untouched.
*
* Design decisions (identical rationale to theme.js):
* - Classic is the implicit default: no attribute means classic, avoiding a
*   FOUC and guaranteeing that installations which never opt in are unaffected.
*   `localStorage.removeItem` is used (not setItem('classic')) so clearing
*   storage also resets to classic.
* - A companion inline script (`core/page/js/design-init.js`) runs synchronously
*   in `<head>` before any module loads, applying `data-design` from
*   localStorage immediately to prevent a flash of the wrong design.
* - Changes are broadcast over the event bus as 'design_changed'.
*
* Exports:
* - {string}   DESIGN_KEY     — localStorage key constant
* - {Function} get_design     — read the current persisted line name
* - {Function} set_design      — apply a line and persist it
* - {Function} toggle_design   — flip between classic and redesign
*/

import {event_manager} from '../../common/js/event_manager.js'

// Storage key used for persisting the user's design-line preference across
// sessions. Kept as a named export so design-init.js and any other early-boot
// scripts import the same constant rather than duplicating the literal.
export const DESIGN_KEY = 'dedalo_design'

/**
* GET_DESIGN
* Returns the currently persisted design-line name.
*
* Reads from `localStorage` and falls back to 'classic' when no preference
* has been saved. Does not inspect the live DOM attribute — the source of
* truth is always the persisted value.
*
* @returns {string} 'classic' or 'redesign'
*/
export function get_design() {
	return localStorage.getItem(DESIGN_KEY) || 'classic'
}

/**
* SET_DESIGN
* Applies the requested design line to the document and persists the choice.
*
* For 'redesign': sets `data-design="redesign"` on `<html>` and writes the
* value to localStorage so it survives reloads.
* For any other value (including 'classic'): removes the attribute (restoring
* the default classic cascade) and clears the localStorage entry, so that no
* entry means 'classic' — consistent with the fallback in get_design().
*
* Publishes 'design_changed' on the global event bus with the new line string.
*
* @param {string} d - Line to apply. Recognised: 'classic' | 'redesign'.
*   Any value other than 'redesign' is treated as 'classic'.
* @returns {void}
*/
export function set_design(d) {
	if (d === 'redesign') {
		document.documentElement.setAttribute('data-design', 'redesign')
		localStorage.setItem(DESIGN_KEY, 'redesign')
	} else {
		document.documentElement.removeAttribute('data-design')
		localStorage.removeItem(DESIGN_KEY)
	}
	event_manager.publish('design_changed', d)
}

/**
* TOGGLE_DESIGN
* Flips the active design line between 'redesign' and 'classic'.
*
* Reads the current persisted line via get_design(), inverts it, and delegates
* to set_design() which handles DOM updates, storage persistence, and the
* 'design_changed' event bus notification.
*
* @returns {void}
*/
export function toggle_design() {
	set_design(get_design() === 'redesign' ? 'classic' : 'redesign')
}
