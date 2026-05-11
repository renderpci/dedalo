<?php declare(strict_types=1);
// SEC-026 (§9.3): server-agnostic deny for direct HTTP access. This file is
// included by common::get_json() inside the calling object scope; reaching
// it through a URL means the web server config did not block the path.
// Fail closed regardless of server (Apache / nginx / Caddy / lighttpd / IIS)
// or display_errors mode. The .htaccess <FilesMatch> rule is layer 1.
if (!isset($this)) { http_response_code(404); exit; }
/** @var component_relation_related $this */
// JSON data component controller



// component configuration vars
	$permissions	= $this->get_component_permissions();
	$mode			= $this->get_mode();
	$tipo			= $this->get_tipo();



// data
	$context	= [];
	$data		= [];

	// context
		$this->context = $this->get_structure_context(
			$permissions,
			true // bool add_request_config
		);

		// properties update : show_interface set as false to prevent + button creation in client
		$properties = $this->context->properties ?? new stdClass();
		$properties->show_interface = $properties->show_interface ?? new stdClass();
		$properties->show_interface->button_add = false;
		$this->context->properties = $properties;

		$context[] = $this->context;


	if($permissions>0) {

		$start_time=start_time();

		// short vars
			$section_id	= $this->get_section_id();
			$limit		= $this->pagination?->limit ?? null;
			$offset		= $this->pagination?->offset ?? 0;

		// value. Get the data into DDBB
			$data_entries = $this->get_data() ?? [];
			$value        = $this->get_data_paginated( $limit ) ?? [];

		// data item. Main item representing this component instance.
		// Must be available even when empty to allow adding references from client.
			$item = $this->get_data_item($value);
				$item->parent_tipo			= $tipo;
				$item->parent_section_id	= $section_id;
				// fix pagination vars
				$pagination = new stdClass();
					$pagination->total	= count($data_entries);
					$pagination->limit	= $limit;
					$pagination->offset	= $offset;
				$item->pagination = $pagination;

		// subdatum: resolve related sections context and data (labels, etc.)
		// Merge subcontext (related components) and subdata (formatted values)
		// In 'list'/'tm' modes, inject parent_tipo/section_id into each subdata item.
			if (!empty($data_entries)) {

				// subdatum
					$subdatum = $this->get_subdatum($tipo, $value);

					// subcontext add
					$ar_subcontext	= $subdatum->context;
					foreach ($ar_subcontext as $current_context) {
						$context[] = $current_context;
					}

					// subdata add
					$ar_subdata	= $subdatum->data;
					if ($mode==='list' || $mode==='tm') {
						foreach ($ar_subdata as $current_data) {
							$current_data->parent_tipo			= $tipo;
							$current_data->parent_section_id	= $section_id;
							$data[] = $current_data;
						}
					}else{
						foreach ($ar_subdata as $current_data) {
							$data[] = $current_data;
						}
					}
			}//end if (!empty($data_entries))

		// references: resolve bidirectional/multidirectional back-references
		// (sections that point TO current term). Skipped in search mode.
			if ($mode!=='search') {
				$references = $this->get_calculated_references();
				// references. Add to item if exists
				if (!empty($references)) {
					$item->references = $references;
				}
			}

		// debug
			if(SHOW_DEBUG===true) {
				metrics::add_metric('data_total_time', $start_time);
				metrics::add_metric('data_total_calls');
			}


		$data[] = $item;
	}//end if $permissions>0



// JSON string
	return common::build_element_json_output($context, $data);
