<?php declare(strict_types=1);

require_once __DIR__ . '/../../class.config_scope.php';
require_once __DIR__ . '/../../class.config_merge.php';
require_once __DIR__ . '/../../class.config_key.php';

return [
	new config_key(
		path:    'lang.structure_lang',
		const:   'DEDALO_STRUCTURE_LANG',
		type:    'string',
		default: 'lg-spa',
		doc:     'Ontology structure lang. Only lg-spa is accepted.',
	),
	new config_key(
		path:    'lang.application_langs',
		const:   'DEDALO_APPLICATION_LANGS',
		type:    'map',
		default: [
			'lg-eng' => 'English',
			'lg-spa' => 'Castellano',
			'lg-cat' => 'Català',
			'lg-eus' => 'Euskara',
			'lg-fra' => 'Français',
			'lg-por' => 'Português',
			'lg-deu' => 'Deutsch',
			'lg-ita' => 'Italiano',
			'lg-ell' => 'Ελληνικά',
			'lg-nep' => 'नेपाली',
		],
		doc: 'Map of available application langs (lg-* => label).',
	),
	new config_key(
		path:    'lang.application_langs_default',
		const:   'DEDALO_APPLICATION_LANGS_DEFAULT',
		type:    'string',
		default: 'lg-eng',
		doc:     'Default application lang when none is set.',
	),
	new config_key(
		path:  'lang.application_lang',
		const: 'DEDALO_APPLICATION_LANG',
		type:  'string',
		scope: config_scope::REQUEST,
		doc:   'Current application lang (per-request; no compiled default).',
	),
	new config_key(
		path:    'lang.data_lang_default',
		const:   'DEDALO_DATA_LANG_DEFAULT',
		type:    'string',
		default: 'lg-eng',
		doc:     'Default data lang.',
	),
	new config_key(
		path:  'lang.data_lang',
		const: 'DEDALO_DATA_LANG',
		type:  'string',
		scope: config_scope::REQUEST,
		doc:   'Current data lang (per-request; no compiled default).',
	),
	new config_key(
		path:    'lang.data_lang_selector',
		const:   'DEDALO_DATA_LANG_SELECTOR',
		type:    'bool',
		default: true,
		doc:     'Show/hide data lang selector menu.',
	),
	new config_key(
		path:    'lang.data_lang_sync',
		const:   'DEDALO_DATA_LANG_SYNC',
		type:    'bool',
		default: false,
		doc:     'Keep application lang and data lang synchronised.',
	),
	new config_key(
		path:    'lang.data_nolan',
		const:   'DEDALO_DATA_NOLAN',
		type:    'string',
		default: 'lg-nolan',
		doc:     'No-language sentinel value. Do not change.',
	),
	new config_key(
		path:    'lang.projects_default_langs',
		const:   'DEDALO_PROJECTS_DEFAULT_LANGS',
		type:    'list',
		default: [
			'lg-spa',
			'lg-cat',
			'lg-eng',
			'lg-fra',
		],
		doc: 'Default langs for projects.',
	),
	new config_key(
		path:    'lang.diffusion_langs',
		const:   'DEDALO_DIFFUSION_LANGS',
		type:    'list',
		scope:   config_scope::DERIVED,
		derived: static fn(array $r) : array => $r['lang.projects_default_langs'],
		doc:     'Diffusion langs (derived from projects_default_langs by default).',
	),
];
