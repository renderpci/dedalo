<?php declare(strict_types=1);
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';



/**
* RAG_STORE_INTEGRATION_TEST
* End-to-end exercise of the vector store against a REAL pgvector instance.
* Skips cleanly when DEDALO_RAG_DB_* is not configured, so it is a no-op on
* installs without RAG and a full check on provisioned ones. Run the DDL
* (install/db/rag_embeddings.sql) against the RAG instance before this passes.
*
* Uses a synthetic model name + a tiny fixed dimension so it never collides with
* real data and cleans up after itself.
*/
final class rag_store_integration_test extends BaseTestCase {



	private const TEST_MODEL	= '__test_model__';
	private const TEST_DIM		= 4;
	private const TEST_ST		= '__rag_test__';



	protected function setUp() : void {
		if (!DBi_vector::is_configured()) {
			$this->markTestSkipped('RAG vector DB not configured (DEDALO_RAG_DB_*)');
		}
		// must be reachable too
		if (DBi_vector::get_connection() === false) {
			$this->markTestSkipped('RAG vector DB configured but not reachable');
		}
		$this->cleanup();
	}



	protected function tearDown() : void {
		if (DBi_vector::is_configured() && DBi_vector::get_connection() !== false) {
			$this->cleanup();
		}
	}



	private function cleanup() : void {
		DBi_vector::exec('DELETE FROM rag_embeddings WHERE section_tipo=$1', [self::TEST_ST]);
	}



	private function row( int $sid, int $chunk_index, array $embedding, string $hash, string $text ) : array {
		return [
			'section_tipo'	=> self::TEST_ST,
			'section_id'	=> $sid,
			'component_tipo'=> 'tc1',
			'lang'			=> 'lg-eng',
			'chunk_index'	=> $chunk_index,
			'provider'		=> 'local_http',
			'model'			=> self::TEST_MODEL,
			'dimension'		=> self::TEST_DIM,
			'embedding'		=> $embedding,
			'source_hash'	=> $hash,
			'source_text'	=> $text,
			'token_count'	=> 3,
			'modality'		=> 'text',
			'source_kind'	=> 'text',
			'egress_class'	=> 'public',
			'parent_key'	=> 'p1',
			'chunk_meta'	=> ['heading'=>'H']
		];
	}



	/** partition creation + upsert + cosine query returns the nearest row first */
	public function test_upsert_and_query() : void {

		$this->assertTrue(rag_vector_store::ensure_model_partition(self::TEST_MODEL, self::TEST_DIM));

		$this->assertTrue(rag_vector_store::upsert($this->row(1, 0, [1,0,0,0], 'h1', 'about cats')));
		$this->assertTrue(rag_vector_store::upsert($this->row(2, 0, [0,1,0,0], 'h2', 'about banks')));

		// query closest to [0.9,0.1,0,0] → record 1
		$hits = rag_vector_store::query([0.9,0.1,0,0], self::TEST_MODEL, 5, null, [self::TEST_ST], 'text');
		$this->assertNotEmpty($hits);
		$this->assertSame(1, (int)$hits[0]['section_id']);
		$this->assertArrayHasKey('distance', $hits[0]);
		$this->assertSame('p1', $hits[0]['parent_key']);
	}



	/** diff_hashes reflects stored hashes; upsert is idempotent on the natural key */
	public function test_diff_hashes_and_idempotent_upsert() : void {

		rag_vector_store::ensure_model_partition(self::TEST_MODEL, self::TEST_DIM);
		rag_vector_store::upsert($this->row(3, 0, [0,0,1,0], 'hash-A', 'v1'));

		$hashes = rag_vector_store::diff_hashes(self::TEST_ST, 3, self::TEST_MODEL);
		$this->assertSame('hash-A', $hashes['tc1|lg-eng|0'] ?? null);

		// re-upsert same key with a new hash → replaces, not duplicates
		rag_vector_store::upsert($this->row(3, 0, [0,0,1,0], 'hash-B', 'v2'));
		$hashes2 = rag_vector_store::diff_hashes(self::TEST_ST, 3, self::TEST_MODEL);
		$this->assertSame('hash-B', $hashes2['tc1|lg-eng|0'] ?? null);
	}



	/** delete_record removes every chunk for a record */
	public function test_delete_record() : void {

		rag_vector_store::ensure_model_partition(self::TEST_MODEL, self::TEST_DIM);
		rag_vector_store::upsert($this->row(4, 0, [1,1,0,0], 'h', 't0'));
		rag_vector_store::upsert($this->row(4, 1, [1,0,1,0], 'h', 't1'));

		$this->assertTrue(rag_vector_store::delete_record(self::TEST_ST, 4));
		$hits = rag_vector_store::query([1,1,0,0], self::TEST_MODEL, 5, null, [self::TEST_ST], 'text');
		$remaining = array_filter($hits, static fn($h) => (int)$h['section_id'] === 4);
		$this->assertEmpty($remaining);
	}



	/** lexical query matches stored source_text */
	public function test_lexical_query() : void {

		rag_vector_store::ensure_model_partition(self::TEST_MODEL, self::TEST_DIM);
		rag_vector_store::upsert($this->row(5, 0, [1,0,0,0], 'h', 'the Rosetta Stone inscription'));

		$hits = rag_lexical::query('Rosetta', 5, [self::TEST_ST], 'text');
		$ids = array_map(static fn($h) => (int)$h['section_id'], $hits);
		$this->assertContains(5, $ids);
	}



}//end class rag_store_integration_test
