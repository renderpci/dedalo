/** move_to_table migration widget — see move_common.ts for the shared machinery. */

import { buildMoveWidget } from './move_common.ts';

export const widget = buildMoveWidget('move_to_table', {
	id: 'move_to_table',
	category: 'migration',
	label: { kind: 'label', key: 'move_to_table' },
});
