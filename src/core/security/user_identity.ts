/**
 * USER IDENTITY — the display name behind a user id.
 *
 * Extracted from `area_maintenance/user_stats.ts`, which owned the only copy,
 * when a SECOND caller appeared: the record-scoped job listing has to say WHOSE
 * transcode is holding a tier, or an operator whose build button is disabled
 * has no way to learn why. A private copy in `core/api/` would have been a
 * second source of truth for "what is this user called".
 *
 * `dd132` is the users section's name component (USERS_SECTION dd128).
 */

/** The users section (PHP DEDALO_SECTION_USERS_TIPO). */
export const USERS_SECTION = 'dd128';

/** The users section's name component. */
const USER_NAME_COMPONENT = 'dd132';

/**
 * The user's display name, or null when the record or the component has none.
 *
 * Null is a real answer, not a failure: a user record whose name component was
 * never filled has no name to show, and callers render the id or nothing rather
 * than inventing a label.
 */
export async function resolveUserName(
	userId: string | number,
	lang: string,
): Promise<string | null> {
	const { readMatrixRecord } = await import('../db/matrix.ts');
	const record = await readMatrixRecord('matrix_users', USERS_SECTION, Number(userId));
	if (record === null) return null;
	const { resolveComponentValue } = await import('../resolve/component_data.ts');
	const { getModelByTipo } = await import('../ontology/resolver.ts');
	const model = (await getModelByTipo(USER_NAME_COMPONENT)) ?? 'component_input_text';
	const { value, fallbackValue } = await resolveComponentValue(
		record,
		USER_NAME_COMPONENT,
		model,
		lang,
	);
	const first = (value ?? fallbackValue)?.[0] as { value?: unknown } | undefined;
	return typeof first?.value === 'string' ? first.value : null;
}
