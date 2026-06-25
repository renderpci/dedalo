<?php declare(strict_types=1);
/**
* CLASS RAG_SECURITY
* Centralises the RAG-specific security decisions that the review flagged as
* must-fix:
*
* 1. EGRESS (index-time AND generation-time): may a given record's text/media be
*    sent to an EXTERNAL provider? Governed per-record, not just per-section.
*    A record is treated as `restricted` (local-only) when its section is in
*    DEDALO_RAG_EXTERNAL_PROVIDER_FORBIDDEN_SECTIONS or — best-effort — when the
*    record carries a project/security restriction. Default-deny on uncertainty
*    when the global default forbids external providers.
*
* 2. ACL (retrieval): the locator/SQO hydration fast path does NOT run the
*    project filter, so retrieval MUST filter every candidate explicitly with
*    security::user_can_access_record() BEFORE any score/count leaves the server.
*    filter_accessible() is that single chokepoint.
*
* @package Dedalo
* @subpackage Rag
*/
abstract class rag_security {



	/**
	* PROVIDER_IS_EXTERNAL  true when the configured embedding provider is a 3rd party
	* @return bool
	*/
	public static function provider_is_external() : bool {

		$provider = defined('DEDALO_RAG_PROVIDER') ? DEDALO_RAG_PROVIDER : 'local_http';
		return !in_array($provider, ['local_http','local'], true);
	}//end provider_is_external



	/**
	* GET_RECORD_EGRESS_CLASS
	* 'restricted' → must never leave to an external provider; 'public' otherwise.
	* Computed from the record's own restriction independently of any logged user
	* (the drain runs without one).
	* @param string $section_tipo
	* @param int $section_id
	* @return string  public | restricted
	*/
	public static function get_record_egress_class( string $section_tipo, int $section_id ) : string {

		// section-level forbidden list (explicit hard block)
		$forbidden = defined('DEDALO_RAG_EXTERNAL_PROVIDER_FORBIDDEN_SECTIONS')
			? DEDALO_RAG_EXTERNAL_PROVIDER_FORBIDDEN_SECTIONS
			: [];
		if (is_array($forbidden) && in_array($section_tipo, $forbidden, true)) {
			return 'restricted';
		}

		// Per-record signal: only a demonstrably PUBLISHABLE record may leave the
		// host. This mirrors the image egress gate (rag_media_extractor::can_egress_image)
		// so TEXT and MEDIA egress enforce the SAME publishable-only policy. A
		// non-publishable (embargoed / project-restricted) record is 'restricted'
		// even when its section is not in the forbidden list. is_publishable() treats
		// a section without component_publication as publishable, so unrestricted
		// content is unaffected. Fail-closed (restricted) on any error.
		try {
			if (!class_exists('diffusion_utils')) {
				return 'restricted';
			}
			$locator = new stdClass();
				$locator->section_tipo	= $section_tipo;
				$locator->section_id	= $section_id;
			return (diffusion_utils::is_publishable($locator) === true)
				? 'public'
				: 'restricted';
		} catch (\Throwable $e) {
			debug_log(__METHOD__." Fail-closed (restricted) for {$section_tipo}_{$section_id}: ".$e->getMessage(), logger::ERROR);
			return 'restricted';
		}
	}//end get_record_egress_class



	/**
	* RECORD_CAN_EGRESS
	* May this record be sent to an external provider given the current config?
	* @param string $section_tipo
	* @param int $section_id
	* @return bool
	*/
	public static function record_can_egress( string $section_tipo, int $section_id ) : bool {

		// not external → always fine (local model)
		if (!self::provider_is_external()) {
			return true;
		}

		// external provider + global default forbids → only explicitly-public allowed
		$default_allow = defined('DEDALO_RAG_ALLOW_EXTERNAL_PROVIDER_DEFAULT')
			? (bool)DEDALO_RAG_ALLOW_EXTERNAL_PROVIDER_DEFAULT
			: false;

		$class = self::get_record_egress_class($section_tipo, $section_id);
		if ($class === 'restricted') {
			return false;
		}

		return $default_allow;
	}//end record_can_egress



	/**
	* FILTER_ACCESSIBLE
	* THE retrieval ACL chokepoint. Returns only the candidates the user may
	* access, checked per-record with security::user_can_access_record(). Applied
	* BEFORE any score/count is returned so vector hits cannot act as an existence
	* oracle. A null/0 user is treated as no access (returns []).
	* @param array<int,array<string,mixed>> $candidates  each carrying section_tipo, section_id
	* @param ?int $user_id = null  defaults to logged_user_id()
	* @return array<int,array<string,mixed>>
	*/
	public static function filter_accessible( array $candidates, ?int $user_id=null ) : array {

		$user_id = $user_id ?? (function_exists('logged_user_id') ? logged_user_id() : null);
		if (empty($user_id)) {
			return [];
		}

		// cache per (section_tipo, section_id) within this call to avoid repeated checks
		$decision = [];
		$out = [];
		foreach ($candidates as $c) {
			$section_tipo	= (string)($c['section_tipo'] ?? '');
			$section_id		= (int)($c['section_id'] ?? 0);
			if ($section_tipo === '' || $section_id < 1) {
				continue;
			}
			$key = $section_tipo . '|' . $section_id;
			if (!isset($decision[$key])) {
				$decision[$key] = security::user_can_access_record($section_tipo, $section_id, (int)$user_id);
			}
			if ($decision[$key] === true) {
				$out[] = $c;
			}
		}

		return $out;
	}//end filter_accessible



}//end class rag_security
