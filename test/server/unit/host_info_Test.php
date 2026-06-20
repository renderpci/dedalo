<?php declare(strict_types=1);

use PHPUnit\Framework\TestCase;

require_once dirname(__DIR__, 3) . '/core/base/class.host_info.php';

/**
* HOST_INFO_TEST
* Dependency-free cross-platform host probe replacing the LinFo library.
* Pure parsers are tested against captured fixture strings; thin OS readers
* get light smoke tests guarded by os_family().
*/
final class host_info_Test extends TestCase {

	public function test_os_family_matches_current_host() : void {
		$expected = match (PHP_OS_FAMILY) {
			'Linux'  => 'linux',
			'Darwin' => 'darwin',
			default  => 'other',
		};
		$this->assertSame($expected, host_info::os_family());
	}

	public function test_php_uname_getters_are_non_empty_strings() : void {
		$this->assertNotSame('', host_info::get_os());
		$this->assertNotSame('', host_info::get_kernel());
		$this->assertNotSame('', host_info::get_cpu_architecture());
		$this->assertNotSame('', host_info::get_hostname());
	}
}
