<?php declare(strict_types=1);
/**
* EXPORT_REGISTER
* CLI exporter: regenerates tools' register.json files from their live
* 'Tools development' (dd1340) section records in the database.
*
* register.json is the canonical serialization of a dd1340 record. The
* development-area inspector produces it client-side via the Dédalo API
* 'read_raw' action followed by JSON.stringify(record, null, 2) (the
* "Download register file" button, see core/inspector/js). This script
* reproduces that exact output for every tool in bulk, so register files can be
* refreshed after editing or importing tool definitions in dd1340 (e.g. after a
* v6 CSV import) without clicking through the UI tool by tool.
*
* It only READS the database and WRITES local register.json files. It never
* modifies the database.
*
* Usage:
*   php tools/tool_common/cli/export_register.php                  # dry-run, all tools
*   php tools/tool_common/cli/export_register.php --write          # write all tools
*   php tools/tool_common/cli/export_register.php --tool=tool_lang # dry-run, one tool
*   php tools/tool_common/cli/export_register.php --tool=tool_lang --stdout
*
* Options:
*   --tool=tool_x   only this tool (default: every tool directory on disk)
*   --write         write files to disk (default: dry-run; report changes only)
*   --stdout        print the generated JSON to stdout instead of writing
*                   (requires --tool; for validation/diffing)
*   --help          this help
*/

// CLI only
if (PHP_SAPI !== 'cli') {
	echo 'This script must be run from the command line' . PHP_EOL;
	exit(1);
}

$options = getopt('', ['tool::', 'write', 'stdout', 'help']);

if (isset($options['help'])) {
	echo file_get_contents(__FILE__, false, null, 0, (int)strpos(file_get_contents(__FILE__), '*/') + 2) . PHP_EOL;
	exit(0);
}

$fail = function(string $msg) : void {
	fwrite(STDERR, 'Error: ' . $msg . PHP_EOL);
	exit(1);
};

$tool_filter = isset($options['tool']) ? (string)$options['tool'] : null;
$do_write    = isset($options['write']);
$to_stdout   = isset($options['stdout']);

if ($to_stdout && empty($tool_filter)) {
	$fail('--stdout requires --tool=<tool_name>');
}

// paths (this file: /tools/tool_common/cli/export_register.php)
	$root_path  = dirname(__FILE__, 4);
	$tools_root = $root_path . '/tools';

// boot Dédalo. config bootstrap may emit header warnings once output starts, so
// do this before printing anything.
	require_once $root_path . '/config/bootstrap.php';

	// CLI superuser context: read_raw enforces section read permissions. Shell
	// access to the server already implies full trust (same model as create_tool).
	if (login::is_logged() !== true) {
		$_SESSION['dedalo']['auth']['user_id']		= DEDALO_SUPERUSER;
		$_SESSION['dedalo']['auth']['username']		= 'cli';
		$_SESSION['dedalo']['auth']['is_logged']	= 1;
		$_SESSION['dedalo']['auth']['salt_secure']	= bin2hex(random_bytes(16));
	}

// dd1340 = 'Tools development' section. dd1326 = tool name component.
	const DEV_SECTION_TIPO = 'dd1340';
	const TOOL_NAME_TIPO   = 'dd1326';

	// resolve the DB column that stores the tool-name component (component_input_text -> 'string')
	$name_col = section_record_data::get_column_name(
		ontology_node::get_model_by_tipo(TOOL_NAME_TIPO, true)
	);
	if (empty($name_col)) {
		$fail('Could not resolve the data column for ' . TOOL_NAME_TIPO);
	}

/**
* encode_register
* Serializes a raw dd1340 record exactly like the inspector download:
* JSON.stringify(record, null, 2). PHP's JSON_PRETTY_PRINT uses 4-space indent,
* so leading indentation is halved to match the 2-space client output. JSON
* string values never contain literal newlines, so every leading-space run is
* structural indentation (a multiple of 4) and can be safely halved.
*/
function encode_register(object $row) : string {

	$json = json_encode($row, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);

	$json = preg_replace_callback('/^( +)/m', function($m){
		return str_repeat(' ', intdiv(strlen($m[1]), 2));
	}, $json);

	return $json; // no trailing newline (matches JSON.stringify / downloaded file)
}

/**
* read_raw_record
* Reads a single dd1340 record via the exact rqo the development-area inspector
* uses (read_raw + filter_by_locators), so the output is byte-identical to the
* "Download register file" button, including the top-level matrix row 'id'.
*
* @return object|null raw record row, or null when not found
*/
function read_raw_record(int|string $section_id) : ?object {

	$rqo = (object)[
		'action'  => 'read_raw',
		'options' => (object)[
			'type'			=> 'section',
			'section_tipo'	=> DEV_SECTION_TIPO,
			'tipo'			=> DEV_SECTION_TIPO,
			'model'			=> 'section'
		],
		'sqo' => (object)[
			'section_tipo'		=> [DEV_SECTION_TIPO],
			'limit'				=> 1,
			'filter_by_locators'=> [
				(object)[
					'section_tipo'	=> DEV_SECTION_TIPO,
					'section_id'	=> (string)$section_id
				]
			]
		]
	];

	$response = dd_core_api::read_raw($rqo);

	return $response->result[0] ?? null;
}

// 1. Read every dd1340 record once to map tool_name => section_id.
	$rqo_all = (object)[
		'action'  => 'read_raw',
		'options' => (object)[
			'type'			=> 'section',
			'section_tipo'	=> DEV_SECTION_TIPO,
			'tipo'			=> DEV_SECTION_TIPO,
			'model'			=> 'section'
		],
		'sqo' => (object)[
			'section_tipo'	=> [DEV_SECTION_TIPO],
			'limit'			=> 10000
		]
	];
	$response = dd_core_api::read_raw($rqo_all);
	if (empty($response->result) || !is_array($response->result)) {
		$fail('read_raw returned no dd1340 records. msg: ' . ($response->msg ?? 'n/a'));
	}

// 2. Map tool_name => section_id (faithful per-record read happens below).
	$id_by_name = [];
	foreach ($response->result as $row) {
		$tool_name  = $row->{$name_col}->{TOOL_NAME_TIPO}[0]->value ?? null;
		$section_id = $row->section_id ?? null;
		if (empty($tool_name) || !is_string($tool_name)) {
			fwrite(STDERR, '(!) Skipped a dd1340 record with no tool name (section_id: ' . ($section_id ?? '?') . ')' . PHP_EOL);
			continue;
		}
		if (isset($id_by_name[$tool_name])) {
			fwrite(STDERR, "(!) Duplicate dd1340 record for tool '$tool_name' (section_id: " . ($section_id ?? '?') . '). Using the first.' . PHP_EOL);
			continue;
		}
		$id_by_name[$tool_name] = $section_id;
	}

// 3. Determine target tool directories.
	$dirs = array_filter((array)glob($tools_root . '/tool_*', GLOB_ONLYDIR), function($d){
		return basename($d) !== 'tool_common';
	});
	if ($tool_filter) {
		$dirs = array_filter($dirs, function($d) use($tool_filter){
			return basename($d) === $tool_filter;
		});
		if (empty($dirs)) {
			$fail("Tool directory not found: $tools_root/$tool_filter");
		}
	}

// 4. Generate / write.
	$stats = ['written' => 0, 'unchanged' => 0, 'changed' => 0, 'created' => 0, 'no_record' => 0];
	$used_names = [];

	foreach ($dirs as $dir) {
		$tool_name = basename($dir);

		if (!isset($id_by_name[$tool_name])) {
			$stats['no_record']++;
			fwrite(STDERR, "(!) No dd1340 record for tool directory '$tool_name' - register.json left untouched" . PHP_EOL);
			continue;
		}
		$used_names[$tool_name] = true;

		$record = read_raw_record($id_by_name[$tool_name]);
		if (!$record) {
			$stats['no_record']++;
			fwrite(STDERR, "(!) Could not read dd1340 record for '$tool_name' (section_id: " . $id_by_name[$tool_name] . ')' . PHP_EOL);
			continue;
		}

		$json = encode_register($record);

		if ($to_stdout) {
			echo $json . PHP_EOL;
			continue;
		}

		$file    = $dir . '/register.json';
		$current = is_file($file) ? file_get_contents($file) : null;
		$exists  = $current !== null && $current !== false;
		$same    = $exists && rtrim($current, "\n") === $json; // tolerate a stray trailing newline

		if ($same) {
			$stats['unchanged']++;
			echo "  =  $tool_name (no change)" . PHP_EOL;
			continue;
		}

		$label = $exists ? 'changed' : 'created';
		$stats[$label]++;

		if ($do_write) {
			if (file_put_contents($file, $json) === false) {
				$fail("Failed writing $file");
			}
			$stats['written']++;
			echo "  +  $tool_name ($label, written)" . PHP_EOL;
		} else {
			echo "  ~  $tool_name ($label, dry-run)" . PHP_EOL;
		}
	}

// 5. Report dd1340 records with no matching tool directory on disk.
	if (!$tool_filter) {
		foreach ($id_by_name as $name => $section_id) {
			if (!isset($used_names[$name])) {
				fwrite(STDERR, "(!) dd1340 record '$name' (section_id: " . ($section_id ?? '?') . ') has no tool directory on disk' . PHP_EOL);
			}
		}
	}

	if (!$to_stdout) {
		echo PHP_EOL . 'Summary: '
			. $stats['changed'] . ' changed, '
			. $stats['created'] . ' created, '
			. $stats['unchanged'] . ' unchanged, '
			. $stats['no_record'] . ' without DB record'
			. ($do_write ? ' (' . $stats['written'] . ' files written).' : ' (dry-run; re-run with --write to apply).')
			. PHP_EOL;
	}

exit(0);
