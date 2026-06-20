<?php declare(strict_types=1);
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



/**
* RAG_IMAGE_TEST
* Pure-logic coverage of Phase 5b (image similarity & object characterization):
* the neighbour-aggregation proposal engine, multimodal response parsing, pgvector
* text parsing, and ontology context resolution. No model / DB needed (context is
* injected via reflection; the store/encoder paths are integration-tested elsewhere).
*/
final class rag_image_test extends BaseTestCase {



	protected function tearDown() : void {
		rag_config::reset();
	}



	/** categorical proposal = similarity-weighted vote */
	public function test_aggregate_categorical_weighted_vote() : void {
		$items = [
			['value'=>'As (Roman bronze)', 'weight'=>0.9, 'record'=>['num',1], 'thumb'=>null],
			['value'=>'Sestertius',        'weight'=>0.3, 'record'=>['num',2], 'thumb'=>null],
			['value'=>'As (Roman bronze)', 'weight'=>0.2, 'record'=>['num',3], 'thumb'=>null]
		];
		$res = rag_characterizer::aggregate_categorical($items);
		$this->assertSame('categorical', $res->kind);
		$this->assertSame('As (Roman bronze)', $res->proposal);            // 1.1 vs 0.3
		$this->assertEqualsWithDelta(1.1/1.4, $res->confidence, 1e-3);
		$this->assertSame('As (Roman bronze)', $res->distribution[0]['value']); // sorted desc
		// evidence cites only the winning-value neighbours, weight-sorted
		$this->assertCount(2, $res->evidence);
		$this->assertSame(1, $res->evidence[0]->section_id);
	}



	/** period proposal = earliest..latest + weighted-central; confidence = clustering */
	public function test_summarize_dates_range() : void {
		$items = [
			['from'=>100,  'to'=>200,  'label'=>'2nd c. CE', 'weight'=>1.0, 'record'=>['num',1], 'thumb'=>null],
			['from'=>150,  'to'=>250,  'label'=>'mid 2nd c.', 'weight'=>1.0, 'record'=>['num',2], 'thumb'=>null],
			['from'=>1000, 'to'=>1100, 'label'=>'medieval',  'weight'=>0.1, 'record'=>['num',3], 'thumb'=>null]
		];
		$res = rag_characterizer::summarize_dates($items);
		$this->assertSame('date_range', $res->kind);
		$this->assertSame('2nd c. CE', $res->proposal->earliest);   // min 'from'
		$this->assertSame('medieval',  $res->proposal->latest);     // max 'to'
		$this->assertSame('mid 2nd c.',$res->proposal->central);    // weighted median midpoint
		$this->assertEqualsWithDelta(0.1, $res->confidence, 1e-3);  // 1 - 900/1000
	}



	/** an outlier-heavy set yields low confidence (honest uncertainty) */
	public function test_categorical_low_confidence_when_split() : void {
		$items = [
			['value'=>'A','weight'=>0.5,'record'=>['s',1],'thumb'=>null],
			['value'=>'B','weight'=>0.5,'record'=>['s',2],'thumb'=>null]
		];
		$res = rag_characterizer::aggregate_categorical($items);
		$this->assertEqualsWithDelta(0.5, $res->confidence, 1e-9);
	}



	/** multimodal response parsing: {embeddings:[…]} and OpenAI {data:[…]} shapes */
	public function test_multimodal_extract_vectors() : void {
		$a = embedding_provider_multimodal::extract_vectors((object)['embeddings'=>[[1,2],[3,4]]]);
		$this->assertSame([[1.0,2.0],[3.0,4.0]], $a);
		$b = embedding_provider_multimodal::extract_vectors((object)['data'=>[(object)['embedding'=>[5,6]]]]);
		$this->assertSame([[5.0,6.0]], $b);
		$this->assertSame([], embedding_provider_multimodal::extract_vectors((object)['nope'=>1]));
	}



	/** pgvector text form → floats (used to read stored image vectors by example) */
	public function test_parse_vector_text() : void {
		$this->assertSame([0.1,0.2,0.3], rag_vector_store::parse_vector_text('[0.1,0.2,0.3]'));
		$this->assertSame([], rag_vector_store::parse_vector_text('[]'));
		$this->assertSame([], rag_vector_store::parse_vector_text(''));
	}



	/** ontology context resolution (properties.rag.context) — inject via reflection */
	public function test_context_resolution() : void {

		$props = (object)[ 'rag' => (object)[
			'enabled' => true,
			'context' => (object)[
				'images'   => [ (object)['tipo'=>'numd5','view'=>'obverse'], (object)['tipo'=>'numd6','view'=>'reverse'] ],
				'metadata' => (object)[ 'typology'=>'numd10', 'period'=>'numd20', 'material'=>'numd30' ],
				'compare_scope' => 'same_section'
			]
		]];
		// seed rag_config's properties cache so get_rag()/get_context() read the fake
		$ref = new ReflectionProperty('rag_config', 'properties_cache');
		$ref->setValue(null, ['numismatics' => $props]);

		$images = rag_config::get_context_images('numismatics');
		$this->assertCount(2, $images);
		$this->assertSame('numd5', $images[0]['tipo']);
		$this->assertSame('obverse', $images[0]['view']);

		$meta = rag_config::get_context_metadata('numismatics');
		$this->assertSame('numd10', $meta['typology']);
		$this->assertSame('numd20', $meta['period']);

		$this->assertSame(['numismatics'], rag_config::get_compare_scope('numismatics'));
		$this->assertTrue(rag_config::section_has_image_context('numismatics'));
	}



}//end class rag_image_test
