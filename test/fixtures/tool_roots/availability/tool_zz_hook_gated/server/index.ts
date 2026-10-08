// Fixture for tool_availability_native.test.ts: a healthy module whose
// isAvailable hook admits exactly one section tipo.
export const tool = {
	name: 'tool_zz_hook_gated',
	apiActions: {},
	isAvailable: (context: { sectionTipo: string }) => context.sectionTipo === 'test3',
};
