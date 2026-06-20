<?php declare(strict_types=1);
/**
* rag_backfill.php — index a section's EXISTING records into the RAG vector store.
*
* New records created in the UI are indexed automatically (the save() hook enqueues
* and core/rag/cli/rag_drain.php drains). This CLI is for the initial backfill of a
* section's already-existing records (text and/or images), and to build the ANN
* index after a bulk load.
*
* Usage:
*   php core/rag/cli/rag_backfill.php <section_tipo> [--build-index]
*     <section_tipo>   the section to backfill (e.g. a coin section)
*     --build-index    after loading, build the HNSW index for every (model,dimension)
*
* Resumable: re-running skips unchanged chunks/images (source-hash diff).
*/

if (PHP_SAPI !== 'cli') {
	fwrite(STDERR, "rag_backfill.php must be run from the command line\n");
	exit(2);
}

require_once dirname(__DIR__, 3) . '/config/config.php';

$section_tipo = $argv[1] ?? '';
$build_index  = in_array('--build-index', array_slice($argv, 2), true);

if ($section_tipo === '' || str_starts_with($section_tipo, '--')) {
	fwrite(STDERR, "Usage: php core/rag/cli/rag_backfill.php <section_tipo> [--build-index]\n");
	exit(2);
}
if (!defined('DEDALO_RAG_ENABLED') || DEDALO_RAG_ENABLED !== true) {
	fwrite(STDERR, "RAG is disabled (DEDALO_RAG_ENABLED !== true).\n");
	exit(1);
}
if (!DBi_vector::is_configured()) {
	fwrite(STDERR, "RAG vector DB not configured (DEDALO_RAG_DB_*).\n");
	exit(1);
}
if (!rag_config::section_is_rag_enabled($section_tipo)) {
	fwrite(STDERR, "Section '$section_tipo' is not RAG-enabled (properties.rag.enabled).\n");
	exit(1);
}

// iterate the section's records (matrix resource), index each
$res = section::get_resource_all_section_records_unfiltered($section_tipo, 'section_id');
if ($res === false) {
	fwrite(STDERR, "Could not read records for '$section_tipo'.\n");
	exit(1);
}

$ok = 0; $fail = 0; $n = 0;
while ($row = pg_fetch_assoc($res)) {
	$section_id = (int)$row['section_id'];
	if ($section_id < 1) {
		continue;
	}
	$result = rag_indexer::index_record($section_tipo, $section_id);
	$result ? $ok++ : $fail++;
	$n++;
	if (($n % 100) === 0) {
		fwrite(STDOUT, "  …$n processed (ok=$ok fail=$fail)\n");
		if (class_exists('section_record_instances_cache') && method_exists('section_record_instances_cache', 'clear')) {
			section_record_instances_cache::clear();
		}
		gc_collect_cycles();
	}
}
fwrite(STDOUT, "backfill '$section_tipo': processed=$n ok=$ok fail=$fail\n");

// optional: build the HNSW index for each (model, dimension) present
if ($build_index) {
	$models = DBi_vector::exec('SELECT DISTINCT model, dimension FROM rag_embeddings', []);
	if ($models !== false) {
		while ($m = pg_fetch_assoc($models)) {
			$model = (string)$m['model'];
			$dim   = (int)$m['dimension'];
			fwrite(STDOUT, "  building ANN index for model=$model dim=$dim …\n");
			$built = rag_vector_store::build_ann_index($model, $dim);
			fwrite(STDOUT, '   ' . ($built ? 'ok' : 'FAILED') . "\n");
		}
	}
}

exit($fail > 0 ? 1 : 0);
