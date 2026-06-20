<?php declare(strict_types=1);
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



/**
* RAG_SECURITY_TEST
* Covers the egress policy and the retrieval ACL chokepoint. These run without a
* database: the ACL check short-circuits for the superuser before any DB access,
* and the egress logic is pure config evaluation.
*/
final class rag_security_test extends BaseTestCase {



	private function candidate( string $st='oh1', int $sid=10 ) : array {
		return ['section_tipo'=>$st, 'section_id'=>$sid, 'component_tipo'=>'c1', 'lang'=>'lg-eng', 'chunk_index'=>0];
	}



	/** filter_accessible returns nothing when there is no user (fail-closed) */
	public function test_filter_accessible_requires_user() : void {
		$out = rag_security::filter_accessible([$this->candidate()], 0);
		$this->assertSame([], $out);
	}



	/** the superuser may access any record (bypass, no DB hit) */
	public function test_filter_accessible_superuser_keeps() : void {
		$out = rag_security::filter_accessible([$this->candidate()], DEDALO_SUPERUSER);
		$this->assertCount(1, $out);
		$this->assertSame('oh1', $out[0]['section_tipo']);
	}



	/** candidates without a valid record id are dropped */
	public function test_filter_accessible_drops_invalid() : void {
		$bad = ['section_tipo'=>'', 'section_id'=>0];
		$out = rag_security::filter_accessible([$bad], DEDALO_SUPERUSER);
		$this->assertSame([], $out);
	}



	/** a local provider always permits egress (text never leaves the host) */
	public function test_local_provider_permits_egress() : void {
		if (rag_security::provider_is_external()) {
			$this->markTestSkipped('configured provider is external; local-egress invariant not applicable');
		}
		$this->assertTrue(rag_security::record_can_egress('oh1', 10));
	}



	/**
	* Egress classification is per-record and FAIL-CLOSED: a record that cannot be
	* confirmed publishable (here a non-existent test locator with no fixture) is
	* 'restricted', so it never leaves the host to an external provider. This
	* replaces the former unconditional 'public' default, which leaked embargoed /
	* project-restricted records whenever an operator enabled external egress
	* (audit 2026-06-20, RAG egress HIGH). Mirrors rag_media_extractor image egress.
	*/
	public function test_default_egress_class_fail_closed() : void {
		$this->assertSame('restricted', rag_security::get_record_egress_class('oh1', 10));
	}



}//end class rag_security_test
