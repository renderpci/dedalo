<?php declare(strict_types=1);
/**
* CREATE_TOOL
* CLI scaffolder for new Dédalo tools.
*
* Copies tools/tool_dev_template as a new tool directory, renames every file
* and identifier, and writes a minimal v7 register.json. Optionally registers
* the tool immediately.
*
* Usage:
*   php tools/tool_common/cli/create_tool.php --name=tool_myorg_mytool --label="My tool"
*
* Options:
*   --name=tool_x      (required) tool name: ^tool_[a-z0-9_]+$ ; becomes the
*                      directory, class and JS file names
*   --label="X"        (required) display label (stored as lg-eng; add more
*                      languages later in register.json)
*   --models=a,b       comma-separated affected models
*                      (e.g. section,component_input_text). Default: section
*   --path=/abs/dir    target tools root. Default: the in-repo /tools directory
*   --register         after scaffolding, boot Dédalo and run
*                      tools_register::import_tools()
*   --help             this help
*/

// CLI only
if (PHP_SAPI !== 'cli') {
	echo 'This script must be run from the command line' . PHP_EOL;
	exit(1);
}

$options = getopt('', ['name:', 'label:', 'models::', 'path::', 'register', 'help']);

if (isset($options['help']) || empty($options)) {
	echo file_get_contents(__FILE__, false, null, 0, (int)strpos(file_get_contents(__FILE__), '*/') + 2) . PHP_EOL;
	exit(0);
}

$fail = function(string $msg) : void {
	fwrite(STDERR, 'Error: ' . $msg . PHP_EOL);
	exit(1);
};

// name
	$name = $options['name'] ?? null;
	if (empty($name) || !is_string($name)) {
		$fail('--name is required, e.g. --name=tool_myorg_mytool');
	}
	if (preg_match('/^tool_[a-z0-9_]+$/', $name) !== 1) {
		$fail("invalid tool name '$name': must match ^tool_[a-z0-9_]+$ (snake_case, lowercase ASCII)");
	}
	if ($name === 'tool_common' || $name === 'tool_dev_template') {
		$fail("'$name' is reserved");
	}

// label
	$label = $options['label'] ?? null;
	if (empty($label) || !is_string($label)) {
		$fail('--label is required, e.g. --label="My tool"');
	}

// models
	$models = array_values(array_filter(array_map('trim', explode(',', (string)($options['models'] ?? 'section')))));

// paths
	$root_path		= dirname(__FILE__, 4); // Dédalo root (this file: /tools/tool_common/cli/create_tool.php)

// boot Dédalo BEFORE any output when registration is requested: the session
// bootstrap in config emits header warnings once anything has been printed
	if (isset($options['register'])) {
		require_once $root_path . '/config/config.php';

		// CLI superuser context: registering writes registry records (dd1324),
		// which requires an authenticated session. Shell access to the server
		// already implies full trust (same model as the installer).
		if (login::is_logged() !== true) {
			$_SESSION['dedalo']['auth']['user_id']		= DEDALO_SUPERUSER;
			$_SESSION['dedalo']['auth']['username']		= 'cli';
			$_SESSION['dedalo']['auth']['is_logged']	= 1;
			$_SESSION['dedalo']['auth']['salt_secure']	= bin2hex(random_bytes(16));
		}
	}
	$template_dir	= $root_path . '/tools/tool_dev_template';
	$tools_root		= isset($options['path']) ? rtrim((string)$options['path'], '/') : $root_path . '/tools';
	$target_dir		= $tools_root . '/' . $name;

	if (!is_dir($template_dir)) {
		$fail("template not found: $template_dir");
	}
	if (!is_dir($tools_root)) {
		$fail("tools root not found: $tools_root");
	}
	if (is_dir($target_dir)) {
		$fail("target directory already exists: $target_dir");
	}

// copy + rename. Skip register.json (generated below), source maps and OS noise
	$skip = function(string $file) : bool {
		$base = basename($file);
		return $base === 'register.json'
			|| $base === '.DS_Store'
			|| str_ends_with($base, '.map');
	};

	$iterator = new RecursiveIteratorIterator(
		new RecursiveDirectoryIterator($template_dir, FilesystemIterator::SKIP_DOTS),
		RecursiveIteratorIterator::SELF_FIRST
	);

	mkdir($target_dir, 0755, true);
	$created_files = [];
	foreach ($iterator as $item) {
		$source_path	= $item->getPathname();
		$relative		= substr($source_path, strlen($template_dir) + 1);
		// rename path fragments
		$target_relative = str_replace('tool_dev_template', $name, $relative);
		$target_path	 = $target_dir . '/' . $target_relative;

		if ($item->isDir()) {
			if (!is_dir($target_path)) {
				mkdir($target_path, 0755, true);
			}
			continue;
		}
		if ($skip($source_path)) {
			continue;
		}

		$content = file_get_contents($source_path);
		// binary-safe: only rewrite identifiers in text files
		$text_extensions = ['php','js','css','less','json','md','svg','txt'];
		$extension = strtolower(pathinfo($source_path, PATHINFO_EXTENSION));
		if (in_array($extension, $text_extensions, true)) {
			$content = str_replace('tool_dev_template', $name, $content);
			$content = str_replace('TOOL_DEV_TEMPLATE', strtoupper($name), $content);
		}
		file_put_contents($target_path, $content);
		$created_files[] = $target_path;
	}

// register.json (v7 authoring format)
	$register = [
		'$schema'				=> ($tools_root === $root_path . '/tools')
			? '../tool_common/register.schema.json'
			: $root_path . '/tools/tool_common/register.schema.json',
		'name'					=> $name,
		'version'				=> '1.0.0',
		'label'					=> ['lg-eng' => $label],
		'developer'				=> get_current_user(),
		'dedalo_version_min'	=> '7.0.0',
		'affected_models'		=> $models,
		'show_in_component'		=> in_array('section', $models, true) === false,
		'show_in_inspector'		=> in_array('section', $models, true),
		'active'				=> true,
		'properties'			=> ['open_as' => 'modal', 'windowFeatures' => null],
		'labels'				=> [
			['lang' => 'lg-eng', 'name' => 'my_first_label',    'value' => 'My first label'],
			['lang' => 'lg-eng', 'name' => 'my_second_label',   'value' => 'My second label'],
			['lang' => 'lg-eng', 'name' => 'upload_file',       'value' => 'Upload generic file'],
			['lang' => 'lg-eng', 'name' => 'upload_image_file', 'value' => 'Upload image file']
		]
	];
	$register_file = $target_dir . '/register.json';
	file_put_contents(
		$register_file,
		json_encode($register, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . PHP_EOL
	);
	$created_files[] = $register_file;

echo 'Created tool: ' . $name . PHP_EOL;
echo '  directory: ' . $target_dir . PHP_EOL;
echo '  files: ' . count($created_files) . PHP_EOL;

// optional immediate registration
	if (isset($options['register'])) {
		echo PHP_EOL . 'Registering tools...' . PHP_EOL;

		$report = tools_register::import_tools();
		$own = array_values(array_filter($report, fn($el) => ($el->name ?? null) === $name));
		if (!empty($own) && ($own[0]->imported ?? false) === true) {
			echo "Registered '$name' with section_id " . ($own[0]->section_id ?? '?') . PHP_EOL;
		} else {
			$errors = empty($own)
				? ['tool not present in import report (is the target path scanned by tools_register?)']
				: ($own[0]->errors ?? ['registry record save failed (see debug log)']);
			fwrite(STDERR, "Registration failed for '$name':" . PHP_EOL . '  - ' . implode(PHP_EOL . '  - ', $errors) . PHP_EOL);
			exit(1);
		}
	}

// next steps
	echo PHP_EOL . 'Next steps:' . PHP_EOL;
	if (!isset($options['register'])) {
		echo '  1. Register the tool: System administration > Maintenance > "Register tools"' . PHP_EOL;
		echo '     (or re-run this script with --register)' . PHP_EOL;
	} else {
		echo '  1. (registered)' . PHP_EOL;
	}
	echo '  2. Authorize the tool for user profiles: System administration > Profiles > Tools' . PHP_EOL;
	echo '  3. Edit ' . $name . '/register.json (labels, affected_models, properties)' . PHP_EOL;
	echo '  4. Implement your actions in class.' . $name . '.php (API_ACTIONS map) and js/' . $name . '.js' . PHP_EOL;
	echo '  5. Docs: docs/development/tools/' . PHP_EOL;

exit(0);
