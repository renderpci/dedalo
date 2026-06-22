<?php declare(strict_types=1);
/**
* rag_drain.php — CLI entry point for draining the RAG re-index queue.
*
* OPS-01: the queue (rag_index_queue) is a dirty-marker filled by
* section_record::save()/delete(); something has to call rag_queue::drain() to do
* the deferred embedding off the editor path. This script is that "something",
* meant to run from OS cron on the work server.
*
* Usage:
*   php core/rag/cli/rag_drain.php [batch] [max_loops]
*     batch     rows per drain pass   (default 100)
*     max_loops safety cap on passes  (default 50; stops early when queue empty)
*
* Example crontab (every minute):
*   * * * * * cd /path/to/dedalo && php core/rag/cli/rag_drain.php >> /var/log/dedalo/rag_drain.log 2>&1
*
* It is safe to run concurrently: rag_queue::drain() single-flights via a Postgres
* advisory lock, so overlapping cron invocations simply no-op.
*/

// CLI only
if (PHP_SAPI !== 'cli') {
	fwrite(STDERR, "rag_drain.php must be run from the command line\n");
	exit(2);
}

// boot Dédalo (config + autoloader). __DIR__ = core/rag/cli
require_once dirname(__DIR__, 3) . '/config/bootstrap.php';

if (!defined('DEDALO_RAG_ENABLED') || DEDALO_RAG_ENABLED !== true) {
	fwrite(STDERR, "RAG is disabled (DEDALO_RAG_ENABLED !== true). Nothing to drain.\n");
	exit(0);
}
if (!DBi_vector::is_configured()) {
	fwrite(STDERR, "RAG vector DB not configured (DEDALO_RAG_DB_*).\n");
	exit(1);
}

$batch		= isset($argv[1]) ? max(1, (int)$argv[1]) : 100;
$max_loops	= isset($argv[2]) ? max(1, (int)$argv[2]) : 50;

$total = 0;
for ($loop = 0; $loop < $max_loops; $loop++) {
	$n = rag_queue::drain($batch);
	$total += $n;
	if ($n < 1) {
		break; // queue drained (or another drain holds the lock)
	}
}

$pending = rag_queue::pending_count();
fwrite(STDOUT, "rag_drain: processed=$total pending=$pending\n");
exit(0);
