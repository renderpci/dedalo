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
}
