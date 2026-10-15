// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global page_globals */
/*eslint no-undef: "error"*/

/**
 * OWNED TARGET
 * The record an element's saved locator points at, BUILT by the suite that
 * saves it — created through the engine's own create door, swept after.
 *
 * WHY. The component sweeps (test_components_data_changes into test3/10,
 * test_components_activate into test3/1) save each element's generated value
 * into a SHARED test3 record. For component_relation_parent (test71) that value
 * is a PARENT LINK, and a parent link is read back from the other side: the
 * children of test3/<n> are the records whose test71 points at it. The old
 * generator (data.js random_locator) drew test3/<1..50> — an id that, on a
 * freshly built suite database (a low test3 counter), a record created later
 * in the run can be born at. test_component_relation_children
 * creates a fresh parent and asserts it has no children; it found the sweep
 * record already linked ('a fresh record has no children: expected [ 10 ] to
 * deeply equal []', GitHub run 38650819505) and the next two cases inherited it.
 *
 * An id the test does not own is never a safe target, whatever its range (test
 * isolation is the database, not an id band). So the element declares
 * `owned_target: <section_tipo>` and the suite:
 *   setup()    — snapshots the host record's current value of the element,
 *                creates the target record, returns its section_id (the
 *                element's new_value receives it as its second argument);
 *   teardown() — restores the host's snapshot FIRST (so no link outlives its
 *                target, not even for the length of a request), then deletes
 *                the target record, and verifies the host reads back as before.
 * The counter never re-issues a deleted id, so the swept target can never be
 * "a fresh record" later in the run.
 */

import { request_failed, response_data } from '../../../core/common/js/api_error.js';
import { data_manager } from '../../../core/common/js/data_manager.js';
import { get_instance } from '../../../core/common/js/instances.js';

const api = async (body) => {
	const api_response = await data_manager.request({ body });
	if (request_failed(api_response)) {
		throw new Error(`owned_target: ${body.action} refused: ${api_response.error.code}`);
	}
	return response_data(api_response);
};

const section_source = (section_tipo, section_id = null) => ({
	typo: 'source',
	type: 'section',
	model: 'section',
	tipo: section_tipo,
	section_tipo: section_tipo,
	section_id: section_id,
	mode: 'edit',
	lang: page_globals?.dedalo_data_lang ?? 'lg-eng',
});

// the element's component on the host record, built fresh (never a cached instance)
const host_instance = async (element, host_section_id) => {
	const instance = await get_instance({
		id_variant: `owned_target_${Math.random()}`,
		lang: element.lang,
		mode: 'edit',
		model: element.model,
		section_id: host_section_id,
		section_tipo: element.section_tipo,
		tipo: element.tipo,
		view: 'default',
	});
	await instance.build(true);
	return instance;
};

// the stored value, without the read-only decoration a portal-family read adds
const stored_entries = (instance) =>
	(instance.data?.entries || []).map(({ paginated_key: _read_only, ...stored }) => stored);

// section_id under the locator law (server compareLocators/sectionIdLooselyEquals):
// numeric spellings compare as numbers — the engine canonicalises a saved
// locator's "2" to 2 (WC-2026-08-10), so a restored legacy row is the same value
const section_id_equals = (a, b) => {
	if (a === b) return true;
	const string_a = String(a).trim();
	const string_b = String(b).trim();
	const number_a = Number(string_a);
	const number_b = Number(string_b);
	if (
		string_a !== '' &&
		string_b !== '' &&
		Number.isFinite(number_a) &&
		Number.isFinite(number_b)
	) {
		return number_a === number_b;
	}
	return String(a) === String(b);
};

// two stored values are the same value: same order, same keys, every property
// strictly equal except section_id (loose, as above)
const same_entries = (left, right) =>
	left.length === right.length &&
	left.every((entry, index) => {
		const other = right[index];
		if (
			entry === null ||
			other === null ||
			typeof entry !== 'object' ||
			typeof other !== 'object'
		) {
			return entry === other;
		}
		const keys = new Set([...Object.keys(entry), ...Object.keys(other)]);
		for (const key of keys) {
			if (!(key in entry) || !(key in other)) return false;
			if (key === 'section_id') {
				if (!section_id_equals(entry[key], other[key])) return false;
			} else if (JSON.stringify(entry[key]) !== JSON.stringify(other[key])) {
				return false;
			}
		}
		return true;
	});

/**
 * OWNED_TARGET
 * @param {object} element - an elements.js entry declaring `owned_target`
 * @param {number} host_section_id - the record the suite saves the element into
 * @return {object} {setup, teardown}
 */
export const owned_target = (element, host_section_id) => {
	const target_section_tipo = element.owned_target;
	if (typeof target_section_tipo !== 'string' || target_section_tipo.length === 0) {
		throw new Error(`owned_target: ${element.model} (${element.tipo}) declares no target section`);
	}

	let snapshot = null;
	let target_id = null;

	const setup = async () => {
		const instance = await host_instance(element, host_section_id);
		snapshot = stored_entries(instance);
		await instance.destroy(true, true, true);

		target_id = Number(
			await api({ action: 'create', source: section_source(target_section_tipo) }),
		);
		if (!Number.isInteger(target_id) || target_id < 1) {
			throw new Error(`owned_target: create returned no section_id for ${target_section_tipo}`);
		}
		return target_id;
	};

	const teardown = async () => {
		// 1. the host first: no link may outlive its target
		if (snapshot !== null) {
			const instance = await host_instance(element, host_section_id);
			await instance.change_value({
				changed_data: [Object.freeze({ action: 'set_data', value: snapshot })],
				refresh: false,
			});
			await instance.destroy(true, true, true);
		}
		// 2. then the target
		if (target_id !== null) {
			await api({
				action: 'delete',
				source: Object.assign(section_source(target_section_tipo, target_id), {
					delete_mode: 'delete_record',
				}),
			});
		}
		// 3. the host reads back as it was before the suite touched it
		if (snapshot !== null) {
			const check = await host_instance(element, host_section_id);
			const restored = stored_entries(check);
			await check.destroy(true, true, true);
			if (!same_entries(restored, snapshot)) {
				throw new Error(
					`owned_target: ${element.section_tipo}/${host_section_id} ${element.tipo} was not restored: ${JSON.stringify(restored)} != ${JSON.stringify(snapshot)}`,
				);
			}
		}
		snapshot = null;
		target_id = null;
	};

	return { setup, teardown };
}; //end owned_target

// @license-end
