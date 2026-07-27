<?php declare(strict_types=1);

require_once __DIR__ . '/../../class.config_scope.php';
require_once __DIR__ . '/../../class.config_merge.php';
require_once __DIR__ . '/../../class.config_key.php';

return [
	new config_key(
		path:    'areas.deny',
		const:   null,
		type:    'list',
		default: ['dd137', 'rsc1', 'hierarchy20'],
		doc:     'Areas denied by default: Private list of values, Media real section, Thesaurus real section.',
	),
	new config_key(
		path:    'areas.allow',
		const:   null,
		type:    'list',
		default: [],
		doc:     'Areas explicitly allowed. Allow overrides deny always.',
	),
];
