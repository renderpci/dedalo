<?php
#
# UPDATES CONTROL
#
global $updates;
$updates = new stdClass();



$v=621; #####################################################################################
$updates->$v = new stdClass();

	# UPDATE TO
	$updates->$v->version_major			= 6;
	$updates->$v->version_medium		= 2;
	$updates->$v->version_minor			= 1;

	# MINIMUM UPDATE FROM
	$updates->$v->update_from_major		= 6;
	$updates->$v->update_from_medium	= 2;
	$updates->$v->update_from_minor		= 0;

	// alert
		$alert					= new stdClass();
		$alert->notification	= 'V '.$v;

		$alert->command			= "
			<h1>🧐 WARNING! Before apply this update:</h1>
			<br>Before run this update, make sure that your current Ontology is updated to the latest version!
		";
		$updates->$v->alert_update[] = $alert;

	// DATABASE UPDATES
		// Remove relations from activity->project (component_portal dd550)
		// This data is huge (hundred of millions) in installations with many projects and is not really useful
		// because normally, admins do not need to deep search across projects (JOINS)
			$updates->$v->SQL_update[]	= PHP_EOL.sanitize_query("
				DELETE FROM \"relations\" WHERE from_component_tipo = 'dd550';
			");

	// RUN_SCRIPTS
		// DATA INSIDE DATABASE UPDATES
		// clean_section_and_component_dato. Update 'datos' to section_data
		$ar_tables = [
			'matrix',
			'matrix_activities',
			'matrix_activity',
			'matrix_counter',
			'matrix_dataframe',
			'matrix_dd',
			'matrix_hierarchy',
			'matrix_hierarchy_main',
			'matrix_indexations',
			'matrix_layout',
			'matrix_layout_dd',
			'matrix_list',
			'matrix_nexus',
			'matrix_nexus_main',
			'matrix_notes',
			'matrix_profiles',
			'matrix_projects',
			'matrix_stats',
			'matrix_time_machine'
		];
		$json_files =[
			'objet_to_object.json', // @todo working here (!)
			'cult_to_culture.json', // @todo working here (!)
			'peri_to_dc.json', // @todo working here (!)
		];
		require_once dirname(dirname(__FILE__)) .'/upgrade/class.transform_data.php';
		$script_obj = new stdClass();
			$script_obj->info			= "Move tld from objet => object, cult => culture, peri => dc";
			$script_obj->script_class	= "transform_data";
			$script_obj->script_method	= "changes_in_tipos";
			$script_obj->script_vars	= [
				$ar_tables,
				$json_files
			]; // Note that only ONE argument encoded is sent
		$updates->$v->run_scripts[] = $script_obj;



$v=620; #####################################################################################
$updates->$v = new stdClass();

	# UPDATE TO
	$updates->$v->version_major			= 6;
	$updates->$v->version_medium		= 2;
	$updates->$v->version_minor			= 0;

	# MINIMUM UPDATE FROM
	$updates->$v->update_from_major		= 6;
	$updates->$v->update_from_medium	= 1;
	$updates->$v->update_from_minor		= 4;

	// alert
		$alert					= new stdClass();
		$alert->notification	= 'V '.$v;

		$alert->command			= "
			<h1>🧐 WARNING! Before apply this update:</h1>
			<br>New configuration constants have been added to config.php and others are deprecated or removed.
			<br>Add them to your 'config' file to enable new features, such as unified thumbnails and image versions of PDF documents.
			<br>
			<br>

			<pre class=\"language-php\">
			<code>
			// thumb common. This block is used by all components to create and display thumbnail images
			// dedalo_thumb_extension. Default: 'jpg'
			define('DEDALO_THUMB_EXTENSION',	'jpg');
			// dedalo_quality_thumb. Default: 'thumb')
			define('DEDALO_QUALITY_THUMB',	'thumb');
			// dedalo_pdf_alternative_extensions. Array with the optional compression formats extension
			// Allows you to create image versions of the PDF, useful for previews or web versions
			define('DEDALO_PDF_ALTERNATIVE_EXTENSIONS', ['jpg']);
			</code>
			</pre>

			<br>DEDALO_IMAGE_THUMB_DEFAULT is changed by generic DEDALO_QUALITY_THUMB
			<br>See sample.config.php file to review all changes.
			<br>More help in <a href='https://dedalo.dev/docs/config/config/' target='_blank'>Config documentation</a>
			<br>
			<br>
			<h1>🧐 WARNING! Before apply this update: (second part)</h1>
			<br>If your installation is using a numisdata279 (Finds), as part of numisdata ontology.
			<br>This update will move your data into new tchi1 (Immovable heritage),
			<br>therefore change your config.php file to include the new tld: tchi
			<br>
			<br>

			<pre class=\"language-php\">
			<code>
			define('DEDALO_PREFIX_TIPOS', ['tchi']
			</code>
			</pre>

			<br>More help in config documentation: <a href='https://dedalo.dev/docs/config/config/#defining-prefix-tipos' target='_blank'>defining-prefix-tipos</a>
			<br>Note: When the update will finish, review your hierarchies to include the new tchi as your previous numisdata279 (Finds).
			<br>
			<br>
			<h1>🧐 WARNING! Before apply this update: (third part)</h1>
			<br>If your installation is using ImageMagick v6, you will need to review his security policy.
			<br>This update will generate images from PDF files, so ImageMagick v6 has a restriction to do that.
			<br>
			<br>In some configuration the update can not create the thumbs for PDF files and you will get an error as:
			<br>
			<br>

			<pre class=\"language-php\">
			<code>
			convert: attempt to perform an operation not allowed by the security policy `PDF' @
			error/constitute.c/IsCoderAuthorized/421.|convert: no images defined
			</code>
			</pre>

			<br> To solve this issue you will need to change the ImageMagick policy for PDF.
			<br>
			<br><b>IMPORTANT NOTE: Changing the ImageMagick policy.xml rules can be dangerous for your server!.
			<br>If you have an older version of GhostScript installed the next change is not recommended since there's a serious security hole for older versions.
			<br>The recommendation is always keep GhostScript and ImageMagick always up to date and change your server accordingly.</b>
			<br>More information: <a href='https://www.kb.cert.org/vuls/id/332928/' target='_blank'>Ghostscript contains multiple -dSAFER sandbox bypass vulnerabilities</a>
			<br>
			<br>Usually in Ubuntu servers the file will be in:
			<br>
			<br>

			<pre class=\"language-php\">
			<code>
			/etc/ImageMagick-6/policy.xml
			</code>
			</pre>

			<br> An the line to comment or remove is:
			<br>
			<br>

			<pre class=\"language-php\">
			<code>
			". htmlentities('<policy domain="coder" rights="none" pattern="PDF" />')."
			</code>
			</pre>
		";
		$updates->$v->alert_update[] = $alert;

	// DATABASE UPDATES
		// Remove relations from activity->project (component_portal dd550)
		// This data is huge (hundred of millions) in installations with many projects and is not really useful
		// because normally, admins do not need to deep search across projects (JOINS)
			$updates->$v->SQL_update[]	= PHP_EOL.sanitize_query("
				DELETE FROM \"relations\" WHERE from_component_tipo = 'dd550';
			");

	// UPDATE COMPONENTS
		$updates->$v->components_update = [
			'component_3d',
			'component_av',
			// 'component_pdf', // run manually with tool_update_cache !
			'component_svg',
			'component_image'
		];	// Force convert from string to array

	// RUN_SCRIPTS
		// DATA INSIDE DATABASE UPDATES
		// clean_section_and_component_dato. Update 'datos' to section_data
			$ar_tables = [
				// 'new_matrix'
				'matrix',
				'matrix_activities',
				'matrix_activity',
				'matrix_counter',
				'matrix_dataframe',
				'matrix_dd',
				'matrix_hierarchy',
				'matrix_hierarchy_main',
				'matrix_indexations',
				'matrix_layout',
				'matrix_layout_dd',
				'matrix_list',
				'matrix_nexus',
				'matrix_nexus_main',
				'matrix_notes',
				'matrix_profiles',
				'matrix_projects',
				'matrix_stats',
				'matrix_time_machine'
			];
			$json_files =[
				'finds_numisdata279_to_tchi1.json'
			];
			require_once dirname(dirname(__FILE__)) .'/upgrade/class.transform_data.php';
			$script_obj = new stdClass();
				$script_obj->info			= "Move data from section: Finds => Immobile | numisdata279 => tchi1";
				$script_obj->script_class	= "transform_data";
				$script_obj->script_method	= "changes_in_tipos";
				$script_obj->script_vars	= [
					$ar_tables,
					$json_files
				]; // Note that only ONE argument encoded is sent
			$updates->$v->run_scripts[] = $script_obj;

		// Update the relations table
			$ar_tables_to_update = [
				'matrix',
				'matrix_activities',
				'matrix_dataframe',
				'matrix_dd',
				'matrix_hierarchy',
				'matrix_indexations',
				'matrix_list',
				'matrix_nexus',
				'matrix_notes',
				'matrix_projects'
			];
			$table_to_update = new stdClass();
				$table_to_update->tables =  implode(',', $ar_tables_to_update);
			$script_obj = new stdClass();
				$script_obj->info			= "Recreate the relations table with new tipos";
				$script_obj->script_class	= "area_maintenance";
				$script_obj->script_method	= "regenerate_relations";
				$script_obj->script_vars	= [
					$table_to_update
				]; // Note that only ONE argument encoded is sent
			$updates->$v->run_scripts[] = $script_obj;



$v=614; #####################################################################################
$updates->$v = new stdClass();

	# UPDATE TO
	$updates->$v->version_major			= 6;
	$updates->$v->version_medium		= 1;
	$updates->$v->version_minor			= 4;

	# MINIMUM UPDATE FROM
	$updates->$v->update_from_major		= 6;
	$updates->$v->update_from_medium	= 1;
	$updates->$v->update_from_minor		= 0;

	// alert
		$alert					= new stdClass();
		$alert->notification	= 'V '.$v;
		$alert->command			= '';
		$updates->$v->alert_update[] = $alert;

	// RUN_SCRIPTS
		// DATA INSIDE DATABASE UPDATES
		// clean_section_and_component_dato. Update 'datos' to section_data
			require_once dirname(dirname(__FILE__)) .'/upgrade/class.transform_data.php';
			$script_obj = new stdClass();
				$script_obj->info			= "Change the matrix_hierarchy_main with new component to control hierarchy show into thesaurus tree";
				$script_obj->script_class	= "transform_data";
				$script_obj->script_method	= "update_hierarchy_view_in_thesaurus";
				$script_obj->script_vars	= json_encode([]); // Note that only ONE argument encoded is sent
			$updates->$v->run_scripts[] = $script_obj;



$v=610; #####################################################################################
$updates->$v = new stdClass();

	# UPDATE TO
	$updates->$v->version_major			= 6;
	$updates->$v->version_medium		= 1;
	$updates->$v->version_minor			= 0;

	# MINIMUM UPDATE FROM
	$updates->$v->update_from_major		= 6;
	$updates->$v->update_from_medium	= 0;
	$updates->$v->update_from_minor		= 6;

	// alert
		$alert					= new stdClass();
		$alert->notification	= 'V '.$v;

		$alert->command			= '
			<h1>🧐 WARNING! Before apply this update:</h1>
			<br>Before run this update, make sure that your current Ontology is updated to the latest version!
			<br>Check if your Ontology is >= of: <b>2024-03-01</b>
			<br>
			<br>
			<br>This update will change some of your data, <b>ensure that you have a backup before apply it!</b>
			<br>Data changes:
			<br>- Uncertainty and roles dataframes of: numisdata30, numisdata34, numisdata161, oh24, rsc128
			<br>- Paperjs lib_data of rsc29
		';
		$updates->$v->alert_update[] = $alert;

	// DATABASE UPDATES
		// Change the tipo column definition id matrix_counter
			$updates->$v->SQL_update[] 	= PHP_EOL.sanitize_query("
				ALTER TABLE \"matrix_counter\"
				ALTER \"tipo\" TYPE character varying(128),
				ALTER \"tipo\" DROP DEFAULT,
				ALTER \"tipo\" SET NOT NULL;
			");

		// add the section_id_key to matrix_time_machine
			$updates->$v->SQL_update[] 	= PHP_EOL.sanitize_query("
				ALTER TABLE \"matrix_time_machine\"
					ADD COLUMN IF NOT EXISTS \"section_id_key\" integer NULL;
			");
		// create new index into time_machine table to include section_id_key
			$updates->$v->SQL_update[] 	= PHP_EOL.sanitize_query("
				CREATE INDEX IF NOT EXISTS \"matrix_time_machine_section_id_key\" ON \"matrix_time_machine\" (\"section_id\", \"section_id_key\", \"section_tipo\", \"tipo\", \"lang\");
			");

		// Add the matrix_dataframe table
			$updates->$v->SQL_update[] 	= PHP_EOL.sanitize_query("
				CREATE TABLE IF NOT EXISTS public.matrix_dataframe
				(LIKE public.matrix INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES INCLUDING STORAGE INCLUDING COMMENTS)
				WITH (OIDS = FALSE);
				CREATE SEQUENCE IF NOT EXISTS matrix_dataframe_id_seq;
				ALTER TABLE public.matrix_dataframe ALTER COLUMN id SET DEFAULT nextval('matrix_dataframe_id_seq'::regclass);
			");

		// move the models and toponomy terms to hierarchy tld
		// move all countries model sections to hierarchy122
			$updates->$v->SQL_update[] 	= PHP_EOL.sanitize_query("

				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy121' WHERE \"parent\" = 'dd101';
				UPDATE \"jer_dd\" SET \"parent\" = 'ts11' WHERE \"terminoID\" = 'dd101';

				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'pt2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'fr2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'pl2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'ua2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'ma2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'es2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'au2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'tr2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'ba2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'lv2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'xk2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'sv2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'yu2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'cu2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'ro2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'cl2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'us2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'gr2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'at2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'eg2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'uy2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'tj2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'cz2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'de2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'ee2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'ru2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'al2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'by2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'ie2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'eh2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'mz2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'sa2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'th2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'ye2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'ge2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'lu2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'ly2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'mk2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'rs2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'ch2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'nl2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'se2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'fi2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'it2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'hr2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'hu2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'co2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'tm2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'bi2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'il2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'md2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'bh2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'kz2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'ci2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'dj2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'er2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'in2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'gq2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'iq2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'ir2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'jo2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'kh2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'kw2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'ml2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'mw2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'na2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'ni2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'pg2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'pr2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'ps2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'qa2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'sg2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'st2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'sz2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'tv2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'tz2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'ws2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'af2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'me2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'mx2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'gt2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'dk2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'bj2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'bo2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'br2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'bw2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'bz2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'gm2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'cm2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'cr2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'ec2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'id2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'et2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'hn2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'la2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'mm2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'mr2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'my2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'ne2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'np2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'om2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'pa2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'ph2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'pk2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'rw2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'sb2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'sn2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'td2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'tn2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 've2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'ug2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'za2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'zm2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'no2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'li2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'nz2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'ad2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'dz2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'am2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'az2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'bg2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'ca2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'kg2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'lt2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'sk2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'si2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'gb2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'uz2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'ao2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'ar2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'cd2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'cg2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'cy2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'fj2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'ga2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'gn2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'jp2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'ke2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'ki2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'lb2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'ng2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'pe2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'py2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'sd2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'so2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'sy2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'to2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'vn2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'vu2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'zw2';
				UPDATE \"jer_dd\" SET \"parent\" = 'hierarchy122' WHERE \"terminoID\" = 'be2';
			");

	// RUN_SCRIPTS
		// DATA INSIDE DATABASE UPDATES
		// clean_section_and_component_dato. Update 'datos' to section_data
			require_once dirname(dirname(__FILE__)) .'/upgrade/class.transform_data.php';
			$script_obj = new stdClass();
				$script_obj->info			= "Remove old dataframe data and update to new model";
				$script_obj->script_class	= "transform_data";
				$script_obj->script_method	= "update_dataframe_to_v6_1";
				$script_obj->script_vars	= json_encode([]); // Note that only ONE argument encoded is sent
			$updates->$v->run_scripts[] = $script_obj;

		// clean_section_and_component_dato. Update 'datos' to section_data
			require_once dirname(dirname(__FILE__)) .'/upgrade/class.transform_data.php';
			$script_obj = new stdClass();
				$script_obj->info			= "Removes Paper libdata from component_image (rsc29)";
				$script_obj->script_class	= "transform_data";
				$script_obj->script_method	= "update_paper_lib_data";
				$script_obj->script_vars	= json_encode([]); // Note that only ONE argument encoded is sent
			$updates->$v->run_scripts[] = $script_obj;



$v=606; #####################################################################################
$updates->$v = new stdClass();

	# UPDATE TO
	$updates->$v->version_major			= 6;
	$updates->$v->version_medium		= 0;
	$updates->$v->version_minor			= 6;

	# MINIMUM UPDATE FROM
	$updates->$v->update_from_major		= 6;
	$updates->$v->update_from_medium	= 0;
	$updates->$v->update_from_minor		= 5;

	// alert
		$alert					= new stdClass();
		$alert->notification	= 'V '.$v;
		$alert->command			= '';
		$updates->$v->alert_update[] = $alert;

	// DATABASE UPDATES
		// Index matrix_test table to get flat locator used by inverse searches
			$updates->$v->SQL_update[] 	= PHP_EOL.sanitize_query("
				CREATE INDEX IF NOT EXISTS matrix_test_relations_flat_st_si ON matrix_test
					USING gin(relations_flat_st_si(datos) jsonb_path_ops);

				CREATE INDEX IF NOT EXISTS matrix_test_relations_flat_fct_st_si ON matrix_test
					USING gin(relations_flat_fct_st_si(datos) jsonb_path_ops);

				CREATE INDEX IF NOT EXISTS matrix_test_relations_flat_ty_st_si ON matrix_test
					USING gin(relations_flat_ty_st_si(datos) jsonb_path_ops);

				CREATE INDEX IF NOT EXISTS matrix_test_relations_flat_ty_st ON matrix_test
					USING gin(relations_flat_ty_st(datos) jsonb_path_ops);
			");



$v=605; #####################################################################################
$updates->$v = new stdClass();

	# UPDATE TO
	$updates->$v->version_major			= 6;
	$updates->$v->version_medium		= 0;
	$updates->$v->version_minor			= 5;

	# MINIMUM UPDATE FROM
	$updates->$v->update_from_major		= 6;
	$updates->$v->update_from_medium	= 0;
	$updates->$v->update_from_minor		= 4;

	// alert
		$alert					= new stdClass();
		$alert->notification	= 'V '.$v;
		$alert->command			= '';
		$updates->$v->alert_update[] = $alert;

	// DATABASE UPDATES
		// Add new matrix table nexus main, to create relations between nodes
			$updates->$v->SQL_update[] = PHP_EOL.sanitize_query("
				CREATE TABLE IF NOT EXISTS public.matrix_nexus_main
				(LIKE public.matrix INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES INCLUDING STORAGE INCLUDING COMMENTS)
				WITH (OIDS = FALSE);
				CREATE SEQUENCE matrix_nexus_main_id_seq;
				ALTER TABLE public.matrix_nexus_main ALTER COLUMN id SET DEFAULT nextval('matrix_nexus_main_id_seq'::regclass);
			");
		// Add new matrix table nexus, to create relations between nodes
			$updates->$v->SQL_update[] = PHP_EOL.sanitize_query("
				CREATE TABLE IF NOT EXISTS public.matrix_nexus
				(LIKE public.matrix INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES INCLUDING STORAGE INCLUDING COMMENTS)
				WITH (OIDS = FALSE);
				CREATE SEQUENCE matrix_nexus_id_seq;
				ALTER TABLE public.matrix_nexus ALTER COLUMN id SET DEFAULT nextval('matrix_nexus_id_seq'::regclass);
			");



$v=604; #####################################################################################
$updates->$v = new stdClass();

	# UPDATE TO
	$updates->$v->version_major			= 6;
	$updates->$v->version_medium		= 0;
	$updates->$v->version_minor			= 4;

	# MINIMUM UPDATE FROM
	$updates->$v->update_from_major		= 6;
	$updates->$v->update_from_medium	= 0;
	$updates->$v->update_from_minor		= 1;

	// alert
		$alert					= new stdClass();
		$alert->notification	= 'V '.$v;
		$alert->command			= '
			WARNING!
			<br>Before run this update, make sure that your Ontology is updated to the latest version!
		';
		$updates->$v->alert_update[] = $alert;

	// RUN_SCRIPTS
		// update time machine data. Update 'data' of time_machine
			require_once dirname(dirname(__FILE__)) .'/upgrade/class.transform_data.php';
			$script_obj = new stdClass();
				$script_obj->info			= "Transform data from portal 'Creators' (numisdata261) to new portal (numisdata1362)";
				$script_obj->script_class	= "transform_data";
				$script_obj->script_method	= "add_portal_level";
				$script_obj->stop_on_error	= true;
				$script_obj->script_vars	= json_decode('
					{
						"tld" : "numisdata",
						"original" : [
							{
								"model" : "section",
								"tipo" : "numisdata3",
								"role" : "section",
								"info" : "Types"
							},
							{
								"model" : "component_portal",
								"tipo" : "numisdata261",
								"role" : "source_portal",
								"info" : "Creators deprecated"
							},
							{
								"model" : "component_portal",
								"tipo" : "numisdata1362",
								"role" : "target_portal",
								"info" : "Creators (new)"
							},
							{
								"model" : "component_portal",
								"tipo" : "numisdata887",
								"role" : "ds",
								"info" : "Role"
							}
						],
						"new" : [
							{
								"model" : "section",
								"tipo" : "rsc1152",
								"role" : "section",
								"info" : "People references"
							},
							{
								"model" : "component_portal",
								"tipo" : "rsc1156",
								"role" : "target_portal",
								"info" : "People"
							},
							{
								"model" : "component_portal",
								"tipo" : "rsc1155",
								"role" : "ds",
								"info" : "Role"
							}
						],
						"delete_old_data" : true,
						"stop_on_error" : true
					}
			');
			$updates->$v->run_scripts[] = $script_obj;



$v=601; #####################################################################################
$updates->$v = new stdClass();

	# UPDATE TO
	$updates->$v->version_major			= 6;
	$updates->$v->version_medium		= 0;
	$updates->$v->version_minor			= 1;

	# MINIMUM UPDATE FROM
	$updates->$v->update_from_major		= 6;
	$updates->$v->update_from_medium	= 0;
	$updates->$v->update_from_minor		= 0;

	// alert
		$alert					= new stdClass();
		$alert->notification	= 'V '.$v;
		$alert->command			= '
			WARNING!
			<br>Before run this update, make sure that your Ontology is updated to the latest version!
		';
		$updates->$v->alert_update[] = $alert;

	// DATABASE UPDATES
		// Delete the matrix_dataframe table, now the dataframe use the standard tables, matrix_dd, matrix.
		$updates->$v->SQL_update[] 	= PHP_EOL.sanitize_query("
			DROP TABLE IF EXISTS \"matrix_dataframe\" CASCADE;
		");

	// UPDATE COMPONENTS
		$updates->$v->components_update = [
			'component_3d',
			'component_av',
			'component_image',
			'component_pdf',
			'component_svg'
		];	// Force convert from string to array



$v=600; #####################################################################################
$updates->$v = new stdClass();

	# UPDATE TO
	$updates->$v->version_major			= 6;
	$updates->$v->version_medium		= 0;
	$updates->$v->version_minor			= 0;

	# MINIMUM UPDATE FROM
	$updates->$v->update_from_major		= 5;
	$updates->$v->update_from_medium	= 9;
	$updates->$v->update_from_minor		= 7;

	// alert
		$alert					= new stdClass();
		$alert->notification	= 'V '.$v;
		$alert->command			= ' WARNING!
									<br>Before run this update, make sure that your Ontology is updated to the latest version!
									<br>(Several required properties are defined only in recent Ontology versions)
								  ';
		$updates->$v->alert_update[] = $alert;

	// DATABASE UPDATES
		// alter the null option of the parent column in jer_dd (NULL is now allowed)
			$updates->$v->SQL_update[] = PHP_EOL.sanitize_query("
				ALTER TABLE \"jer_dd\"
				ALTER \"parent\" TYPE character varying(32),
				ALTER \"parent\" DROP DEFAULT,
				ALTER \"parent\" DROP NOT NULL;
				COMMENT ON COLUMN \"jer_dd\".\"parent\" IS '';
				COMMENT ON TABLE \"jer_dd\" IS '';
			");

		// create the matrix_tools table
			$updates->$v->SQL_update[] = PHP_EOL.sanitize_query("
				CREATE TABLE IF NOT EXISTS public.matrix_tools
				(
				   LIKE public.matrix INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES INCLUDING STORAGE INCLUDING COMMENTS
				)
				WITH (OIDS = FALSE);
				CREATE SEQUENCE IF NOT EXISTS matrix_tools_id_seq;
				ALTER TABLE public.matrix_tools ALTER COLUMN id SET DEFAULT nextval('matrix_tools_id_seq'::regclass);

				DROP INDEX IF EXISTS \"matrix_tools_expr_idx3\", \"matrix_tools_expr_idx2\", \"matrix_tools_expr_idx1\", \"matrix_tools_expr_idx\", \"matrix_tools_id_idx1\";

				DROP INDEX IF EXISTS public.matrix_tools_datos_idx;
				CREATE INDEX IF NOT EXISTS matrix_tools_datos_idx
				    ON public.matrix_tools USING gin
				    (datos jsonb_path_ops)
				    TABLESPACE pg_default;
			");
			// re-create index matrix_tools_datos_idx because in some cases is wrong (inm v5 for example)

		// create the matrix_test table
			$updates->$v->SQL_update[] = PHP_EOL.sanitize_query("
				CREATE TABLE IF NOT EXISTS public.matrix_test
				(
				   LIKE public.matrix INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES INCLUDING STORAGE INCLUDING COMMENTS
				)
				WITH (OIDS = FALSE);
				CREATE SEQUENCE IF NOT EXISTS matrix_test_id_seq;
				ALTER TABLE public.matrix_test ALTER COLUMN id SET DEFAULT nextval('matrix_test_id_seq'::regclass);
			");

		// drop the old matrix_stat
			$updates->$v->SQL_update[] 	= PHP_EOL.sanitize_query("
				DROP TABLE IF EXISTS \"matrix_stat\" CASCADE;
			");

		// add index for term_id (dd1475) to matrix_dd
			$updates->$v->SQL_update[] 	= PHP_EOL.sanitize_query("
				CREATE INDEX IF NOT EXISTS matrix_dd_dd1475_gin ON public.matrix_dd USING gin ((datos #> '{components,dd1475,dato,lg-nolan}'::text[]) jsonb_path_ops);
				REINDEX TABLE public.matrix_dd;
			");

			$updates->$v->SQL_update[] 	= PHP_EOL.sanitize_query("
				CREATE INDEX IF NOT EXISTS \"matrix_descriptors_dd_dato_tipo_lang\" ON \"matrix_descriptors_dd\" (\"dato\", \"tipo\", \"lang\");
				REINDEX TABLE public.matrix_descriptors_dd;
			");

			$updates->$v->SQL_update[] 	= PHP_EOL.sanitize_query("
				CREATE INDEX IF NOT EXISTS matrix_relations_gin ON public.matrix USING gin ((datos #> '{relations}'::text[]) jsonb_path_ops) TABLESPACE pg_default;
			");

		// vacuum table matrix_dd
			$updates->$v->SQL_update[] 	= PHP_EOL.sanitize_query("
				VACUUM FULL VERBOSE ANALYZE public.matrix_dd;
			");

		// Index matrix tables to get flat locator used by inverse searches
		// Create functions with base flat locators
		// st = section_tipo si= section_id (oh1_3)
		// fct=from_section_tipo st=section_tipo si=section_id (oh24_rsc197_2)
			$updates->$v->SQL_update[] 	= PHP_EOL.sanitize_query("

				DROP INDEX IF EXISTS matrix_relations_flat_st_si;
				DROP INDEX IF EXISTS matrix_hierarchy_relations_flat_st_si;
				DROP INDEX IF EXISTS matrix_activities_relations_flat_st_si;
				DROP INDEX IF EXISTS matrix_list_relations_flat_st_si;

				DROP INDEX IF EXISTS matrix_relations_flat_fct_st_si;
				DROP INDEX IF EXISTS matrix_hierarchy_relations_flat_fct_st_si;
				DROP INDEX IF EXISTS matrix_activities_relations_flat_fct_st_si;
				DROP INDEX IF EXISTS matrix_list_relations_flat_fct_st_si;

				DROP INDEX IF EXISTS matrix_relations_flat_ty_st_si;
				DROP INDEX IF EXISTS matrix_hierarchy_relations_flat_ty_st_si;
				DROP INDEX IF EXISTS matrix_activities_relations_flat_ty_st_si;
				DROP INDEX IF EXISTS matrix_list_relations_flat_ty_st_si;

				DROP INDEX IF EXISTS matrix_relations_flat_ty_st;
				DROP INDEX IF EXISTS matrix_hierarchy_relations_flat_ty_st;
				DROP INDEX IF EXISTS matrix_activities_relations_flat_ty_st;
				DROP INDEX IF EXISTS matrix_list_relations_flat_ty_st;

				DROP FUNCTION IF EXISTS public.relations_flat_st_si(jsonb);
				DROP FUNCTION IF EXISTS public.relations_flat_fct_st_si(jsonb);
				DROP FUNCTION IF EXISTS public.relations_flat_ty_st_si(jsonb);
				DROP FUNCTION IF EXISTS public.relations_flat_ty_st(jsonb);

				-- Create function with base flat locators st=section_tipo si=section_id (rsc197_2)
				CREATE OR REPLACE FUNCTION public.relations_flat_st_si(datos jsonb) RETURNS jsonb
					AS $$ SELECT jsonb_agg( concat(rel->>'section_tipo','_',rel->>'section_id') )
					FROM jsonb_array_elements($1->'relations') rel(rel)
					$$ LANGUAGE sql IMMUTABLE;

				-- Create function with base flat locators fct=from_section_tipo st=section_tipo si=section_id (oh24_rsc197_2)
				CREATE OR REPLACE FUNCTION public.relations_flat_fct_st_si(datos jsonb) RETURNS jsonb
					AS $$ SELECT jsonb_agg( concat(rel->>'from_component_tipo','_',rel->>'section_tipo','_',rel->>'section_id') )
					FROM jsonb_array_elements($1->'relations') rel(rel)
					$$ LANGUAGE sql IMMUTABLE;

				-- Create function with base flat locators ty=type st=section_tipo si=section_id (oh24_rsc197_2)
				CREATE OR REPLACE FUNCTION public.relations_flat_ty_st_si(datos jsonb) RETURNS jsonb
					AS $$ SELECT jsonb_agg( concat(rel->>'type','_',rel->>'section_tipo','_',rel->>'section_id') )
					FROM jsonb_array_elements($1->'relations') rel(rel)
					$$ LANGUAGE sql IMMUTABLE;

				-- Create function with base flat locators ty=type st=section_tipo (dd96_rsc197)
				CREATE OR REPLACE FUNCTION public.relations_flat_ty_st(datos jsonb) RETURNS jsonb
					AS $$ SELECT jsonb_agg( concat(rel->>'type','_',rel->>'section_tipo') )
					FROM jsonb_array_elements($1->'relations') rel(rel)
					$$ LANGUAGE sql IMMUTABLE;

				-- Create indexes with base flat locators st = section_tipo si= section_id (oh1_3)
				CREATE INDEX matrix_relations_flat_st_si ON matrix
					USING gin(relations_flat_st_si(datos) jsonb_path_ops);

				CREATE INDEX matrix_hierarchy_relations_flat_st_si ON matrix_hierarchy
					USING gin(relations_flat_st_si(datos) jsonb_path_ops);

				CREATE INDEX matrix_activities_relations_flat_st_si ON matrix_activities
					USING gin(relations_flat_st_si(datos) jsonb_path_ops);

				CREATE INDEX matrix_list_relations_flat_st_si ON matrix_list
					USING gin(relations_flat_st_si(datos) jsonb_path_ops);

				-- Create indexes with  flat locators fct=from_section_tipo st=section_tipo si=section_id (oh24_rsc197_2)
				CREATE INDEX matrix_relations_flat_fct_st_si ON matrix
					USING gin(relations_flat_fct_st_si(datos) jsonb_path_ops);

				CREATE INDEX matrix_hierarchy_relations_flat_fct_st_si ON matrix_hierarchy
					USING gin(relations_flat_fct_st_si(datos) jsonb_path_ops);

				CREATE INDEX matrix_activities_relations_flat_fct_st_si ON matrix_activities
					USING gin(relations_flat_fct_st_si(datos) jsonb_path_ops);

				CREATE INDEX matrix_list_relations_flat_fct_st_si ON matrix_list
					USING gin(relations_flat_fct_st_si(datos) jsonb_path_ops);

				-- Create indexes with  flat locators fct=from_section_tipo st=section_tipo si=section_id (oh24_rsc197_2)
				CREATE INDEX matrix_relations_flat_ty_st_si ON matrix
					USING gin(relations_flat_ty_st_si(datos) jsonb_path_ops);

				CREATE INDEX matrix_hierarchy_relations_flat_ty_st_si ON matrix_hierarchy
					USING gin(relations_flat_ty_st_si(datos) jsonb_path_ops);

				CREATE INDEX matrix_activities_relations_flat_ty_st_si ON matrix_activities
					USING gin(relations_flat_ty_st_si(datos) jsonb_path_ops);

				CREATE INDEX matrix_list_relations_flat_ty_st_si ON matrix_list
					USING gin(relations_flat_ty_st_si(datos) jsonb_path_ops);

				-- Create indexes with  flat locators ty=type st=section_tipo (dd96_rsc197)
				CREATE INDEX matrix_relations_flat_ty_st ON matrix
					USING gin(relations_flat_ty_st(datos) jsonb_path_ops);

				CREATE INDEX matrix_hierarchy_relations_flat_ty_st ON matrix_hierarchy
					USING gin(relations_flat_ty_st(datos) jsonb_path_ops);

				CREATE INDEX matrix_activities_relations_flat_ty_st ON matrix_activities
					USING gin(relations_flat_ty_st(datos) jsonb_path_ops);

				CREATE INDEX matrix_list_relations_flat_ty_st ON matrix_list
					USING gin(relations_flat_ty_st(datos) jsonb_path_ops);
			");

		// add the section_id_key to matrix_time_machine
			// (!) Note that this update id from 6.0.x to 6.1 but it is necessary here too for time machine running code 6.1
			$updates->$v->SQL_update[] 	= PHP_EOL.sanitize_query("
				ALTER TABLE \"matrix_time_machine\"
					ADD COLUMN IF NOT EXISTS \"section_id_key\" integer NULL;
			");
		// create new index into time_machine table to include section_id_key
			// (!) Note that this update id from 6.0.x to 6.1 but it is necessary here too for time machine running code 6.1
			$updates->$v->SQL_update[] 	= PHP_EOL.sanitize_query("
				CREATE INDEX IF NOT EXISTS \"matrix_time_machine_section_id_key\" ON \"matrix_time_machine\" (\"section_id\", \"section_id_key\", \"section_tipo\", \"tipo\", \"lang\");
			");

	// UPDATE COMPONENTS
		$updates->$v->components_update = [
			'component_av',
			'component_image',
			'component_pdf',
			'component_svg',
			'component_portal',
			'component_geolocation',
			'component_json',
			'component_number',
			'component_text_area', // (!) Run this at end because affect image and av data
		];	// Force convert from string to array

	// RUN_SCRIPTS
		// update time machine data. Update 'data' of time_machine
			require_once dirname(dirname(__FILE__)) .'/upgrade/class.time_machine_v5_to_v6.php';
			$script_obj = new stdClass();
				$script_obj->info			= "Update data of time_machine, from 'txt' to array";
				$script_obj->script_class	= "time_machine_v5_to_v6";
				$script_obj->script_method	= "convert_table_data_time_machine";
				$script_obj->script_vars	= json_encode([]); // Note that only ONE argument encoded is sent
			$updates->$v->run_scripts[] = $script_obj;

		// register tools. Before parse old data, we need to have the tools available
			$script_obj = new stdClass();
				$script_obj->info			= "Register all tools found in folder 'tools' ";
				$script_obj->script_class	= "tools_register";
				$script_obj->script_method	= "import_tools";
				$script_obj->script_vars	= json_encode([]); // Note that only ONE argument encoded is sent
			$updates->$v->run_scripts[] = $script_obj;

		// component_relation_index. Update 'datos' with relation_index
			require_once dirname(dirname(__FILE__)) .'/upgrade/class.relation_index_v5_to_v6.php';
			$script_obj = new stdClass();
				$script_obj->info			= "Change the component_relation_related_index data inside thesaurus to resources section data";
				$script_obj->script_class	= "relation_index_v5_to_v6";
				$script_obj->script_method	= "change_component_dato";
				$script_obj->script_vars	= json_encode([]); // Note that only ONE argument encoded is sent
			$updates->$v->run_scripts[] = $script_obj;

		// component_pdf. rename media folder from 'standar' to 'web' and add a full copy as 'original'
			$script_obj = new stdClass();
				$script_obj->info			= "component_pdf: rename media folder from 'standar' to 'web' and creates a full copy as 'original'";
				$script_obj->script_class	= "v5_to_v6";
				$script_obj->script_method	= "update_component_pdf_media_dir";
				$script_obj->script_vars	= json_encode([]); // Note that only ONE argument encoded is sent
			$updates->$v->run_scripts[] = $script_obj;

		// component_svg. rename media folder from 'standard' to 'web' and add a full copy as 'original'
			$script_obj = new stdClass();
				$script_obj->info			= "component_svg: rename media folder from 'standard' to 'web' and creates a full copy as 'original'";
				$script_obj->script_class	= "v5_to_v6";
				$script_obj->script_method	= "update_component_svg_media_dir";
				$script_obj->script_vars	= json_encode([]); // Note that only ONE argument encoded is sent
			$updates->$v->run_scripts[] = $script_obj;

		// DATA INSIDE DATABASE UPDATES
			// clean_section_and_component_dato. Update 'datos' to section_data
				require_once dirname(dirname(__FILE__)) .'/upgrade/class.data_v5_to_v6.php';
				$script_obj = new stdClass();
					$script_obj->info			= "Remove unused section data and update/clean some properties";
					$script_obj->script_class	= "data_v5_to_v6";
					$script_obj->script_method	= "clean_section_and_component_dato";
					$script_obj->script_vars	= json_encode([]); // Note that only ONE argument encoded is sent
				$updates->$v->run_scripts[] = $script_obj;

			// convert_table_data_profiles. Update 'datos' to section_data
				require_once dirname(dirname(__FILE__)) .'/upgrade/class.security_v5_to_v6.php';
				$script_obj = new stdClass();
					$script_obj->info			= "Convert dato of some components (component_security_areas, component_security_access), to new dato format";
					$script_obj->script_class	= "security_v5_to_v6";
					$script_obj->script_method	= "convert_table_data_profiles";
					$script_obj->script_vars	= json_encode(['component_security_areas','component_security_access']); // Note that only ONE argument encoded is sent
				$updates->$v->run_scripts[] = $script_obj;

			// convert_table_data_users. Update 'datos' to section_data
				// require_once dirname(dirname(__FILE__)) .'/upgrade/class.security_v5_to_v6.php';
				$script_obj = new stdClass();
					$script_obj->info			= "Convert dato of some components (component_profile, component_security_administration, component_filter_records), to new standard locator format";
					$script_obj->script_class	= "security_v5_to_v6";
					$script_obj->script_method	= "convert_table_data_users";
					$script_obj->script_vars	= json_encode(['component_profile','component_security_administration','component_filter_records']); // Note that only ONE argument encoded is sent
				$updates->$v->run_scripts[] = $script_obj;

			// convert_table_data_activity. Update 'datos' to section_data
				require_once dirname(dirname(__FILE__)) .'/upgrade/class.activity_v5_to_v6.php';
				$script_obj = new stdClass();
					$script_obj->info			= "Convert the old dato format of some components dd546, dd545 (component_autocomplete_ts), to new standard component_autocomplete format";
					$script_obj->script_class	= "activity_v5_to_v6";
					$script_obj->script_method	= "convert_table_data_activity";
					$script_obj->script_vars	= json_encode(['component_autocomplete_ts']); // Note that only ONE argument encoded is sent
				$updates->$v->run_scripts[] = $script_obj;

			// publication media files. rename media files to use max_items_folder as additional path
				require_once dirname(dirname(__FILE__)) .'/upgrade/class.data_v5_to_v6.php';
				$script_obj = new stdClass();
					$script_obj->info			= "publication media files: rename media files to use max_items_folder as additional path";
					$script_obj->script_class	= "v5_to_v6";
					$script_obj->script_method	= "update_publication_media_files";
					$ar_items = [
						// PDF publication files
						(object)[
							'ar_quality'		=> DEDALO_PDF_AR_QUALITY,
							'element_dir'		=> DEDALO_PDF_FOLDER,
							'max_items_folder'	=> 1000,
							'ref_name'			=> 'rsc209_rsc205_' // find 'rsc209_rsc205_1.pdf'
						],
						// image publication files
						(object)[
							'ar_quality'		=> DEDALO_IMAGE_AR_QUALITY,
							'element_dir'		=> DEDALO_IMAGE_FOLDER,
							'max_items_folder'	=> 1000,
							'ref_name'			=> 'rsc228_rsc205_' // find 'rsc228_rsc205_1.jpg'
						]
					];
					$script_obj->script_vars	= json_encode($ar_items); // Note that only ONE argument encoded is sent
				$updates->$v->run_scripts[] = $script_obj;

			// Update search_presets data
				require_once dirname(dirname(__FILE__)) .'/upgrade/class.v5_to_v6.php';
				$script_obj = new stdClass();
					$script_obj->info			= "Convert the old dato format from search presets";
					$script_obj->script_class	= "v5_to_v6";
					$script_obj->script_method	= "update_search_presets_data";
					$script_obj->script_vars	= json_encode([]); // Note that only ONE argument encoded is sent
				$updates->$v->run_scripts[] = $script_obj;

			// Fix v6 beta data errors (sample: modified_date, created_date, ...)
				// require_once dirname(dirname(__FILE__)) .'/upgrade/class.v5_to_v6.php';
				// $script_obj = new stdClass();
				// 	$script_obj->info			= "Fix v6 beta issues";
				// 	$script_obj->script_class	= "v5_to_v6";
				// 	$script_obj->script_method	= "fix_v6_beta_issues";
				// 	$script_obj->script_vars	= json_encode([]); // Note that only ONE argument encoded is sent
				// $updates->$v->run_scripts[] = $script_obj;

