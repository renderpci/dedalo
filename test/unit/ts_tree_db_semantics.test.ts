/**
 * Tree subsystem — DB-backed subtle-semantics tests (live dedalo_mib_v7).
 *
 * Fixture: the `tchi1` thesaurus hierarchy (a real installed tree). Node 602
 * ("Tarragona") is a descriptor with parent 620 whose parent is 1001. These
 * assertions pin the semantics a differential would otherwise be the only guard
 * for: string section_id wire keys, homogeneous-children ordering, count null≠0,
 * first-locator conventions, root button perms, and the diamond/cycle-safe
 * ancestor walk.
 */

import { describe, expect, it } from 'bun:test';
import {
	countChildren,
	countChildrenOrNull,
	getChildren,
	getChildrenTipo,
} from '../../src/core/relations/children.ts';
import { getChildrenOfType, getParentsRecursive } from '../../src/core/relations/parent.ts';
import type { Principal } from '../../src/core/security/permissions.ts';
import { getNodeData } from '../../src/core/ts_object/ts_api.ts';
import {
	buildNodeData,
	getPermissionsElement,
	isIndexable,
} from '../../src/core/ts_object/ts_object.ts';

const SUPERUSER: Principal = { userId: -1, isGlobalAdmin: true, isDeveloper: true };

describe('getChildren — string section_id wire keys + homogeneous children', () => {
	it('returns child locators with STRING section_id and the dd48 children shape', async () => {
		const children = await getChildren(620, 'tchi1');
		expect(children.length).toBeGreaterThan(0);
		const first = children[0];
		// PHP locator::set_section_id casts to string — the wire shape.
		expect(typeof first?.section_id).toBe('string');
		expect(first?.type).toBe('dd48');
		expect(first?.from_component_tipo).toBe('tchi40');
		expect(first?.section_tipo).toBe('tchi1');
	});
});

describe('count null≠0 (PHP count_children null contract)', () => {
	it('countChildrenOrNull → null when the section has no children component; countChildren → 0', async () => {
		// dd64 (si/no) is a plain list section with no component_relation_children.
		expect(await getChildrenTipo('dd64')).toBeNull();
		expect(await countChildrenOrNull(1, 'dd64')).toBeNull();
		expect(await countChildren(1, 'dd64')).toBe(0);
	});
	it('a real hierarchy node returns an authoritative integer count', async () => {
		const total = await countChildrenOrNull(620, 'tchi1');
		expect(total).not.toBeNull();
		expect(total).toBeGreaterThan(0);
	});
});

describe('diamond/cycle-safe ancestor walk (getParentsRecursive)', () => {
	it('walks the full parent chain top-down without looping', async () => {
		const { ancestors, errors } = await getParentsRecursive(602, 'tchi1');
		const keys = ancestors.map((a) => `${a.section_tipo}_${a.section_id}`);
		expect(keys).toContain('tchi1_620');
		expect(keys).toContain('tchi1_1001');
		expect(errors).toHaveLength(0);
	});
});

describe('is_indexable — roots always false', () => {
	it('hierarchy/ontology root sections are never indexable', async () => {
		expect(await isIndexable('hierarchy1', 1)).toBe(false);
		expect(await isIndexable('ontology35', 1)).toBe(false);
	});
});

describe('root button perms (PHP get_permissions_element)', () => {
	it('hierarchy1 delete is hardcoded 0; hierarchy1/hierarchy20 new resolve via their fixed tipos', async () => {
		// button_delete on the hierarchy root is ALWAYS 0.
		expect(await getPermissionsElement('hierarchy1', 'button_delete', SUPERUSER)).toBe(0);
		// button_new on hierarchy1 → hierarchy11; superuser resolves to level 3.
		expect(await getPermissionsElement('hierarchy1', 'button_new', SUPERUSER)).toBe(3);
		// thesaurus template section uses hierarchy38/hierarchy39 → superuser level 3.
		expect(await getPermissionsElement('hierarchy20', 'button_new', SUPERUSER)).toBe(3);
		expect(await getPermissionsElement('hierarchy20', 'button_delete', SUPERUSER)).toBe(3);
	});
});

describe('buildNodeData — descriptor node with term + link_children', () => {
	it('produces the term string, is_descriptor, children_tipo and a link_children element', async () => {
		const node = await buildNodeData('tchi1', 602, {}, 'root', SUPERUSER);
		expect(node.ts_id).toBe('tchi1_602');
		expect(node.ts_parent).toBe('root');
		expect(node.is_descriptor).toBe(true);
		expect(node.children_tipo).toBe('tchi40');
		const term = node.ar_elements.find((element) => element.type === 'term');
		expect(typeof term?.value).toBe('string');
		expect((term?.value as string).length).toBeGreaterThan(0);
		const link = node.ar_elements.find((element) => element.type === 'link_children');
		expect(link).toBeDefined();
		expect(node.has_descriptor_children).toBe(true);
	});
});

describe('getChildrenOfType — descriptor filter', () => {
	it('returns the descriptor children of a parent', async () => {
		const descriptors = await getChildrenOfType(620, 'tchi1', 'descriptor');
		expect(descriptors.length).toBeGreaterThan(0);
	});
});

describe('dd_ts_api.get_node_data envelope', () => {
	it('returns the single node as result with the VERBATIM success msg', async () => {
		const response = await getNodeData(
			{
				dd_api: 'dd_ts_api',
				action: 'get_node_data',
				source: { section_tipo: 'tchi1', section_id: 602 },
			},
			SUPERUSER,
		);
		expect(response.msg).toBe('OK. get_node_data request done successfully');
		expect(response.errors).toHaveLength(0);
		expect((response.result as { ts_id?: string } | null)?.ts_id).toBe('tchi1_602');
	});
});
