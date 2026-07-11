/** move_lang migration widget — see move_common.ts for the shared machinery. */

import { buildMoveWidget } from './move_common.ts';

export const widget = buildMoveWidget('move_lang', {
	id: 'move_lang',
	category: 'migration',
	label: { kind: 'label', key: 'move_lang' },
});
