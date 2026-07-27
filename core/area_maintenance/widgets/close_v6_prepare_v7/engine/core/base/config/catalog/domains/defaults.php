<?php declare(strict_types=1);

require_once __DIR__ . '/../../class.config_scope.php';
require_once __DIR__ . '/../../class.config_merge.php';
require_once __DIR__ . '/../../class.config_key.php';

return [
	new config_key(
		path:    'defaults.prefix_tipos',
		const:   'DEDALO_PREFIX_TIPOS',
		type:    'list',
		default: [
			'dd',
			'rsc',
			'ontology',
			'hierarchy',
			'lg',
			'utoponymy',
			'oh',
			'ich',
			'nexus',
			'actv',
		],
		doc: 'Active ontology prefix tipos to import and manage.',
	),
	new config_key(
		path:    'defaults.main_fallback_section',
		const:   'MAIN_FALLBACK_SECTION',
		type:    'string',
		default: 'oh1',
		doc:     'Default section tipo to go to when none is defined (after login).',
	),
	new config_key(
		path:    'defaults.numerical_matrix_value_yes',
		const:   'NUMERICAL_MATRIX_VALUE_YES',
		type:    'int',
		default: 1,
		doc:     'Numerical matrix list-of-values "yes". Do not change.',
	),
	new config_key(
		path:    'defaults.numerical_matrix_value_no',
		const:   'NUMERICAL_MATRIX_VALUE_NO',
		type:    'int',
		default: 2,
		doc:     'Numerical matrix list-of-values "no". Do not change.',
	),
	new config_key(
		path:    'defaults.max_rows_per_page',
		const:   'DEDALO_MAX_ROWS_PER_PAGE',
		type:    'int',
		default: 10,
		doc:     'Default max records per page.',
	),
	new config_key(
		path:    'defaults.profile_default',
		const:   'DEDALO_PROFILE_DEFAULT',
		type:    'int',
		default: 2,
		doc:     'Default user profile id (2 = regular user).',
	),
	new config_key(
		path:    'defaults.default_project',
		const:   'DEDALO_DEFAULT_PROJECT',
		type:    'int',
		default: 1,
		doc:     'Default section_id of target filter section.',
	),
	new config_key(
		path:    'defaults.filter_section_tipo',
		const:   'DEDALO_FILTER_SECTION_TIPO_DEFAULT',
		type:    'string',
		scope:   config_scope::DERIVED,
		derived: static fn(array $r) : string => defined('DEDALO_SECTION_PROJECTS_TIPO') ? DEDALO_SECTION_PROJECTS_TIPO : 'dd153',
		doc:     'Target filter section tipo (derived; dd153 = Projects section).',
	),
];
