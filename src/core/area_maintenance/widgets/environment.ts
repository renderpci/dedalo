/** environment widget — catalog entry only (panel unported, ledgered). */

import type { WidgetModule } from './support.ts';

export const widget: WidgetModule = {
	spec: { id: 'environment', category: 'system', label: { kind: 'literal', text: 'Environment' } },
};
