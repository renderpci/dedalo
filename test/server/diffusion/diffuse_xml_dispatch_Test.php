<?php declare(strict_types=1);
require_once dirname(dirname(__FILE__)) . '/bootstrap.php';
require_once __DIR__ . '/class.diffusion_test_helper.php';

/**
* DIFFUSE_XML_DISPATCH_TEST
* DIFFU-11: coverage for the XML diffusion publish dispatch and delete
* propagation added by the 2026-06 audit fixes (DIFFU-01 / DIFFU-02). The pure
* file-naming / delete-file logic of diffusion_xml itself is covered by
* diffusion_xml_Test; this file exercises the dd_diffusion_api dispatcher and the
* diffusion_delete execution switch that route to it.
*/
final class diffuse_xml_dispatch_Test extends BaseTestCase {

	private const FABRICATED_ID = 99900181;

	protected function setUp(): void {
		parent::setUp();
		$this->user_login();
	}



	/**
	* TEST_DIFFUSE_XML_METHOD_EXISTS (DIFFU-01)
	* The XML publish dispatcher must exist and mirror diffuse_rdf's signature.
	* Before the fix diffuse() routed the 'xml' type to an undefined
	* dd_diffusion_api::diffuse_xml, fataling for every xml element (and the
	* resulting Error escaped the catch(Exception) handler — see DIFFU-03).
	* Deterministic: no ontology required.
	* @return void
	*/
	public function test_diffuse_xml_method_exists() : void {

		$this->assertTrue(
			method_exists('dd_diffusion_api', 'diffuse_xml'),
			'dd_diffusion_api::diffuse_xml must exist (DIFFU-01)'
		);

		$rdf = new ReflectionMethod('dd_diffusion_api', 'diffuse_rdf');
		$xml = new ReflectionMethod('dd_diffusion_api', 'diffuse_xml');
		$this->assertSame(
			$rdf->getNumberOfParameters(),
			$xml->getNumberOfParameters(),
			'diffuse_xml must mirror diffuse_rdf parameter arity'
		);
	}//end test_diffuse_xml_method_exists



	/**
	* TEST_DELETE_PROPAGATES_XML (DIFFU-02, ontology-guarded)
	* Deleting a record whose diffusion element is xml must ROUTE the xml element
	* through its execution-switch case (idempotent unlink of the published file),
	* not silently skip it. Before the fix 'xml' fell into the switch default
	* (`continue 2`) and was dropped — leaving orphaned published XML on disk.
	* @return void
	*/
	public function test_delete_propagates_xml() : void {

		$config = diffusion_test_helper::require_xml_ontology($this);

		$response = diffusion_delete::delete_record($config->section_tipo, self::FABRICATED_ID);

		$this->assertIsObject($response);

		// The xml element must appear among the processed (deleted) or pending
		// entries — i.e. it was routed through a case, not the default skip. An
		// idempotent (already-gone) delete lands in ar_deleted; an unreachable
		// engine lands in ar_pending. Either proves the case is wired.
		$processed = array_merge((array)$response->ar_deleted, (array)$response->ar_pending);
		$xml_entries = array_filter(
			$processed,
			static fn($e) => is_object($e) && ($e->type ?? null) === 'xml'
		);
		$this->assertNotEmpty(
			$xml_entries,
			'delete_record must route the xml element through its switch case (DIFFU-02), not the default skip'
		);
	}//end test_delete_propagates_xml



}//end class diffuse_xml_dispatch_Test
