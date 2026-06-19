<?php declare(strict_types=1);
/**
* DIFFUSION_TEST_HELPER
* Shared guards and cleanup utilities for the diffusion test suite.
*
* The PHP diffusion tests run against the seeded local database (full
* ontology). On databases whose ontology lags (e.g. the CI install dump
* without the diffusion domain or the dd1767/dd1774 activity action
* components), the guards skip the tests with an explanatory message
* instead of failing.
*/
class diffusion_test_helper {



	/**
	* REQUIRE_DIFFUSION_ONTOLOGY
	* Skips the running test unless the ontology defines at least one usable
	* SQL diffusion element targeting a resolvable section.
	* @param PHPUnit\Framework\TestCase $test
	* @return object {element_tipo: string, section_tipo: string, database_name: string|null}
	*/
	public static function require_diffusion_ontology( PHPUnit\Framework\TestCase $test ) : object {

		$ar_elements = diffusion_utils::get_ar_diffusion_map_elements();

		foreach ($ar_elements as $element) {

			if (($element->type ?? null)!=='sql') {
				continue;
			}

			$ar_sections = diffusion_utils::get_diffusion_sections_from_diffusion_element($element->element_tipo);
			if (empty($ar_sections)) {
				continue;
			}

			return (object)[
				'element_tipo'	=> $element->element_tipo,
				'section_tipo'	=> reset($ar_sections),
				'sections'		=> $ar_sections,
				'database_name'	=> $element->database_name ?? null
			];
		}

		$test->markTestSkipped(
			'Diffusion ontology prerequisite missing: no usable SQL diffusion element '
			. 'with resolvable sections found in this database (seed the diffusion ontology to enable this test).'
		);
	}//end require_diffusion_ontology



	/**
	* REQUIRE_RDF_ONTOLOGY
	* Skips the running test unless an RDF diffusion element exists.
	* @param PHPUnit\Framework\TestCase $test
	* @return object {element_tipo: string, section_tipo: string}
	*/
	public static function require_rdf_ontology( PHPUnit\Framework\TestCase $test ) : object {

		$ar_elements = diffusion_utils::get_ar_diffusion_map_elements();

		foreach ($ar_elements as $element) {

			if (($element->type ?? null)!=='rdf') {
				continue;
			}

			$ar_sections = diffusion_utils::get_diffusion_sections_from_diffusion_element($element->element_tipo);
			if (empty($ar_sections)) {
				continue;
			}

			// the element must be fully configured (service_name + owl:Class):
			// unconfigured elements resolve no file path (run the 'validate'
			// API action to find them) and cannot exercise the file tests
			foreach ($ar_sections as $section_tipo) {
				$file_info = diffusion_rdf::get_record_file_path($element->element_tipo, $section_tipo, 0);
				if ($file_info!==null) {
					return (object)[
						'element_tipo'	=> $element->element_tipo,
						'section_tipo'	=> $section_tipo
					];
				}
			}
		}

		$test->markTestSkipped(
			'Diffusion ontology prerequisite missing: no fully-configured RDF diffusion element '
			. '(service_name + owl:Class with section relation) found in this database. '
			. "Run the 'validate' API action to locate the configuration gaps."
		);
	}//end require_rdf_ontology



	/**
	* REQUIRE_XML_ONTOLOGY
	* Skips the running test unless an XML diffusion element exists.
	* @param PHPUnit\Framework\TestCase $test
	* @return object {element_tipo: string, section_tipo: string}
	*/
	public static function require_xml_ontology( PHPUnit\Framework\TestCase $test ) : object {

		$ar_elements = diffusion_utils::get_ar_diffusion_map_elements();

		foreach ($ar_elements as $element) {

			if (($element->type ?? null)!=='xml') {
				continue;
			}

			$ar_sections = diffusion_utils::get_diffusion_sections_from_diffusion_element($element->element_tipo);
			if (empty($ar_sections)) {
				continue;
			}

			// the element must be fully configured (service_name):
			// unconfigured elements resolve no file path (run the 'validate'
			// API action to find them) and cannot exercise the file tests
			foreach ($ar_sections as $section_tipo) {
				$file_info = diffusion_xml::get_record_file_path($element->element_tipo, $section_tipo, 0);
				if ($file_info!==null) {
					return (object)[
						'element_tipo'	=> $element->element_tipo,
						'section_tipo'	=> $section_tipo
					];
				}
			}
		}

		$test->markTestSkipped(
			'Diffusion ontology prerequisite missing: no fully-configured XML diffusion element '
			. '(service_name) found in this database. '
			. "Run the 'validate' API action to locate the configuration gaps."
		);
	}//end require_xml_ontology



	/**
	* REQUIRE_MARKDOWN_ONTOLOGY
	* Skips the running test unless a fully-configured Markdown diffusion element
	* exists (service_name resolvable into a file path).
	* @param PHPUnit\Framework\TestCase $test
	* @return object {element_tipo: string, section_tipo: string}
	*/
	public static function require_markdown_ontology( PHPUnit\Framework\TestCase $test ) : object {

		require_once DEDALO_DIFFUSION_PATH . '/class.diffusion_markdown.php';

		$ar_elements = diffusion_utils::get_ar_diffusion_map_elements();

		foreach ($ar_elements as $element) {

			if (($element->type ?? null)!=='markdown') {
				continue;
			}

			$ar_sections = diffusion_utils::get_diffusion_sections_from_diffusion_element($element->element_tipo);
			if (empty($ar_sections)) {
				continue;
			}

			// the element must be fully configured (service_name): unconfigured
			// elements resolve no file path (run the 'validate' API action to find them)
			foreach ($ar_sections as $section_tipo) {
				$file_info = diffusion_markdown::get_record_file_path($element->element_tipo, $section_tipo, 0);
				if ($file_info!==null) {
					return (object)[
						'element_tipo'	=> $element->element_tipo,
						'section_tipo'	=> $section_tipo
					];
				}
			}
		}

		$test->markTestSkipped(
			'Diffusion ontology prerequisite missing: no fully-configured Markdown diffusion element '
			. '(service_name) found in this database. '
			. "Run the 'validate' API action to locate the configuration gaps."
		);
	}//end require_markdown_ontology



	/**
	* REQUIRE_ACTIVITY_ACTION_ONTOLOGY
	* Skips the running test unless the dd1758 activity action component
	* (dd1767 → value list dd1774) exists in the ontology.
	* @param PHPUnit\Framework\TestCase $test
	* @return void
	*/
	public static function require_activity_action_ontology( PHPUnit\Framework\TestCase $test ) : void {

		$model = ontology_node::get_model_by_tipo(diffusion_activity_logger::ACTION_TIPO);

		if (empty($model)) {
			$test->markTestSkipped(
				'Diffusion ontology prerequisite missing: activity action component '
				. diffusion_activity_logger::ACTION_TIPO . ' (→ '
				. diffusion_activity_logger::ACTION_SECTION_TIPO . ') is not in this ontology. '
				. 'Update the ontology / install dump to enable this test.'
			);
		}
	}//end require_activity_action_ontology



	/**
	* ACTIVITY_BASELINE
	* Captures the current max section_id of matrix_activity_diffusion so the
	* rows created during a test can be removed precisely afterwards.
	* @return int
	*/
	public static function activity_baseline() : int {

		$conn	= DBi::_getConnection();
		$result	= pg_query($conn, 'SELECT COALESCE(MAX(section_id), 0) AS max_id FROM matrix_activity_diffusion');
		$row	= pg_fetch_object($result);

		return (int)($row->max_id ?? 0);
	}//end activity_baseline



	/**
	* CLEANUP_ACTIVITY_ROWS
	* Deletes the matrix_activity_diffusion rows created after the baseline.
	* @param int $baseline
	* @return void
	*/
	public static function cleanup_activity_rows( int $baseline ) : void {

		$conn = DBi::_getConnection();
		pg_query_params(
			$conn,
			'DELETE FROM matrix_activity_diffusion WHERE section_id > $1',
			[$baseline]
		);
	}//end cleanup_activity_rows



}//end class diffusion_test_helper
