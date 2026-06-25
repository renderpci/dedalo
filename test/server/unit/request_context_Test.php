<?php declare(strict_types=1);

use PHPUnit\Framework\TestCase;

require_once dirname(__DIR__, 3) . '/core/base/config/class.request_context.php';

final class request_context_Test extends TestCase {

	private array $req_backup;
	private array $sess_backup;

	protected function setUp() : void {
		parent::setUp();
		$this->req_backup  = $_REQUEST;
		$this->sess_backup = $_SESSION ?? [];
		$_REQUEST = [];
		$_SESSION = [];
	}
	protected function tearDown() : void {
		$_REQUEST = $this->req_backup;
		$_SESSION = $this->sess_backup;
	}

	// --- pure resolvers ---

	public function test_resolve_cascade_request_wins_and_is_sanitized() : void {
		$v = request_context::resolve_cascade('lang', 'lg-eng', ['lang' => "  lg-<b>cat</b>  "], []);
		$this->assertSame('lg-cat', $v); // trimmed + tag-stripped
	}

	public function test_resolve_cascade_falls_back_to_session_then_default() : void {
		$this->assertSame('lg-spa', request_context::resolve_cascade('lang', 'lg-eng', [], ['dedalo' => ['config' => ['lang' => 'lg-spa']]]));
		$this->assertSame('lg-eng', request_context::resolve_cascade('lang', 'lg-eng', [], []));
		// empty request value does not win
		$this->assertSame('lg-eng', request_context::resolve_cascade('lang', 'lg-eng', ['lang' => ''], []));
	}

	public function test_user_id_and_developer_flag_from_session() : void {
		$session = ['dedalo' => ['auth' => ['user_id' => '42', 'is_developer' => true]]];
		$this->assertSame(42, request_context::user_id($session));
		$this->assertTrue(request_context::developer_flag($session));
		$this->assertNull(request_context::user_id([]));
		$this->assertFalse(request_context::developer_flag([]));
	}

	public function test_is_superuser_and_level_for() : void {
		$this->assertTrue(request_context::is_superuser(-1, -1));
		$this->assertFalse(request_context::is_superuser(7, -1));
		$this->assertFalse(request_context::is_superuser(null, -1));
		$this->assertSame(100, request_context::level_for(true, 100, 10));
		$this->assertSame(10, request_context::level_for(false, 100, 10));
	}

	// --- live accessors (superglobals; constant fallbacks) ---

	public function test_application_lang_reads_request_live() : void {
		$_REQUEST['dedalo_application_lang'] = 'lg-cat';
		$this->assertSame('lg-cat', request_context::application_lang());
	}

	public function test_application_lang_default_fallback_when_nothing_set() : void {
		// no $_REQUEST/$_SESSION, constant may be undefined -> '' fallback
		$this->assertSame(defined('DEDALO_APPLICATION_LANGS_DEFAULT') ? (string) DEDALO_APPLICATION_LANGS_DEFAULT : '', request_context::application_lang());
	}

	public function test_show_debug_true_when_session_user_is_superuser_fallback() : void {
		// DEDALO_SUPERUSER fallback is -1; a session user_id of -1 => superuser
		$_SESSION['dedalo']['auth']['user_id'] = -1;
		$this->assertTrue(request_context::show_debug());
		$_SESSION['dedalo']['auth']['user_id'] = 5;
		$this->assertFalse(request_context::show_debug());
	}

	public function test_show_developer_reads_session_live() : void {
		$_SESSION['dedalo']['auth']['is_developer'] = true;
		$this->assertTrue(request_context::show_developer());
		$_SESSION['dedalo']['auth']['is_developer'] = false;
		$this->assertFalse(request_context::show_developer());
	}
}
