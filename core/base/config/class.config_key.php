<?php declare(strict_types=1);

/**
* CONFIG_KEY
* One catalog entry — the single declaration of a configuration setting.
* Everything (value, legacy constant, compilation, the shim, docs) derives
* from these fields.
*/
final class config_key {

	public function __construct(
		public readonly string       $path,                              // 'media.image.thumb_width'
		public readonly ?string      $const,                             // 'DEDALO_IMAGE_THUMB_WIDTH' | null
		public readonly string       $type,                              // 'int'|'bool'|'string'|'list'|'map'
		public readonly mixed        $default = null,
		public readonly config_scope $scope   = config_scope::STATIC,
		public readonly config_merge $merge   = config_merge::REPLACE,
		public readonly ?\Closure    $derived = null,                    // fn(array $resolved): mixed (DERIVED only)
		public readonly string       $doc     = '',
	) {}
}
