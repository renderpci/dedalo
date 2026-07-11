/**
 * php_info widget — a phpinfo() iframe with no Bun equivalent; the client
 * already hides the card (ENGINE_DISABLED_WIDGETS). The getValue is the loud,
 * named fallback.
 */

import { type WidgetModule, engineDenied } from './support.ts';

export const widget: WidgetModule = {
	spec: {
		id: 'php_info',
		category: 'system',
		class: 'violet fit width_100',
		label: { kind: 'literal', text: 'PHP INFO' },
	},
	getValue: engineDenied('php_info', 'phpinfo() has no equivalent on the Bun/TS engine'),
};
