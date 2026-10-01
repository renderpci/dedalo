/**
 * A WRITE GRANT for `translateAndWrite` in a gate that drives the translation
 * ENGINE directly (closure Step 3 req 10): the engine takes a RecordGrant — the
 * write door's branded proof — never raw coordinates, so a gate mints one the
 * way a door does, through `authorizeRecordAccess`, as the SUPERUSER (the
 * actor these engine gates have always written as). Pure door call: writes
 * nothing.
 */

import { authorizeRecordAccess, type RecordGrant } from '../../src/core/security/write_door.ts';

const SUPERUSER = { userId: -1, isGlobalAdmin: true, isDeveloper: true } as const;

export function superuserTranslationGrant(
	sectionTipo: string,
	componentTipo: string,
	sectionId: number,
): Promise<RecordGrant> {
	return authorizeRecordAccess(
		SUPERUSER,
		{ section_tipo: sectionTipo, component_tipo: componentTipo, section_id: sectionId },
		{ mode: 'write', level: 2, sectionFloor: 1, door: 'test.translateAndWrite' },
	);
}
