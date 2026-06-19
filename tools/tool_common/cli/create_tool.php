<?php declare(strict_types=1);
/**
* CREATE_TOOL
* CLI scaffolder for new Dédalo tools.
*
* Copies tools/tool_dev_template as a new tool directory, renames every file
* and identifier, and writes a minimal v7 register.json. Optionally registers
* the tool immediately.
*
* HOW IT WORKS
* 1. Validates --name (must match ^tool_[a-z0-9_]+$) and --label.
* 2. Recursively copies tools/tool_dev_template/ into <tools_root>/<name>/,
*    substituting 'tool_dev_template' → <name> and 'TOOL_DEV_TEMPLATE' →
*    <NAME> in every text file's content and in every path component.
*    register.json from the template is skipped; a fresh one is generated
*    (step 3) so the scaffolded metadata always matches the v7 authoring schema
*    (tools/tool_common/register.schema.json).
* 3. Generates register.json with the v7 authoring format:
*    - $schema points to register.schema.json (relative for in-repo installs,
*      absolute for --path targets outside the repo).
*    - affected_models controls show_in_component / show_in_inspector placement:
*      a tool targeting 'section' appears in the section inspector; otherwise
*      it appears in component dropdowns.
*    - properties.open_as defaults to 'modal'; edit after scaffolding if the
*      tool should open as a full window instead.
*    - labels carries four placeholder strings that wire up to the JS i18n
*      helper; replace or extend them in register.json before distribution.
* 4. If --register is passed, boots config.php and calls
*    tools_register::import_tools(), which scans all tool roots and writes
*    registry records into the 'Registered Tools' section (dd1324).
*    Registration requires an authenticated session; the script synthesises a
*    synthetic superuser session when none exists (safe: CLI access already
*    implies server-level trust).
*
* SECURITY NOTES
* - The generated tool is NOT callable until it has been registered AND
*   authorised through a user profile (System administration > Profiles > Tools).
* - Registration only discovers the tool; it does not authorise any user.
* - The synthetic session injected during --register is session-scoped (no DB
*   write); it mirrors the pattern used by the installer.
*
* RELATIONSHIPS
* - Template source : tools/tool_dev_template/
* - Schema enforced : tools/tool_common/register.schema.json
* - Registration    : tools/tool_common/class.tools_register.php::import_tools()
* - Multi-root rule : tools/tool_common/class.tool_paths.php::get_roots()
*   (--path must be an already-configured additional root for --register to find
*   the new tool; in-repo default always works without further configuration)
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
*
* @package Dédalo
* @subpackage Tools
*/

// CLI only
// Reject web SAPI early so the script is never accidentally exposed via a
// misconfigured web server; PHP_SAPI is 'cli' for all command-line invocations.
if (PHP_SAPI !== 'cli') {
	echo 'This script must be run from the command line' . PHP_EOL;
	exit(1);
}

// Parse long-form options.
// 'name:', 'label:'         → value required
// 'models::', 'path::'      → value optional (double colon = optional value)
// 'register', 'help'        → flags (no value)
$options = getopt('', ['name:', 'label:', 'models::', 'path::', 'register', 'help']);

// Print help: extract the opening doc-comment (everything up to and including
// the closing '*/') from this file's own source, then exit cleanly.
// The offset +2 skips past the '*/' characters themselves so the output ends
// exactly at the closing delimiter line.
if (isset($options['help']) || empty($options)) {
	echo file_get_contents(__FILE__, false, null, 0, (int)strpos(file_get_contents(__FILE__), '*/') + 2) . PHP_EOL;
	exit(0);
}

// Reusable error handler: writes to STDERR and exits with code 1 (failure).
// Using a closure keeps the function local to this script — no global namespace
// pollution — and allows passing it around if needed in future.
$fail = function(string $msg) : void {
	fwrite(STDERR, 'Error: ' . $msg . PHP_EOL);
	exit(1);
};

// name
// The name becomes the directory name, class name, and the prefix used in
// every PHP/JS file inside the tool. The regex enforces the Dédalo tool
// naming convention: all lowercase ASCII, underscores only, prefixed 'tool_'.
// tool_common and tool_dev_template are infrastructure — never overwrite them.
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
// The label is written into register.json under 'lg-eng' and displayed in the
// Dédalo UI. It must be a non-empty string; further translations are added
// manually to register.json after scaffolding.
	$label = $options['label'] ?? null;
	if (empty($label) || !is_string($label)) {
		$fail('--label is required, e.g. --label="My tool"');
	}

// models
// Comma-separated list of Dédalo model names the tool can act on.
// array_filter removes empty strings produced by trailing commas or spaces.
// Default 'section' places the tool in the section inspector; supply a
// component model (e.g. 'component_input_text') to add it to component menus.
	$models = array_values(array_filter(array_map('trim', explode(',', (string)($options['models'] ?? 'section')))));

// paths
// Resolve the Dédalo repository root by walking four levels up from this file:
//   tools/tool_common/cli/create_tool.php  →  [root]
// dirname level 4: create_tool.php → cli → tool_common → tools → [root]
	$root_path		= dirname(__FILE__, 4); // Dédalo root (this file: /tools/tool_common/cli/create_tool.php)

// boot Dédalo BEFORE any output when registration is requested: the session
// bootstrap in config emits header warnings once anything has been printed.
// (!) config.php must be loaded before any echo/fwrite because the PHP session
// started therein may try to send HTTP headers.
	if (isset($options['register'])) {
		require_once $root_path . '/config/config.php';

		// CLI superuser context: registering writes registry records (dd1324),
		// which requires an authenticated session. Shell access to the server
		// already implies full trust (same model as the installer).
		// DEDALO_SUPERUSER is typically -1 (see config constants); 'cli' is a
		// placeholder username used only for audit logging in this context.
		// The synthetic session is NOT persisted to storage — it lives only for
		// this process lifetime and carries no privileges beyond the current run.
		if (login::is_logged() !== true) {
			$_SESSION['dedalo']['auth']['user_id']		= DEDALO_SUPERUSER;
			$_SESSION['dedalo']['auth']['username']		= 'cli';
			$_SESSION['dedalo']['auth']['is_logged']	= 1;
			$_SESSION['dedalo']['auth']['salt_secure']	= bin2hex(random_bytes(16));
		}
	}
	// Resolve absolute paths for source template, chosen tools root, and output dir.
	// --path overrides the default in-repo /tools directory; trailing slash is stripped
	// to avoid double-slash in concatenated sub-paths.
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

// copy + rename. Skip register.json (generated below), source maps and OS noise.
// register.json is skipped because a fresh one is generated below with the
// caller-supplied metadata, which would differ from the template's placeholder.
// .map files and .DS_Store are excluded as build/OS noise with no runtime value.
	$skip = function(string $file) : bool {
		$base = basename($file);
		return $base === 'register.json'
			|| $base === '.DS_Store'
			|| str_ends_with($base, '.map');
	};

	// SELF_FIRST mode visits directories before their children so that
	// mkdir() calls for parent directories happen before child file writes.
	$iterator = new RecursiveIteratorIterator(
		new RecursiveDirectoryIterator($template_dir, FilesystemIterator::SKIP_DOTS),
		RecursiveIteratorIterator::SELF_FIRST
	);

	mkdir($target_dir, 0755, true);
	$created_files = [];
	foreach ($iterator as $item) {
		$source_path	= $item->getPathname();
		// Strip the template root prefix (+1 for the directory separator) to
		// get a path fragment relative to the template root, e.g. 'js/tool_dev_template.js'.
		$relative		= substr($source_path, strlen($template_dir) + 1);
		// rename path fragments
		// Replace the template name in directory/file names to derive the
		// target path, e.g. 'js/tool_dev_template.js' → 'js/tool_myorg_mytool.js'.
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
		// binary-safe: only rewrite identifiers in text files.
		// Binary files (images, fonts, compiled assets) are copied verbatim to
		// avoid corrupting them; identifier substitution only applies to the
		// extensions where 'tool_dev_template' appears as a string literal.
		// Two passes: lowercase for class/function/file names, uppercase for
		// PHP constants (e.g. TOOL_DEV_TEMPLATE_MY_CONST → TOOL_MYORG_MYTOOL_MY_CONST).
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
// Builds the minimal valid v7 register.json for this tool.
// Key field notes:
//   $schema       : relative path for in-repo installs (sibling tool_common/);
//                   absolute path for --path tools outside the repo so JSON
//                   schema validators can still resolve it.
//   show_in_component / show_in_inspector : mutually exclusive placement flags
//                   derived from affected_models. A tool targeting 'section'
//                   appears in the section inspector sidebar; otherwise it
//                   appears in component context menus.
//   properties    : open_as 'modal' is the default; change to 'window' for
//                   tools that need a resizable standalone window.
//                   windowFeatures passes raw window.open() feature strings
//                   when open_as is 'window' — null means browser default.
//   labels        : placeholder i18n strings wired to the JS tool_common
//                   get_label() helper; replace or extend after scaffolding.
//   developer     : populated from the OS user running the script via
//                   get_current_user(); purely informational metadata.
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
	// JSON_UNESCAPED_SLASHES keeps paths readable (avoids '\/' in schema path).
	// JSON_UNESCAPED_UNICODE preserves accented characters as-is (UTF-8 labels).
	file_put_contents(
		$register_file,
		json_encode($register, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . PHP_EOL
	);
	$created_files[] = $register_file;

echo 'Created tool: ' . $name . PHP_EOL;
echo '  directory: ' . $target_dir . PHP_EOL;
echo '  files: ' . count($created_files) . PHP_EOL;

// optional immediate registration
// import_tools() scans ALL tool roots (tool_paths::get_roots()) and writes
// or updates registry records in the 'Registered Tools' section (dd1324).
// The returned array contains one result object per discovered tool; we filter
// it to the newly created tool to report its assigned section_id or errors.
// (!) If --path points outside the in-repo tools root, that path must already
// be configured as an additional root via DEDALO_ADDITIONAL_TOOLS in config.php;
// otherwise import_tools() will not scan it and $own will be empty.
	if (isset($options['register'])) {
		echo PHP_EOL . 'Registering tools...' . PHP_EOL;

		$report = tools_register::import_tools();
		// Isolate the entry for the tool we just created; the report covers all tools.
		$own = array_values(array_filter($report, fn($el) => ($el->name ?? null) === $name));
		if (!empty($own) && ($own[0]->imported ?? false) === true) {
			echo "Registered '$name' with section_id " . ($own[0]->section_id ?? '?') . PHP_EOL;
		} else {
			// Two distinct failure cases:
			// - empty($own) : the tool root was not scanned (misconfigured path or
			//   --path not in DEDALO_ADDITIONAL_TOOLS).
			// - non-empty but imported===false : the section_record save failed
			//   (DB error, permission, or validation); detailed errors are in the
			//   debug log (dedalo_debug_log in config).
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
