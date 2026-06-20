<?php declare(strict_types=1);
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



/**
* RAG_FUSION_TEST
* Pure-logic coverage of Reciprocal Rank Fusion and record collapse used by the
* hybrid retrieval bridge.
*/
final class rag_fusion_test extends BaseTestCase {



	private function cand( string $st, int $sid, int $ci, float $extra=0.0 ) : array {
		return [
			'section_tipo'	=> $st,
			'section_id'	=> $sid,
			'component_tipo'=> 'c1',
			'lang'			=> 'lg-eng',
			'chunk_index'	=> $ci,
			'source_text'	=> "text $st $sid $ci",
			'distance'		=> $extra
		];
	}



	/** an item ranked highly in BOTH lists beats items strong in only one */
	public function test_rrf_rewards_agreement() : void {

		$dense = [ $this->cand('s1',1,0), $this->cand('s1',2,0), $this->cand('s1',3,0) ];
		$lex   = [ $this->cand('s1',2,0), $this->cand('s1',4,0), $this->cand('s1',1,0) ];

		$fused = rag_fusion::fuse([$dense, $lex], ['section_tipo','section_id','component_tipo','lang','chunk_index'], 60);

		// record (s1,2) is rank1 in lex and rank2 in dense → should top the fusion
		$this->assertSame('s1', $fused[0]['section_tipo']);
		$this->assertSame(2, $fused[0]['section_id']);
		$this->assertArrayHasKey('rrf_score', $fused[0]);
		// scores are descending
		for ($i=1; $i<count($fused); $i++) {
			$this->assertGreaterThanOrEqual($fused[$i]['rrf_score'], $fused[$i-1]['rrf_score']);
		}
	}



	/** fusion preserves the full row (source_text survives) and dedupes */
	public function test_rrf_dedupes_and_preserves_payload() : void {
		$a = [ $this->cand('s1',1,0) ];
		$b = [ $this->cand('s1',1,0) ];
		$fused = rag_fusion::fuse([$a, $b]);
		$this->assertCount(1, $fused);
		$this->assertSame('text s1 1 0', $fused[0]['source_text']);
		// appears in both lists at rank 1 → 2 * 1/(60+1)
		$this->assertEqualsWithDelta(2.0/61.0, $fused[0]['rrf_score'], 1e-9);
	}



	/** collapse keeps the best-scoring chunk per record */
	public function test_collapse_to_records() : void {
		$candidates = [
			['section_tipo'=>'s1','section_id'=>1,'chunk_index'=>0,'rrf_score'=>0.1],
			['section_tipo'=>'s1','section_id'=>1,'chunk_index'=>5,'rrf_score'=>0.9], // best for record (s1,1)
			['section_tipo'=>'s1','section_id'=>2,'chunk_index'=>0,'rrf_score'=>0.5]
		];
		$records = rag_fusion::collapse_to_records($candidates, 'rrf_score');
		$this->assertCount(2, $records);
		// record (s1,1) wins with its 0.9 chunk and sorts first
		$this->assertSame(1, $records[0]['section_id']);
		$this->assertSame(5, $records[0]['chunk_index']);
		$this->assertEqualsWithDelta(0.9, $records[0]['rrf_score'], 1e-9);
	}



}//end class rag_fusion_test
