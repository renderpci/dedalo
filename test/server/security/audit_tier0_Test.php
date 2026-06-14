<?php declare(strict_types=1);
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';

/**
* AUDIT_TIER0_TEST
* Regression tests for the 2026-06-13 audit Tier-0 fixes:
*  - safe_upload_target() path-traversal confinement (API-01/02, TOOLS-01/02/03/05)
*  - dd_manager::sanitize_client_rqo() server-only SQO scrub shared by the HTTP
*    and worker SSE entry points (WORKER-01)
*/
final class audit_tier0_test extends BaseTestCase {



	/**
	* TEST_SAFE_UPLOAD_TARGET_CONFINES_TRAVERSAL
	* A client name containing '../' must be reduced to its basename and confined
	* under the base dir — never resolving outside it.
	* @return void
	*/
	public function test_safe_upload_target_confines_traversal() : void {

		// note: compare against the base as passed (the helper returns a path under
		// the given base_dir; its realpath confinement check is internal). Avoid
		// realpath() in the assertion because /var -> /private/var on macOS.
		$base = rtrim(sys_get_temp_dir(), '/') . '/dedalo_audit_tier0_' . getmypid();
		@mkdir($base, 0750, true);

		// traversal attempt: reduced to basename and kept under $base
		$target = safe_upload_target($base, '../../../etc/passwd', false);
		$this->assertTrue(
			str_starts_with($target, $base . '/'),
			'traversal name must stay confined under the base dir'
		);
		$this->assertSame(
			$base . '/passwd',
			$target,
			'traversal name must reduce to its basename'
		);

		// plain name passes through unchanged (sanitize=false)
		$this->assertSame(
			$base . '/photo.jpg',
			safe_upload_target($base, 'photo.jpg', false),
			'a plain file name must resolve directly under the base dir'
		);

		@rmdir($base);
	}//end test_safe_upload_target_confines_traversal



	/**
	* TEST_SAFE_UPLOAD_TARGET_REJECTS_DOTDOT
	* A name that is exactly '..' (or empty) cannot resolve to a child file and
	* must be rejected outright rather than silently escaping.
	* @return void
	*/
	public function test_safe_upload_target_rejects_dotdot() : void {

		$base = sys_get_temp_dir() . '/dedalo_audit_tier0_dd_' . getmypid();
		@mkdir($base, 0750, true);

		$threw = false;
		try {
			safe_upload_target($base, '..', false);
		} catch (\Throwable $e) {
			$threw = true;
		}
		$this->assertTrue($threw, "'..' must be rejected");

		$threw_empty = false;
		try {
			safe_upload_target($base, '', false);
		} catch (\Throwable $e) {
			$threw_empty = true;
		}
		$this->assertTrue($threw_empty, 'empty name must be rejected');

		@rmdir($base);
	}//end test_safe_upload_target_rejects_dotdot



	/**
	* TEST_SANITIZE_CLIENT_RQO_STRIPS_SERVER_ONLY
	* The shared entry-point gate must strip server-only SQO fields (sentence,
	* skip_projects_filter) from both rqo->sqo and rqo->options->sqo, force
	* parsed=false and clamp the limit — so the worker SSE path cannot smuggle
	* raw SQL or disable the per-user projects filter.
	* @return void
	*/
	public function test_sanitize_client_rqo_strips_server_only() : void {

		$rqo = new stdClass();
		$rqo->sqo = (object)[
			'sentence'				=> 'DROP TABLE matrix',
			'skip_projects_filter'	=> true,
			'parsed'				=> true,
			'limit'					=> 'all'
		];
		$rqo->options = new stdClass();
		$rqo->options->sqo = (object)[
			'sentence' => 'SELECT 1'
		];

		dd_manager::sanitize_client_rqo($rqo);

		$this->assertFalse(
			property_exists($rqo->sqo, 'sentence'),
			'client sqo->sentence must be stripped'
		);
		$this->assertFalse(
			property_exists($rqo->sqo, 'skip_projects_filter'),
			'client sqo->skip_projects_filter must be stripped'
		);
		$this->assertFalse(
			$rqo->sqo->parsed,
			'client sqo->parsed must be forced false'
		);
		$this->assertNotSame(
			'all',
			$rqo->sqo->limit,
			'client sqo->limit "all" must be clamped'
		);
		$this->assertFalse(
			property_exists($rqo->options->sqo, 'sentence'),
			'options->sqo->sentence must be stripped too'
		);
	}//end test_sanitize_client_rqo_strips_server_only



}//end class audit_tier0_test
