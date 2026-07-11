/** move_tld migration widget — see move_common.ts for the shared machinery. */

import { buildMoveWidget } from './move_common.ts';

export const widget = buildMoveWidget('move_tld', {
	id: 'move_tld',
	category: 'migration',
	label: { kind: 'label', key: 'move_tld' },
});
