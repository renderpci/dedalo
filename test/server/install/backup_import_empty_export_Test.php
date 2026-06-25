<?php declare(strict_types=1);
// bootstrap
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';

// Include backup class under test
require_once DEDALO_CORE_PATH . '/backup/class.backup.php';


/**
* BACKUP_IMPORT_EMPTY_EXPORT_TEST
* Regression guard for the empty-hierarchy import bug.
*
* Several shipped hierarchies are legitimately empty (e.g. 'ad' / Andorra and
* ~14 others): their install/import/hierarchy/<tld>1.copy.gz file gzip-
* decompresses to 0 bytes. backup::import_from_copy_file() used to reject any
* 0-byte decompressed file with "Error. Uncompressed file was not created or is
* empty", which made install_hierarchies() abort (and never activate) the
* hierarchy. An empty export carries no rows and must import as a no-op success.
*
* This path runs entirely before any psql call, so it needs no database.
*/
final class backup_import_empty_export_Test extends BaseTestCase {


	/**
	* Build a .copy.gz that decompresses to 0 bytes and return its path.
	* @return string absolute path to the temporary empty .copy.gz
	*/
	private function make_empty_copy_gz(): string {

		$dir   = sys_get_temp_dir();
		$plain = $dir . '/dedalo_empty_export_' . getmypid() . '.copy';
		$gz    = $plain . '.gz';

		// fresh state
		@unlink($plain);
		@unlink($gz);

		file_put_contents($plain, '');           // 0-byte payload
		exec('gzip -kf ' . escapeshellarg($plain));
		@unlink($plain);                          // keep only the .gz, like the shipped files

		return $gz;
	}//end make_empty_copy_gz


	/**
	* TEST_empty_export_imports_as_success
	* A 0-byte decompressed export must return result=true (no-op import),
	* not the legacy "Uncompressed file was not created or is empty" error.
	* @return void
	*/
	public function test_empty_export_imports_as_success(): void {

		$gz = $this->make_empty_copy_gz();

		$options = (object)[
			'section_tipo' => 'ad1',
			'file_path'    => $gz,
			'matrix_table' => 'matrix_hierarchy',
			// explicit columns so the test never depends on matrix_db_manager defaults
			'columns'      => ['id','section_id','section_tipo','datos']
		];

		$response = backup::import_from_copy_file($options);

		// cleanup any artifacts (the import removes the uncompressed file on success)
		@unlink($gz);
		@unlink(preg_replace('/\.gz$/', '', $gz));

		$this->assertIsObject($response);
		$this->assertTrue($response->result, 'Empty export must import as a no-op success');
		$this->assertStringNotContainsStringIgnoringCase(
			'not created or is empty',
			$response->msg,
			'Empty export must not be reported as the legacy fatal error'
		);
	}//end test_empty_export_imports_as_success


	/**
	* TEST_empty_export_leaves_no_uncompressed_file
	* On the empty-export path the temporary uncompressed file gunzip --keep
	* created must be cleaned up (no leftover next to the .gz).
	* @return void
	*/
	public function test_empty_export_leaves_no_uncompressed_file(): void {

		$gz         = $this->make_empty_copy_gz();
		$plain_path = preg_replace('/\.gz$/', '', $gz);

		$options = (object)[
			'section_tipo' => 'ad1',
			'file_path'    => $gz,
			'matrix_table' => 'matrix_hierarchy',
			'columns'      => ['id','section_id','section_tipo','datos']
		];

		backup::import_from_copy_file($options);

		$leftover = file_exists($plain_path);

		// cleanup
		@unlink($gz);
		@unlink($plain_path);

		$this->assertFalse($leftover, 'Empty-export import must not leave an uncompressed leftover file');
	}//end test_empty_export_leaves_no_uncompressed_file


}//end class backup_import_empty_export_Test
