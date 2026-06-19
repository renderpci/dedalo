<?php declare(strict_types=1);
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';
require_once __DIR__ . '/class.diffusion_test_helper.php';
require_once DEDALO_DIFFUSION_PATH . '/class.diffusion_markdown.php';

/**
* DIFFUSION_MARKDOWN_TEST
* Deterministic Markdown file naming/delete (guarded: skips without a fully
* configured markdown element) + pure rendering logic: section-name header,
* YAML frontmatter, per-field blocks, translatable per-lang lines, relation
* links and empty-field skipping.
*/
final class diffusion_markdown_Test extends BaseTestCase {

	public static $model = 'diffusion_markdown';

	private const FABRICATED_ID = 99900181;

	protected function setUp(): void {
		parent::setUp();
		$this->user_login();
	}



	/**
	* TEST_GET_RECORD_FILE_PATH_DETERMINISTIC (guarded)
	*/
	public function test_get_record_file_path_deterministic(): void {

		$config = diffusion_test_helper::require_markdown_ontology($this);

		$file_info = diffusion_markdown::get_record_file_path($config->element_tipo, $config->section_tipo, self::FABRICATED_ID);

		$this->assertIsObject($file_info);
		$this->assertSame($config->section_tipo .'_'. self::FABRICATED_ID .'.md', $file_info->file_name);
		$this->assertSame('/markdown/'. $file_info->service_name .'/', $file_info->sub_path);
		$this->assertStringContainsString($file_info->file_name, $file_info->file_path);

		// determinism: same inputs, same path
		$file_info_2 = diffusion_markdown::get_record_file_path($config->element_tipo, $config->section_tipo, self::FABRICATED_ID);
		$this->assertSame($file_info->file_path, $file_info_2->file_path);
	}//end test_get_record_file_path_deterministic



	/**
	* TEST_DELETE_RECORD_FILE (guarded)
	* Idempotent + removes canonical and legacy flat variants.
	*/
	public function test_delete_record_file(): void {

		$config = diffusion_test_helper::require_markdown_ontology($this);

		// no file → idempotent success
		$response = diffusion_markdown::delete_record_file($config->element_tipo, $config->section_tipo, self::FABRICATED_ID);
		$this->assertTrue($response->result);
		$this->assertEmpty($response->deleted_files);

		// staged canonical + legacy flat variant → both removed
		$file_info = diffusion_markdown::get_record_file_path($config->element_tipo, $config->section_tipo, self::FABRICATED_ID);
		if (!is_dir(dirname($file_info->file_path))) {
			mkdir(dirname($file_info->file_path), 0777, true);
		}
		$legacy_dir = DEDALO_MEDIA_PATH . '/markdown';
		if (!is_dir($legacy_dir)) {
			mkdir($legacy_dir, 0777, true);
		}
		$legacy_path = $legacy_dir .'/'. $config->section_tipo .'_'. self::FABRICATED_ID .'_2024-01-01.md';

		file_put_contents($file_info->file_path, '# staged');
		file_put_contents($legacy_path, '# staged');

		$response = diffusion_markdown::delete_record_file($config->element_tipo, $config->section_tipo, self::FABRICATED_ID);
		$this->assertTrue($response->result);
		$this->assertFileDoesNotExist($file_info->file_path, 'Canonical file not removed');
		$this->assertFileDoesNotExist($legacy_path, 'Legacy flat variant not removed');
	}//end test_delete_record_file



	/**
	* TEST_RENDER_RECORD (pure)
	* Section-name header + frontmatter + per-field blocks; translatable values
	* split per lang; relation fields show value + link; empty fields skipped.
	*/
	public function test_render_record(): void {

		$context = [
			(object)['term' => 'Title',  'tipo' => 'dd910', 'model' => 'diffusion_field'],
			(object)['term' => 'Author', 'tipo' => 'dd911', 'model' => 'diffusion_field'],
			(object)['term' => 'Empty',  'tipo' => 'dd912', 'model' => 'diffusion_field']
		];

		$fields = new stdClass();
			// translatable literal
			$fields->dd910 = [(object)[
				'tipo'		=> 'rsc910',
				'lang'		=> 'lg-eng',
				'entries'	=> [(object)['value' => 'My Title']],
				'id'		=> null
			]];
			// relation (carries related record identity → link)
			$fields->dd911 = [(object)[
				'tipo'			=> 'rsc911',
				'lang'			=> null,
				'entries'		=> [(object)['value' => 'Jane Doe']],
				'id'			=> null,
				'section_tipo'	=> 'rsc197',
				'section_id'	=> 42
			]];
			// empty → skipped
			$fields->dd912 = [(object)[
				'tipo'		=> 'rsc912',
				'lang'		=> null,
				'entries'	=> [(object)['value' => '']],
				'id'		=> null
			]];

		$markdown = diffusion_markdown::render_record((object)[
			'section_tipo'			 => 'rsc1',
			'section_id'			 => 5,
			'context'				 => $context,
			'fields'				 => $fields,
			'diffusion_element_tipo' => 'dd1'
		]);

		// frontmatter
		$this->assertStringContainsString('section_tipo: "rsc1"', $markdown);
		$this->assertStringContainsString('section_id: "5"', $markdown);
		$this->assertStringContainsString('diffusion_element: "dd1"', $markdown);

		// section name header (always present)
		$this->assertStringContainsString("\n# ", "\n".$markdown);

		// field blocks
		$this->assertStringContainsString('## Title', $markdown);
		$this->assertStringContainsString('My Title', $markdown);
		$this->assertStringContainsString('## Author', $markdown);

		// relation: flattened value + link to the related record .md
		$this->assertStringContainsString('Jane Doe', $markdown);
		$this->assertStringContainsString('(rsc197_42.md)', $markdown);

		// empty field skipped
		$this->assertStringNotContainsString('## Empty', $markdown);
	}//end test_render_record



	/**
	* TEST_SANITIZE_MD_VALUE (pure)
	* Line-leading ATX headers and lone "---" are escaped; readable text kept.
	*/
	public function test_sanitize_md_value(): void {

		$escaped_header = PHPUnitUtil::callMethod(new diffusion_markdown(), 'sanitize_md_value', ['# not a heading']);
		$this->assertStringStartsWith('\\#', $escaped_header);

		$plain = PHPUnitUtil::callMethod(new diffusion_markdown(), 'sanitize_md_value', ['just text']);
		$this->assertSame('just text', $plain);
	}//end test_sanitize_md_value



}//end class diffusion_markdown_Test
