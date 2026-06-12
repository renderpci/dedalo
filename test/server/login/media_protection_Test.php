<?php declare(strict_types=1);
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';

/**
* MEDIA_PROTECTION_TEST
* Media file access control: generated .htaccess content (both modes),
* public quality validation, auth marker sync/rotation and config-hash
* idempotence of write_htaccess(). All filesystem activity is redirected
* to a temp dir via media_protection::$media_path_override — the real
* media directory is never touched.
*/
final class media_protection_Test extends BaseTestCase {

	private string $tmp_media_path;



	protected function setUp(): void {
		parent::setUp();
		$this->tmp_media_path = sys_get_temp_dir() . '/dd_media_protection_' . bin2hex(random_bytes(6));
		mkdir($this->tmp_media_path, 0755, true);
		media_protection::$media_path_override = $this->tmp_media_path;
	}

	protected function tearDown(): void {
		media_protection::$media_path_override = null;
		exec('rm -rf ' . escapeshellarg($this->tmp_media_path));
		parent::tearDown();
	}



	/**
	* TEST_GET_PUBLIC_QUALITIES_VALIDATION
	* Defaults never expose master folders; explicit traversal/master
	* entries would be refused by the same filter.
	*/
	public function test_get_public_qualities_validation(): void {

		$qualities = media_protection::get_public_qualities();

		$this->assertNotEmpty($qualities);
		foreach ($qualities as $quality) {
			$this->assertStringNotContainsString('original', $quality);
			$this->assertStringNotContainsString('modified', $quality);
			$this->assertStringNotContainsString('..', $quality);
			$this->assertStringStartsNotWith('/', $quality);
			$this->assertMatchesRegularExpression('/^[A-Za-z0-9_.\/-]+$/', $quality);
		}

		// web delivery defaults derived from the install constants
		$this->assertContains(trim(DEDALO_AV_FOLDER, '/') . '/' . DEDALO_AV_QUALITY_DEFAULT, $qualities);
		$this->assertContains(trim(DEDALO_IMAGE_FOLDER, '/') . '/' . DEDALO_IMAGE_QUALITY_DEFAULT, $qualities);
	}//end test_get_public_qualities_validation



	/**
	* TEST_BUILD_HTACCESS_PRIVATE_MODE
	*/
	public function test_build_htaccess_private_mode(): void {

		$htaccess = media_protection::build_htaccess('private');

		// SEC-088 hardening present (the legacy generator clobbered it)
		$this->assertStringContainsString('SetHandler none', $htaccess);
		$this->assertStringContainsString('Require all denied', $htaccess);
		$this->assertStringContainsString('Options -Indexes -ExecCGI', $htaccess);

		// marker store never served
		$this->assertStringContainsString('RewriteRule (^|/)\.publication(/|$) - [R=404,L]', $htaccess);

		// rule A: fixed cookie name + auth marker stat
		$this->assertStringContainsString(media_protection::COOKIE_NAME . '=([a-f0-9]{128})', $htaccess);
		$this->assertStringContainsString('/.publication/auth/%1" -f', $htaccess);

		// private mode has NO rule B
		$this->assertStringNotContainsString('/.publication/pub/', $htaccess);

		// default deny closes the file
		$this->assertStringContainsString('RewriteRule ^ - [R=404,L]', $htaccess);

		// legacy realm auth is gone
		$this->assertStringNotContainsString('AuthType Basic', $htaccess);
		$this->assertStringNotContainsString('RequireAny', $htaccess);
	}//end test_build_htaccess_private_mode



	/**
	* TEST_BUILD_HTACCESS_PUBLICATION_MODE
	*/
	public function test_build_htaccess_publication_mode(): void {

		$qualities	= ['av/404', 'image/1.5MB'];
		$addons		= ['# custom addon line'];
		$htaccess	= media_protection::build_htaccess('publication', $qualities, $addons);

		// rule B: quality alternation with escaped dots + pub marker stat
		$this->assertStringContainsString('av\/404|image\/1\.5MB', $htaccess);
		$this->assertStringContainsString('/.publication/pub/$1_$2" -f', $htaccess);

		// the filename grammar pins the LAST two tokens (section_tipo, section_id)
		$this->assertStringContainsString('[^/]*_([a-z0-9]+)_([0-9]+)(?:_lg-[a-zA-Z0-9-]{2,12})?', $htaccess);

		// addons land before the final deny
		$addon_pos	= strpos($htaccess, '# custom addon line');
		$deny_pos	= strpos($htaccess, '# 3. Default deny');
		$this->assertNotFalse($addon_pos);
		$this->assertNotFalse($deny_pos);
		$this->assertLessThan($deny_pos, $addon_pos);

		// embedded config-hash matches the generator
		$hash = media_protection::get_config_hash('publication', $qualities, $addons);
		$this->assertStringContainsString('# config-hash: ' . $hash, $htaccess);
	}//end test_build_htaccess_publication_mode



	/**
	* TEST_SYNC_AUTH_MARKERS_ROTATION
	* Exactly the provided values survive; invalid values are refused.
	*/
	public function test_sync_auth_markers_rotation(): void {

		$auth_dir	= media_protection::get_base_path() . '/auth';
		$today		= hash('sha512', 'today' . random_bytes(8));
		$yesterday	= hash('sha512', 'yesterday' . random_bytes(8));
		$stale		= hash('sha512', 'stale' . random_bytes(8));

		// initial sync creates both markers
		$this->assertTrue(media_protection::sync_auth_markers([$today, $yesterday]));
		$this->assertFileExists($auth_dir . '/' . $today);
		$this->assertFileExists($auth_dir . '/' . $yesterday);

		// next-day rotation: stale value is removed, idempotent for the rest
		$this->assertTrue(media_protection::sync_auth_markers([$today, $stale]));
		$this->assertFileExists($auth_dir . '/' . $today);
		$this->assertFileExists($auth_dir . '/' . $stale);
		$this->assertFileDoesNotExist($auth_dir . '/' . $yesterday);

		// non-sha512 values never become marker files (path traversal guard)
		$this->assertTrue(media_protection::sync_auth_markers([$today, '../evil', 'short']));
		$this->assertFileExists($auth_dir . '/' . $today);
		$this->assertFileDoesNotExist($auth_dir . '/' . $stale);
		$this->assertSame(1, count(glob($auth_dir . '/*')));
	}//end test_sync_auth_markers_rotation



	/**
	* TEST_WRITE_HTACCESS_IDEMPOTENCE
	* write_htaccess writes once and is a no-op while the configuration
	* hash is unchanged; a config change (different hash) rewrites.
	*/
	public function test_write_htaccess_idempotence(): void {

		if (media_protection::get_mode()===false) {
			$this->markTestSkipped('Media access mode is disabled in this install config (DEDALO_MEDIA_ACCESS_MODE / DEDALO_PROTECT_MEDIA_FILES)');
		}

		$htaccess_file = $this->tmp_media_path . '/.htaccess';

		$this->assertTrue(media_protection::write_htaccess());
		$this->assertFileExists($htaccess_file);
		$first_mtime	= filemtime($htaccess_file);
		$first_content	= file_get_contents($htaccess_file);

		// unchanged config: file is not rewritten
		clearstatcache();
		sleep(1);
		$this->assertTrue(media_protection::write_htaccess());
		clearstatcache();
		$this->assertSame($first_mtime, filemtime($htaccess_file));

		// stale hash (e.g. config changed): file is regenerated
		file_put_contents($htaccess_file, str_replace('# config-hash: ', '# config-hash: stale', (string)$first_content));
		$this->assertTrue(media_protection::write_htaccess());
		$this->assertSame($first_content, file_get_contents($htaccess_file));
	}//end test_write_htaccess_idempotence



	/**
	* TEST_GET_MODE_BC
	* The mode resolver maps the legacy boolean when the new constant is
	* absent; with the new constant defined, it always wins.
	*/
	public function test_get_mode_bc(): void {

		$mode = media_protection::get_mode();

		if (defined('DEDALO_MEDIA_ACCESS_MODE')) {
			$expected = in_array(DEDALO_MEDIA_ACCESS_MODE, ['private','publication'], true)
				? DEDALO_MEDIA_ACCESS_MODE
				: false;
			$this->assertSame($expected, $mode);
		} else {
			$expected = (defined('DEDALO_PROTECT_MEDIA_FILES') && DEDALO_PROTECT_MEDIA_FILES===true)
				? 'private'
				: false;
			$this->assertSame($expected, $mode);
		}
	}//end test_get_mode_bc
}//end class media_protection_Test
