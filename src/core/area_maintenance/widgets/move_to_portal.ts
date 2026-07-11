/** move_to_portal migration widget — see move_common.ts for the shared machinery. */

import { buildMoveWidget } from './move_common.ts';

export const widget = buildMoveWidget('move_to_portal', {
	id: 'move_to_portal',
	category: 'migration',
	label: { kind: 'label', key: 'move_to_portal' },
});
