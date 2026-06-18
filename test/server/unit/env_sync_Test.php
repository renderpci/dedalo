<?php declare(strict_types=1);

use PHPUnit\Framework\TestCase;

require_once dirname(__DIR__, 3) . '/core/base/boot/class.env_sync.php';

final class env_sync_Test extends TestCase {

	public function test_compare_reports_no_drift_when_mapped_keys_match() : void {
		$php = ['MYSQL_DEDALO_PASSWORD_CONN' => 'secret', 'DEDALO_DIFFUSION_INTERNAL_TOKEN' => 'tok'];
		$bun = ['DB_PASSWORD' => 'secret', 'DIFFUSION_INTERNAL_TOKEN' => 'tok'];
		$this->assertSame([], env_sync::compare($php, $bun));
	}

	public function test_compare_reports_drift_on_mismatch() : void {
		$php = ['MYSQL_DEDALO_PASSWORD_CONN' => 'secret'];
		$bun = ['DB_PASSWORD' => 'WRONG'];
		$drift = env_sync::compare($php, $bun);
		$this->assertCount(1, $drift);
		$this->assertSame('MYSQL_DEDALO_PASSWORD_CONN', $drift[0]['php_key']);
		$this->assertSame('DB_PASSWORD', $drift[0]['bun_key']);
	}

	public function test_compare_ignores_keys_set_on_neither_side() : void {
		$this->assertSame([], env_sync::compare([], []));
	}

	public function test_compare_flags_one_sided_value() : void {
		$drift = env_sync::compare(['DEDALO_MEDIA_PATH' => '/srv/media'], []);
		$this->assertCount(1, $drift);
		$this->assertNull($drift[0]['bun_val']);
	}

	public function test_compare_treats_empty_string_as_unset_on_php_side() : void {
		// KEY= parses to '' on the PHP side, absent on the Bun side → not drift
		$this->assertSame([], env_sync::compare(['DEDALO_MEDIA_PATH' => ''], []));
	}

	public function test_compare_treats_empty_string_as_unset_on_bun_side() : void {
		// absent on PHP side, KEY= parses to '' on Bun side → not drift
		$this->assertSame([], env_sync::compare([], ['DEDALO_MEDIA_PATH' => '']));
	}

	public function test_compare_flags_empty_vs_nonempty_as_drift() : void {
		// empty on PHP side, configured on Bun side -> drift
		$this->assertCount(1, env_sync::compare(['DEDALO_MEDIA_PATH' => ''], ['DEDALO_MEDIA_PATH' => '/srv/x']));
		// configured on PHP side, empty on Bun side -> drift
		$this->assertCount(1, env_sync::compare(['DEDALO_MEDIA_PATH' => '/srv/x'], ['DEDALO_MEDIA_PATH' => '']));
	}
}
