/**
 * theme
 *
 * Manages the application theme (light / dark).
 * Persistence via `localStorage.dedalo_theme`.
 * Default = light.
 */

import {event_manager} from '../../common/js/event_manager.js'

export const THEME_KEY = 'dedalo_theme'

/**
 * get_theme
 * @returns {string} 'light' | 'dark'
 */
export function get_theme() {
	return localStorage.getItem(THEME_KEY) || 'light'
}

/**
 * set_theme
 * @param {string} t - 'light' | 'dark'
 */
export function set_theme(t) {
	if (t === 'dark') {
		document.documentElement.setAttribute('data-theme', 'dark')
		localStorage.setItem(THEME_KEY, 'dark')
	} else {
		document.documentElement.removeAttribute('data-theme')
		localStorage.removeItem(THEME_KEY)
	}
	event_manager.publish('theme_changed', t)
}

/**
 * toggle_theme
 */
export function toggle_theme() {
	set_theme(get_theme() === 'dark' ? 'light' : 'dark')
}
