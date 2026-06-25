<?php declare(strict_types=1);
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



/**
* RAG_CHUNKER_TEST
* Pure-logic coverage of the structure-aware SEMANTIC chunker. No DB or model
* needed: the semantic-segmentation embedder is INJECTED as a deterministic
* fake, so breakpoint behaviour is exercised exactly.
*/
final class rag_chunker_test extends BaseTestCase {



	/**
	* Deterministic fake embedder: each sentence is mapped to a one-hot vector by
	* the topic keyword it contains ('cat' vs 'bank'), so consecutive sentences in
	* the same topic have distance 0 and a topic change has distance 1.
	* @return callable
	*/
	private function topic_embedder() : callable {
		return static function( array $sentences ) : array {
			$vectors = [];
			foreach ($sentences as $s) {
				if (stripos($s, 'cat') !== false || stripos($s, 'feline') !== false) {
					$vectors[] = [1.0, 0.0, 0.0];
				} elseif (stripos($s, 'bank') !== false || stripos($s, 'loan') !== false) {
					$vectors[] = [0.0, 1.0, 0.0];
				} else {
					$vectors[] = [0.0, 0.0, 1.0];
				}
			}
			return $vectors;
		};
	}



	/** estimate_tokens is positive and grows with text */
	public function test_estimate_tokens() : void {
		$small = rag_chunker::estimate_tokens('hello world');
		$big   = rag_chunker::estimate_tokens(str_repeat('palabra ', 200));
		$this->assertGreaterThan(0, $small);
		$this->assertGreaterThan($small, $big);
	}



	/** cosine_distance: identical=0, orthogonal=1 */
	public function test_cosine_distance() : void {
		$this->assertEqualsWithDelta(0.0, rag_chunker::cosine_distance([1,2,3],[1,2,3]), 1e-9);
		$this->assertEqualsWithDelta(1.0, rag_chunker::cosine_distance([1,0,0],[0,1,0]), 1e-9);
	}



	/** percentile: linear interpolation against a known list */
	public function test_percentile() : void {
		$v = [0.0, 0.5, 1.0];
		$this->assertEqualsWithDelta(0.0, rag_chunker::percentile($v, 0.0), 1e-9);
		$this->assertEqualsWithDelta(1.0, rag_chunker::percentile($v, 1.0), 1e-9);
		$this->assertEqualsWithDelta(0.5, rag_chunker::percentile($v, 0.5), 1e-9);
	}



	/** sentence splitter counts terminals */
	public function test_split_sentences() : void {
		$s = rag_chunker::split_sentences('One sentence. Two sentences! Three? Done.');
		$this->assertCount(4, $s);
	}



	/**
	* SEMANTIC SEGMENTATION: a single structural unit with two topics is split at
	* the topic boundary by embedding-distance breakpoints — the core advanced
	* technique.
	*/
	public function test_segment_unit_semantic_breakpoint() : void {

		$text = 'The cat sat on the mat. The feline groomed itself. '
			  . 'The bank approved the loan. The loan rate was high.';

		$segments = rag_chunker::segment_unit($text, $this->topic_embedder(), 0.5);

		$this->assertCount(2, $segments, 'expected a breakpoint between the cat topic and the bank topic');
		$this->assertStringContainsString('cat', $segments[0]);
		$this->assertStringNotContainsString('bank', $segments[0]);
		$this->assertStringContainsString('bank', $segments[1]);
	}



	/** Without an embedder, a unit stays whole (structural-only fallback) */
	public function test_segment_unit_without_embedder() : void {
		$text = 'The cat sat. The bank approved the loan.';
		$segments = rag_chunker::segment_unit($text, null, 0.5);
		$this->assertCount(1, $segments);
	}



	/**
	* STRUCTURAL HARD BOUNDARY: two headings produce at least two chunks that
	* never merge across the heading, each carrying its own heading provenance and
	* a distinct parent_key (small-to-big).
	*/
	public function test_structural_headings_are_hard_boundaries() : void {

		$text = "[h1] Introduction\nThe project began in 1923.\n"
			  . "[h1] Methods\nWe used carbon dating.";

		$chunks = rag_chunker::chunk($text, ['strategy'=>'structural', 'mode'=>'long_document']);

		$this->assertGreaterThanOrEqual(2, count($chunks));

		$headings = array_map(static fn($c) => $c['chunk_meta']['heading'] ?? null, $chunks);
		$this->assertContains('Introduction', $headings);
		$this->assertContains('Methods', $headings);

		// a chunk under Introduction must not contain Methods body text
		foreach ($chunks as $c) {
			if (($c['chunk_meta']['heading'] ?? '') === 'Introduction') {
				$this->assertStringNotContainsString('carbon dating', $c['text']);
			}
		}

		// distinct parent_key per heading section
		$parents = array_unique(array_filter(array_map(static fn($c) => $c['parent_key'], $chunks)));
		$this->assertGreaterThanOrEqual(2, count($parents));
	}



	/** page markers are captured as provenance, not embedded as content */
	public function test_page_marker_provenance() : void {
		$text = "[page-n-7]\nThe inscription reads clearly here.";
		$chunks = rag_chunker::chunk($text, ['strategy'=>'structural', 'mode'=>'long_document']);
		$this->assertNotEmpty($chunks);
		$this->assertSame(7, $chunks[0]['chunk_meta']['page'] ?? null);
		$this->assertStringNotContainsString('page-n', $chunks[0]['text']);
	}



	/** CONTEXTUAL ENRICHMENT: embed_text carries the header; raw text does not */
	public function test_contextual_header_separation() : void {
		$text = "[h1] Chapter One\nA short paragraph of body text here.";
		$chunks = rag_chunker::chunk($text, [
			'strategy'			=> 'structural',
			'mode'				=> 'long_document',
			'document_title'	=> 'My Thesis'
		]);
		$this->assertNotEmpty($chunks);
		$c = $chunks[0];
		$this->assertStringContainsString('My Thesis', $c['embed_text']);
		$this->assertStringContainsString('Chapter One', $c['embed_text']);
		$this->assertStringNotContainsString('My Thesis', $c['text'], 'raw citation text must not include the header');
		// source_hash is over the enriched embed_text, versioned (DATA-04)
		$this->assertSame(hash('sha256', rag_chunker::VERSION . '|' . $c['embed_text']), $c['source_hash']);
	}



	/** TRANSCRIPTION MODE: timecode provenance per chunk */
	public function test_transcription_timecodes() : void {
		$text = '[TC_00:00:01.000_TC] Welcome to the interview. '
			  . '[TC_00:00:05.500_TC] Today we discuss the excavation.';
		$chunks = rag_chunker::chunk($text, ['strategy'=>'structural', 'media_tipo'=>'av99']);

		$this->assertGreaterThanOrEqual(2, count($chunks));
		$this->assertSame('00:00:01.000', $chunks[0]['chunk_meta']['tc_in']);
		$this->assertSame('00:00:05.500', $chunks[0]['chunk_meta']['tc_out']);
		$this->assertSame('av99', $chunks[0]['chunk_meta']['media_tipo']);
		$this->assertSame('av_transcript', $chunks[0]['source_kind']);
	}



	/** auto mode detects a transcription by its TC markers */
	public function test_detect_mode() : void {
		$this->assertSame('transcription', rag_chunker::detect_mode('[TC_00:00:01.000_TC] hi', 450));
		$this->assertSame('short', rag_chunker::detect_mode('a tiny note', 450));
		$this->assertSame('long_document', rag_chunker::detect_mode(str_repeat('word ', 5000), 450));
	}



	/** packing: an oversize segment is hard-split to <= max_tokens pieces */
	public function test_pack_oversize_segment_hard_split() : void {
		$long = trim(str_repeat('This is a sentence. ', 80)); // ~ many tokens
		$packed = rag_chunker::pack_segments([$long], 60, 20);
		$this->assertGreaterThan(1, count($packed));
		foreach ($packed as $piece) {
			$this->assertLessThanOrEqual(60 + 30, rag_chunker::estimate_tokens($piece)); // allow one-sentence overshoot
		}
	}



	/** chunk indexes are contiguous from 0 */
	public function test_chunk_indexes_contiguous() : void {
		$text = "[h1] A\nBody a.\n[h1] B\nBody b.\n[h1] C\nBody c.";
		$chunks = rag_chunker::chunk($text, ['strategy'=>'structural', 'mode'=>'long_document']);
		$indexes = array_map(static fn($c) => $c['chunk_index'], $chunks);
		$this->assertSame(range(0, count($chunks)-1), $indexes);
	}



	/** empty input yields no chunks */
	public function test_empty_input() : void {
		$this->assertSame([], rag_chunker::chunk('   '));
	}



}//end class rag_chunker_test
