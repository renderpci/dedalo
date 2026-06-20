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

	private function fixture(string $name) : string {
		return file_get_contents(__DIR__ . '/fixtures/host_info/' . $name);
	}

	public function test_parse_meminfo_returns_bytes() : void {
		$raw = $this->fixture('meminfo.txt');
		// 16384256 kB * 1024 = 16777478144 bytes
		$this->assertSame(16384256 * 1024, host_info::parse_meminfo($raw));
	}

	public function test_parse_meminfo_returns_null_when_absent() : void {
		$this->assertNull(host_info::parse_meminfo("Foo: 1 kB\nBar: 2 kB\n"));
	}

	public function test_parse_sysctl_int_reads_positive_integer() : void {
		$this->assertSame(17179869184, host_info::parse_sysctl_int($this->fixture('sysctl_memsize.txt')));
	}

	public function test_parse_sysctl_int_rejects_non_numeric_and_zero() : void {
		$this->assertNull(host_info::parse_sysctl_int(''));
		$this->assertNull(host_info::parse_sysctl_int("\n"));
		$this->assertNull(host_info::parse_sysctl_int('0'));
		$this->assertNull(host_info::parse_sysctl_int('not-a-number'));
	}

	public function test_get_ram_bytes_is_positive_on_first_class_platform() : void {
		if (host_info::os_family() === 'other') {
			$this->markTestSkipped('Not a first-class platform');
		}
		$this->assertGreaterThan(0, host_info::get_ram_bytes());
	}

	public function test_get_ram_returns_total_array() : void {
		$ram = host_info::get_ram();
		$this->assertArrayHasKey('total', $ram);
		$this->assertArrayHasKey('type', $ram);
	}

	public function test_parse_cpuinfo_mhz_returns_peak_rounded() : void {
		// max(2592.001, 3600.250) = 3600.250 -> 3600
		$this->assertSame(3600, host_info::parse_cpuinfo_mhz($this->fixture('cpuinfo.txt')));
	}

	public function test_parse_cpuinfo_mhz_returns_null_when_absent() : void {
		$this->assertNull(host_info::parse_cpuinfo_mhz("processor\t: 0\nmodel name\t: X\n"));
	}

	public function test_get_cpu_mhz_is_null_or_positive() : void {
		$mhz = host_info::get_cpu_mhz();
		// Apple Silicon returns null cleanly; Intel/Linux return a positive int.
		$this->assertTrue($mhz === null || $mhz > 0);
	}

	public function test_parse_cpuinfo_model_returns_first_model_name() : void {
		$this->assertSame(
			'Intel(R) Core(TM) i7-9750H CPU @ 2.60GHz',
			host_info::parse_cpuinfo_model($this->fixture('cpuinfo.txt'))
		);
	}

	public function test_parse_cpuinfo_model_returns_null_when_absent() : void {
		$this->assertNull(host_info::parse_cpuinfo_model("processor\t: 0\ncpu MHz\t: 1\n"));
	}

	public function test_get_cpu_is_string_or_null() : void {
		$cpu = host_info::get_cpu();
		$this->assertTrue($cpu === null || is_string($cpu));
	}

	public function test_get_model_is_string_or_null() : void {
		$model = host_info::get_model();
		$this->assertTrue($model === null || is_string($model));
	}

	public function test_parse_os_release_returns_pretty_name_unquoted() : void {
		$this->assertSame('Ubuntu 22.04.4 LTS', host_info::parse_os_release($this->fixture('os_release.txt')));
	}

	public function test_parse_os_release_returns_null_when_absent() : void {
		$this->assertNull(host_info::parse_os_release("ID=foo\nNAME=\"Foo\"\n"));
	}

	public function test_get_distro_is_string_or_null() : void {
		$distro = host_info::get_distro();
		$this->assertTrue($distro === null || is_string($distro));
	}

	public function test_parse_proc_uptime_reads_whole_seconds() : void {
		// 350005.12 -> 350005
		$this->assertSame(350005, host_info::parse_proc_uptime('350005.12 1234567.00'));
	}

	public function test_parse_proc_uptime_returns_null_when_unparseable() : void {
		$this->assertNull(host_info::parse_proc_uptime('not-a-number'));
	}

	public function test_format_uptime_renders_days_hours_minutes() : void {
		// 3 days, 4 hours, 5 minutes = 3*86400 + 4*3600 + 5*60 = 274260 + ... compute:
		$seconds = (3 * 86400) + (4 * 3600) + (5 * 60); // 274500
		$this->assertSame('3 days, 4 hours, 5 minutes', host_info::format_uptime($seconds));
	}

	public function test_get_uptime_is_string_or_null() : void {
		$uptime = host_info::get_uptime();
		$this->assertTrue($uptime === null || is_string($uptime));
	}
}
