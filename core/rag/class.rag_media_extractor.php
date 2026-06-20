<?php declare(strict_types=1);
/**
* CLASS RAG_MEDIA_EXTRACTOR
* Resolves a SAFE, downsized image for the multimodal encoder, and gates external
* egress. Security is the whole point of this class:
*
* - Reads only a downsized, NON-MASTER quality (get_default_quality(), '1.5MB'),
*   explicitly blocklisting get_original_quality()/get_modified_quality()
*   ('original'/'modified'). Masters are never read.
* - For an EXTERNAL multimodal provider, egress is gated by
*   diffusion_utils::is_publishable() — a non-publishable object is never sent to a
*   third party (the indexer falls back to local or skips). A LOCAL provider has no
*   egress concern.
* - Optionally downscales to DEDALO_RAG_IMAGE_MAX_PX via ImageMagick::convert()
*   (reuses core/media_engine) to keep encoder payloads small/fast.
*
* @package Dedalo
* @subpackage Rag
*/
abstract class rag_media_extractor {



	/**
	* CAN_EGRESS_IMAGE
	* May this record's image be sent to the configured multimodal provider?
	* Local provider → always. External → only if publishable.
	* @param string $section_tipo
	* @param int $section_id
	* @return bool
	*/
	public static function can_egress_image( string $section_tipo, int $section_id ) : bool {

		$mm = embedding_provider_multimodal::get();
		if ($mm === null) {
			return false;
		}
		if (!$mm->is_external()) {
			return true; // local model: nothing leaves the host
		}
		// external: publishable-only
		try {
			$locator = new stdClass();
				$locator->section_tipo	= $section_tipo;
				$locator->section_id	= $section_id;
			return class_exists('diffusion_utils') && diffusion_utils::is_publishable($locator) === true;
		} catch (\Throwable $e) {
			return false; // fail-closed
		}
	}//end can_egress_image



	/**
	* GET_IMAGE_FOR_EMBEDDING
	* Returns a base64 JPEG (downsized) for an image component value, plus display
	* metadata, or null when missing / a master-only / unreadable. NEVER reads the
	* original/modified masters.
	* @param string $component_tipo
	* @param int $section_id
	* @param string $section_tipo
	* @return ?array { base64, quality, thumb_url, width, height, bytes_hash }
	*/
	public static function get_image_for_embedding( string $component_tipo, int $section_id, string $section_tipo ) : ?array {

		try {
			$component = component_common::get_instance(
				'component_image', $component_tipo, $section_id, 'list', DEDALO_DATA_NOLAN, $section_tipo, false
			);
			if ($component === null || !method_exists($component, 'get_media_filepath')) {
				return null;
			}

			$quality = $component->get_default_quality(); // '1.5MB'
			// hard blocklist: never the masters
			$masters = [ $component->get_original_quality(), $component->get_modified_quality() ];
			if (in_array($quality, $masters, true)) {
				debug_log(__METHOD__ . " Refusing master quality '$quality' for $component_tipo/$section_id", logger::ERROR);
				return null;
			}

			$path = $component->get_media_filepath($quality, 'jpg');
			if (empty($path) || !is_file($path)) {
				return null;
			}

			// optional downscale for the encoder
			$max_px		= defined('DEDALO_RAG_IMAGE_MAX_PX') ? (int)DEDALO_RAG_IMAGE_MAX_PX : 512;
			$encoder_path	= self::maybe_downscale($path, $max_px);

			$bytes = @file_get_contents($encoder_path);
			if ($encoder_path !== $path) {
				@unlink($encoder_path); // temp
			}
			if ($bytes === false || $bytes === '') {
				return null;
			}

			$size = @getimagesize($path) ?: [null, null];
			$thumb_url = method_exists($component, 'get_thumb_url') ? $component->get_thumb_url() : null;

			return [
				'base64'	=> base64_encode($bytes),
				'quality'	=> $quality,
				'thumb_url'	=> $thumb_url,
				'width'		=> $size[0] ?? null,
				'height'	=> $size[1] ?? null,
				'bytes_hash'=> hash('xxh3', $bytes)
			];
		} catch (\Throwable $e) {
			debug_log(__METHOD__ . ' Error resolving image ' . $component_tipo . '/' . $section_id . ': ' . $e->getMessage(), logger::WARNING);
			return null;
		}
	}//end get_image_for_embedding



	/**
	* MAYBE_DOWNSCALE
	* Downscale to longest-side $max_px into a temp JPEG via ImageMagick; returns
	* the temp path, or the original path when downscale is unavailable/unneeded.
	* @param string $source_path
	* @param int $max_px
	* @return string
	*/
	private static function maybe_downscale( string $source_path, int $max_px ) : string {

		if ($max_px < 1 || !class_exists('ImageMagick')) {
			return $source_path;
		}
		$size = @getimagesize($source_path);
		if ($size === false) {
			return $source_path;
		}
		// already small enough
		if ((int)$size[0] <= $max_px && (int)$size[1] <= $max_px) {
			return $source_path;
		}

		$tmp = rtrim(sys_get_temp_dir(), '/') . '/rag_embed_' . hash('xxh3', $source_path . '|' . $max_px) . '.jpg';
		$opts = new stdClass();
			$opts->source_file	= $source_path;
			$opts->target_file	= $tmp;
			$opts->resize		= $max_px . 'x' . $max_px;
			$opts->quality		= 90;
		try {
			ImageMagick::convert($opts);
		} catch (\Throwable $e) {
			return $source_path;
		}
		return is_file($tmp) ? $tmp : $source_path;
	}//end maybe_downscale



}//end class rag_media_extractor
