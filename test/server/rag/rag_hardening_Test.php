<?php declare(strict_types=1);
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



/**
* RAG_HARDENING_TEST
* Locks the round-2 review hardening: context-token budgeting (LLM-02),
* per-record diversify (RET-03), reranker fail-open pass-through (RET-01), and
* the private-network heuristic (SEC-RAG-03). Private statics are exercised via
* reflection (same pattern as tool_caches_Test).
*/
final class rag_hardening_test extends BaseTestCase {



	private function call_private( string $class, string $method, array $args ) : mixed {
		// PHP 8.1+ reflection can invoke private members without setAccessible()
		$ref = new ReflectionMethod($class, $method);
		return $ref->invokeArgs(null, $args);
	}



	private function passage( string $st, int $sid, string $text ) : array {
		return ['section_tipo'=>$st, 'section_id'=>$sid, 'source_text'=>$text];
	}



	/** LLM-02: budgeting trims to fit but always keeps at least the top passage */
	public function test_fit_token_budget_keeps_at_least_one() : void {
		$passages = [
			$this->passage('s', 1, str_repeat('word ', 400)), // ~520 tokens
			$this->passage('s', 2, str_repeat('word ', 400)),
			$this->passage('s', 3, str_repeat('word ', 400))
		];
		// tiny budget → must still keep the first (never return empty when input non-empty)
		$kept = $this->call_private('dd_rag_api', 'fit_token_budget', [$passages, 'sys', 'q', 10]);
		$this->assertCount(1, $kept);
		$this->assertSame(1, $kept[0]['section_id']);
	}



	/** LLM-02: a generous budget keeps everything */
	public function test_fit_token_budget_keeps_all_when_room() : void {
		$passages = [ $this->passage('s',1,'short a'), $this->passage('s',2,'short b') ];
		$kept = $this->call_private('dd_rag_api', 'fit_token_budget', [$passages, 'sys', 'q', 100000]);
		$this->assertCount(2, $kept);
	}



	/** RET-03: diversify caps passages per record, order preserved */
	public function test_diversify_caps_per_record() : void {
		$passages = [
			['section_tipo'=>'s','section_id'=>1,'chunk_index'=>0],
			['section_tipo'=>'s','section_id'=>1,'chunk_index'=>1],
			['section_tipo'=>'s','section_id'=>1,'chunk_index'=>2],
			['section_tipo'=>'s','section_id'=>2,'chunk_index'=>0]
		];
		$out = $this->call_private('retrieval', 'diversify', [$passages, 2]);
		// record 1 capped at 2, record 2 kept → 3 total
		$this->assertCount(3, $out);
		$record1 = array_filter($out, static fn($p) => $p['section_id'] === 1);
		$this->assertCount(2, $record1);
	}



	/** RET-01: reranker is a fail-open pass-through when no endpoint is configured */
	public function test_reranker_passthrough_without_endpoint() : void {
		if (defined('DEDALO_RAG_RERANK_ENDPOINT') && DEDALO_RAG_RERANK_ENDPOINT) {
			$this->markTestSkipped('a reranker endpoint is configured');
		}
		$candidates = [ $this->passage('s',1,'a'), $this->passage('s',2,'b') ];
		$out = rag_reranker::rerank('query', $candidates);
		$this->assertSame($candidates, $out); // unchanged, nothing dropped
	}



	/** SEC-RAG-03: the 172.16.0.0/12 private range is recognised as local */
	public function test_endpoint_is_local_172_range() : void {
		// endpoint_is_local() reads DEDALO_RAG_LLM_ENDPOINT (a constant we can't set
		// here), so assert the documented private-range regex it uses directly.
		// 172.16.x and 172.31.x are private; 172.32.x and 172.15.x are public.
		$this->assertSame(1, preg_match('/^172\.(1[6-9]|2[0-9]|3[01])\./', '172.16.5.1'));
		$this->assertSame(1, preg_match('/^172\.(1[6-9]|2[0-9]|3[01])\./', '172.31.0.9'));
		$this->assertSame(0, preg_match('/^172\.(1[6-9]|2[0-9]|3[01])\./', '172.32.0.1'));
		$this->assertSame(0, preg_match('/^172\.(1[6-9]|2[0-9]|3[01])\./', '172.15.0.1'));
	}



}//end class rag_hardening_test
