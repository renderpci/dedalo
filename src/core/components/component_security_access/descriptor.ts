/**
 * component_security_access — per-record security/ACL matrix editor (PHP
 * core/component_security_access). Stores its data in the shared `misc` column.
 * Not class-translatable.
 */
import type { ComponentModel } from '../types.ts';

export const component_security_access: ComponentModel = {
	model: 'component_security_access',
	column: 'misc',
	emitHook: 'security_access',
	sortable: false, // PHP component_security_access::get_sortable() → false
};
