<?php declare(strict_types=1);
/**
* rag_selftest.php — one-command "is my RAG wired correctly?" diagnostic.
*
* Runs each stage end-to-end and prints PASS/FAIL, so you can tell at a glance
* whether the vector DB, the text embedder, the store round-trip, and (if media is
* on) the image embedder are all reachable and consistent — before touching real
* data or the MCP agent.
*
* Usage:  php core/rag/cli/rag_selftest.php
* Exit:   0 if all run stages PASS, 1 otherwise.
*/

if (PHP_SAPI !== 'cli') {
	fwrite(STDERR, "rag_selftest.php must be run from the command line\n");
	exit(2);
}

require_once dirname(__DIR__, 3) . '/config/bootstrap.php';

$pass = 0; $fail = 0;
$ok   = function(string $label, string $detail='') use (&$pass) { $pass++; fwrite(STDOUT, "  [PASS] $label" . ($detail!=='' ? " — $detail" : '') . "\n"); };
$ko   = function(string $label, string $detail='') use (&$fail) { $fail++; fwrite(STDOUT, "  [FAIL] $label" . ($detail!=='' ? " — $detail" : '') . "\n"); };
$skip = function(string $label, string $detail='') { fwrite(STDOUT, "  [skip] $label" . ($detail!=='' ? " — $detail" : '') . "\n"); };

fwrite(STDOUT, "Dédalo RAG self-test\n");

// 0. enabled?
if (!defined('DEDALO_RAG_ENABLED') || DEDALO_RAG_ENABLED !== true) {
	$ko('DEDALO_RAG_ENABLED', 'set it to true'); fwrite(STDOUT, "\n0 of 1 passed\n"); exit(1);
}
$ok('DEDALO_RAG_ENABLED');

// 1. vector DB reachable
$conn = DBi_vector::is_configured() ? DBi_vector::get_connection() : false;
if ($conn === false) { $ko('vector DB connection', 'check DEDALO_RAG_DB_* and that the instance is up'); }
else { $ok('vector DB connection'); }

// 2. schema present
if ($conn !== false) {
	$r = DBi_vector::exec("SELECT to_regclass('public.rag_embeddings') AS t", []);
	$row = ($r !== false) ? pg_fetch_assoc($r) : null;
	($row && !empty($row['t'])) ? $ok('schema rag_embeddings', 'run install/db/rag_embeddings.sql if missing')
		: $ko('schema rag_embeddings', 'run install/db/rag_embeddings.sql');
}

// 3. text embedder
$provider = embedding_provider_factory::get();
$probe_dim = 0; $probe_vec = null; $model = null;
if ($provider === null) {
	$ko('text provider', 'set DEDALO_RAG_ENDPOINT / _MODEL');
} else {
	$res = $provider->embed(['hola mundo']);
	if (!empty($res->vectors) && $res->dimension > 0) {
		$probe_dim = (int)$res->dimension; $probe_vec = $res->vectors[0]; $model = $provider->get_model();
		$ok('text embed', "model={$model} dim={$probe_dim}");
	} else {
		$ko('text embed', 'endpoint returned no vector — is the sidecar running?');
	}
}

// 4. store round-trip (ensure partition → upsert → cosine query → cleanup)
if ($conn !== false && $probe_vec !== null && $model !== null) {
	$st = '__rag_selftest__'; $sid = 1;
	try {
		rag_vector_store::ensure_model_partition($model, $probe_dim);
		$up = rag_vector_store::upsert([
			'section_tipo'=>$st, 'section_id'=>$sid, 'component_tipo'=>'probe', 'lang'=>'lg-nolan',
			'chunk_index'=>0, 'provider'=>$provider->get_provider(), 'model'=>$model, 'dimension'=>$probe_dim,
			'embedding'=>$probe_vec, 'source_hash'=>'selftest', 'source_text'=>'selftest', 'token_count'=>1,
			'modality'=>'text', 'source_kind'=>'text', 'egress_class'=>'public', 'parent_key'=>null, 'chunk_meta'=>null
		]);
		$hits = rag_vector_store::query($probe_vec, $model, 1, null, [$st], 'text');
		rag_vector_store::delete_record($st, $sid);
		($up && !empty($hits) && (int)$hits[0]['section_id'] === $sid)
			? $ok('store round-trip', 'upsert + cosine query returned the probe')
			: $ko('store round-trip', 'upsert/query mismatch');
	} catch (\Throwable $e) {
		rag_vector_store::delete_record($st, $sid);
		$ko('store round-trip', $e->getMessage());
	}
} else {
	$skip('store round-trip', 'needs DB + a text vector');
}

// 5. image embedder (only if media enabled)
if (defined('DEDALO_RAG_MEDIA_ENABLED') && DEDALO_RAG_MEDIA_ENABLED === true) {
	$mm = embedding_provider_multimodal::get();
	if ($mm === null) {
		$ko('multimodal provider', 'set DEDALO_RAG_MULTIMODAL_ENDPOINT / _MODEL');
	} else {
		// a 1x1 PNG probe
		$png_b64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
		$img = $mm->embed_image([$png_b64]);
		(!empty($img->vectors) && $img->dimension > 0)
			? $ok('image embed', 'model=' . $mm->get_model() . " dim={$img->dimension}")
			: $ko('image embed', 'multimodal endpoint returned no vector — is the sidecar /image up?');
		// text tower (joint space)
		$txt = $mm->embed_text_for_image_search(['a blue ceramic jar']);
		(!empty($txt->vectors) && $txt->dimension > 0)
			? $ok('image-search text tower', "dim={$txt->dimension}")
			: $ko('image-search text tower', 'multimodal /text returned no vector');
	}
} else {
	$skip('image embedder', 'DEDALO_RAG_MEDIA_ENABLED is off');
}

fwrite(STDOUT, "\n$pass passed, $fail failed\n");
exit($fail > 0 ? 1 : 0);
