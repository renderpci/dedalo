/** dedalo_api_test_environment widget — catalog entry only (dev sandbox card). */

import type { WidgetModule } from './support.ts';

export const widget: WidgetModule = {
	spec: {
		id: 'dedalo_api_test_environment',
		category: 'dev',
		class: 'green fit width_100',
		label: { kind: 'literal', text: 'DÉDALO API TEST ENVIRONMENT' },
	},
};
