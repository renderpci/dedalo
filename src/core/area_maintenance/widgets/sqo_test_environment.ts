/** sqo_test_environment widget — catalog entry only (dev sandbox card). */

import type { WidgetModule } from './support.ts';

export const widget: WidgetModule = {
	spec: {
		id: 'sqo_test_environment',
		category: 'dev',
		class: 'blue fit width_100',
		label: { kind: 'literal', text: 'Search query object test environment' },
	},
};
