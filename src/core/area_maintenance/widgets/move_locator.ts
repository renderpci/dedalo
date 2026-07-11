/** move_locator migration widget — see move_common.ts for the shared machinery. */

import { buildMoveWidget } from './move_common.ts';

export const widget = buildMoveWidget('move_locator', {
	id: 'move_locator',
	category: 'migration',
	label: { kind: 'label', key: 'move_locator' },
});
