<?php


/*
* CLASS SUM_DATES
*
*
*/
class sum_dates extends widget_common {

	/**
	* get_dato
	* @return
	*/
	public function get_dato() {


		$section_tipo 	= $this->section_tipo;
		$section_id 	= $this->section_id;
		$ipo 			= $this->ipo;

		// auxiliary functions
		if (!function_exists('sum_intervals')) {


			/** sum_intervals */
			function sum_intervals($ar_interval) {
				$e = new DateTime('00:00');
				$f = clone $e;

				foreach ($ar_interval as $key => $interval) {
					$e->add($interval);
				}
				$sum_intervals = $f->diff($e);

				return $sum_intervals;
			}//end sum_intervals


			function is_last_date($ar_dates_all, $offset_key){
				foreach ($ar_dates_all as $key => $current_date) {
					if ($key<=$offset_key) continue; // Ignore previous
					if (!empty($current_date->year)) {
						return false;
					}
				}

				return true;
			}//end is_last_date


			function date_interval($date_in, $date_out) {
				if(get_class($date_in)=='DateTime') {
					$date1 = $date_in;
				}else{
					$dd_date = new dd_date($date_in);
					$timestamp_in = $dd_date->get_dd_timestamp("Y-m-d");
					$date1 = new DateTime($timestamp_in);
				}

				if(get_class($date_out)=='DateTime') {
					$date2 = $date_out;
				}else{
					$dd_date = new dd_date($date_out);
					$timestamp_out = $dd_date->get_dd_timestamp("Y-m-d");
					$date2 = new DateTime($timestamp_out);
				}

				$interval = $date1->diff($date2);

				if ($interval->h >0) {
					$ar_interval[] = $interval;
					$ar_interval[] = date_interval_create_from_date_string("1 day");
					$interval = sum_intervals($ar_interval);
				}

				return $interval;
			}//end date_interval


			function custom_date_add_sub($date_in, $interval, $type) {
				$dd_date = new dd_date($date_in);
				$timestamp_in = $dd_date->get_dd_timestamp("Y-m-d");
				$date1 = new DateTime($timestamp_in);

				$interval_time = date_interval_create_from_date_string($interval); // ref'10 days'

				$add = $date1->{$type}($interval_time);

				return $add;
			}//end custom_date_add_sub


			function is_out($key) {
				if ($key % 2 == 0) return false;
				return true;
			}//end is_out
		}//end if (!function_exists('sum_intervals'))


		$dato = [];
		foreach ($ipo as $key => $current_ipo) {

			$input 		= $current_ipo->input;
			$output		= $current_ipo->output;

			$component_source = array_reduce($input, function ($carry, $item){
				if ($item->type==='source') {
					return $item;
				}
				return $carry;
			});

			$current_component_tipo = $component_source->component_tipo;
			$current_section_tipo 	= $component_source->section_tipo;

			$date_in_component 		= array_reduce($input, function ($carry, $item){
				if ($item->type==='date_in') {
					return $item;
				}
				return $carry;
			});
			$date_out_component 	= array_reduce($input, function ($carry, $item){
				if ($item->type==='date_out') {
					return $item;
				}
				return $carry;
			});

			$date_in_component_tipo		= $date_in_component->component_tipo;
			$date_out_component_tipo	= $date_out_component->component_tipo;
			$lang = isset($lang) ? $lang : DEDALO_DATA_LANG;



			// PORTAL ROWS
				$model_name 	  = ontology_node::get_model_name_by_tipo($current_component_tipo,true); // Expected portal
				$component_portal = component_common::get_instance(
					$model_name,
					$current_component_tipo,
					$section_id,
					'list',
					DEDALO_DATA_NOLAN,
					$current_section_tipo
				);
				$component_dato = $component_portal->get_dato();

				if (empty($component_dato)) {
					return $dato;
				}


			// CALCULATING FIRST AND LAST LOCATOR
			//
			// FIRST_LOCATOR
			$first_locator = reset($component_dato);

				$locator_section_tipo = $first_locator->section_tipo;
				$locator_section_id   = $first_locator->section_id;

				$model_name 	  = ontology_node::get_model_name_by_tipo($date_in_component_tipo,true); // Expected component date

				$component_date_in= component_common::get_instance(
					$model_name,
					$date_in_component_tipo,
					$locator_section_id,
					'list',
					DEDALO_DATA_NOLAN,
					$locator_section_tipo
				);
				$date_in = (array)$component_date_in->get_dato();
				$date_in = reset($date_in); // Now date is an array
				// Compatible new date format 01-10-2018
				if (isset($date_in->start)) {
					$date_in = $date_in->start;
				}
				if(!empty($date_in)) {
					$dd_date = new dd_date($date_in);
					$timestamp_in = $dd_date->get_dd_timestamp("Y-m-d");
				}else{
					$timestamp_in = "0000-00-00";
				}

			// LAST_LOCATOR
			$last_locator  = end($component_dato);

				$locator_section_tipo = $last_locator->section_tipo;
				$locator_section_id   = $last_locator->section_id;

				$model_name 	    = ontology_node::get_model_name_by_tipo($date_out_component_tipo,true); // Expected component date
				$component_date_out = component_common::get_instance(
					$model_name,
					$date_out_component_tipo,
					$locator_section_id,
					'list',
					DEDALO_DATA_NOLAN,
					$locator_section_tipo
				);
				$date_out = (array)$component_date_out->get_dato();
				$date_out = reset($date_out); // Now date is an array
				// Compatible new date format 01-10-2018
				if (isset($date_out->start)) {
					$date_out = $date_out->start;
				}
				if (!empty($date_out)) {
					$dd_date = new dd_date($date_out);
					$timestamp_out = $dd_date->get_dd_timestamp("Y-m-d");
				}else{
					$timestamp_out = "0000-00-00";
				}



			// Total
			// $date1 = new DateTime($timestamp_in);
			// $date2 = new DateTime($timestamp_out);
			// $interval = $date1->diff($date2);

			// MODO CALCULANDO TODOS LOS LOCATORS
			$total_seconds = 0;
			$ar_dates_in=array();
			$ar_dates_out=array();
			$ar_dates_all=array();
			foreach ((array)$component_dato as $key_data => $current_locator) {

				$locator_section_tipo = $current_locator->section_tipo;
				$locator_section_id   = $current_locator->section_id;

				// Date in
				$model_name 	  = ontology_node::get_model_name_by_tipo($date_in_component_tipo,true); // Expected component date
				$component_date_in= component_common::get_instance(
					$model_name,
					$date_in_component_tipo,
					$locator_section_id,
					'list',
					DEDALO_DATA_NOLAN,
					$locator_section_tipo
				);
				$date_in = (array)$component_date_in->get_dato();
				$date_in = reset($date_in);
				// Compatible new date format 01-10-2018
				if (isset($date_in->start)) {
					$date_in = $date_in->start;
				}

				$ar_dates_in[] = $date_in;
				$ar_dates_all[]= $date_in;

				// Date out
				$model_name 	   = ontology_node::get_model_name_by_tipo($date_out_component_tipo,true); // Expected component date
				$component_date_out= component_common::get_instance(
					$model_name,
					$date_out_component_tipo,
					$locator_section_id,
					'list',
					DEDALO_DATA_NOLAN,
					$locator_section_tipo
				);
				$date_out = (array)$component_date_out->get_dato();
				$date_out = reset($date_out);
				// Compatible new date format 01-10-2018
				if (isset($date_out->start)) {
					$date_out = $date_out->start;
				}

				$ar_dates_out[] = $date_out;
				$ar_dates_all[] = $date_out;
			}
			//dump($ar_dates_in, ' ar_dates_in ++ '.to_string());
			//dump($ar_dates_out, ' ar_dates_out ++ '.to_string());
			//dump($ar_dates_all, ' ar_dates_all ++ '.to_string());

			// INTERVALS . iterate loCators and calculate intervals of time
			$ar_interval=array();
			$key_jump=0;
			$default_interval="1 day"; // used to add to the first or last row with incomplete data
			$estitmated_time_add=array(); // used to notify to user added periods when do
			$estitmated_time_undefined=false; // used to notify user added intermediate times calculated
			foreach ($ar_dates_in as $key_dates => $date_in) {

				if ($key_dates<$key_jump) {
					continue; // skip empty or already calculated dates
				}

				$date_out = $ar_dates_out[$key_dates];

				switch (true) {

					case ( !empty($date_in->year) && !empty($date_out->year) ):
						$interval = date_interval($date_in, $date_out);
						break;

					case ( empty($date_in->year) && empty($date_out->year) ):
						// Nothing to do
						$interval = null;
						break;

					case ( empty($date_in->year) && !empty($date_out->year) ):
						$date_in_default  = custom_date_add_sub($date_out, $default_interval, 'sub');
						$interval 		  = date_interval($date_in_default, $date_out);
						$estitmated_time_add[] = $interval;
						break;

					case ( !empty($date_in->year) && empty($date_out->year) ):

						if (is_last_date($ar_dates_all, $key_dates*2)===true || !empty($ar_dates_all[($key_dates*2)+2]->year)) {
							$date_out_default = custom_date_add_sub($date_in, $default_interval, 'add');
							$interval 		  = date_interval($date_in, $date_out_default);
							$estitmated_time_add[] = $interval;
						}else{
							$estitmated_time_undefined=true;
							foreach ($ar_dates_all as $key2 => $current_date_all) {
								if( $key2 <= $key_dates*2 ) continue; // ignore previous keys
								if(!empty($current_date_all->year)) {
									$interval = date_interval($date_in, $current_date_all);
									$key_jump = (int)floor($key2/2);
									if (is_out($key2)) {
										$key_jump++;
									}
									break;
								}
							}//end foreach ($ar_dates_all as $key2 => $current_date_all)
						}
						break;
				}

				if (!is_null($interval )) {
					$ar_interval[] = $interval;
				}
			}//end foreach ($ar_dates_in as $key => $value)

			// Intervals summatory
			$sum_intervals = sum_intervals($ar_interval);

			// Estimated time add total
			$sum_estitmated_time_add = sum_intervals($estitmated_time_add);

			foreach ($output as $data_map) {
				$current_id = $data_map->id;
				$current_data = new stdClass();
					$current_data->widget 	= get_class($this);
					$current_data->key  	= $key;
					$current_data->id 		= $current_id;
					$current_data->value 	= $$current_id ?? null;
				$dato[] = $current_data;
			}

		}//foreach ipo

		return $dato;
	}//end get_dato



	/**
	* GET_DATO_PARSED
	* format the data as text to be exported
	* @return array $data_parsed
	*/
	public function get_dato_parsed() : ?array  {

		$data = $this->get_dato() ?? [];
		$data_parsed = [];

		$found_sum_intervals =  array_find( $data, function($item){
			return $item->id === 'sum_intervals';
		}) ?? new stdClass();
		$sum_intervals = $found_sum_intervals->value ?? new stdClass();

		$found_sum_estitmated_time_add =  array_find( $data, function($item){
			return $item->id === 'sum_estitmated_time_add';
		}) ?? new stdClass();
		$sum_estitmated_time_add = $found_sum_estitmated_time_add->value ?? null;

		$found_estitmated_time_undefined =  array_find( $data, function($item){
			return $item->id === 'estitmated_time_undefined';
		}) ?? new stdClass();
		$estitmated_time_undefined = $found_estitmated_time_undefined->value ?? null;

		// get the text of the sum_interval
			$ar_sum_intervals = [];

			if( isset($sum_intervals->y) && $sum_intervals->y > 0 ){
				$year_label = ($sum_intervals->y > 1)
					? label::get_label( 'years' )
					: label::get_label( 'year' );
				$year_text = $sum_intervals->y.' '.$year_label;
				$ar_sum_intervals[] = $year_text;
			}
			if( isset($sum_intervals->m) && $sum_intervals->m > 0 ){
				$month_label = ($sum_intervals->m > 1)
					? label::get_label( 'months' )
					: label::get_label( 'month' );
				$month_text = $sum_intervals->m.' '.$month_label;
				$ar_sum_intervals[] = $month_text;
			}
			if( isset($sum_intervals->d) && $sum_intervals->d > 0){
				$day_label = ($sum_intervals->d > 1)
					? label::get_label( 'days' )
					: label::get_label( 'day' );
				$day_text = $sum_intervals->d.' '.$day_label;
				$ar_sum_intervals[] = $day_text;
			}

			$sum_intervals = implode(' ', $ar_sum_intervals);
			$intervals_data = new stdClass();
				$intervals_data->id = 'sum_intervals';
				$intervals_data->value = $sum_intervals;
			$data_parsed[] = $intervals_data;

		// get the text of the sum_estitmated_time_add
			$ar_sum_estitmated_time_add = [];

			if( isset($sum_estitmated_time_add->y) && $sum_estitmated_time_add->y > 0 ){
				$estimated_year_label = ($sum_estitmated_time_add->y > 1)
					? label::get_label( 'years' )
					: label::get_label( 'year' );
				$estimated_year_text = $sum_estitmated_time_add->y.' '.$estimated_year_label;
				$ar_sum_estitmated_time_add[] = $estimated_year_text;
			}
			if( isset($sum_estitmated_time_add->m) && $sum_estitmated_time_add->m > 0 ){
				$estimated_month_label = ($sum_estitmated_time_add->m > 1)
					? label::get_label( 'months' )
					: label::get_label( 'month' );
				$estimated_month_text = $estimated_year_text = $sum_estitmated_time_add->m.' '.$estimated_month_label;
				$ar_sum_estitmated_time_add[] = $estimated_month_text;
			}
			if( isset($sum_estitmated_time_add->d) && $sum_estitmated_time_add->d > 0 ){
				$estimated_day_label = ($sum_estitmated_time_add->d > 1)
					? label::get_label( 'days' )
					: label::get_label( 'day' );
				$estimated_day_text = $sum_estitmated_time_add->d.' '.$estimated_day_label;
				$ar_sum_estitmated_time_add[] = $estimated_day_text;
			}

			$ar_indeterminate = [];
			if( !empty($ar_sum_estitmated_time_add) || $estitmated_time_undefined === true){

				if( !empty($ar_sum_estitmated_time_add) ){
					$ar_indeterminate[] = implode(' ', $ar_sum_estitmated_time_add);
				}
				if( $estitmated_time_undefined === true ){

					if( !empty($ar_sum_estitmated_time_add) ){
						$ar_indeterminate[] = ' + ';
					}
					$ar_indeterminate[] = 'indeterminat';
				}
			}

			$sum_estitmated = implode('', $ar_indeterminate);
			$estitmated_data = new stdClass();
				$estitmated_data->id = 'sum_estitmated_time_add';
				$estitmated_data->value = $sum_estitmated;
			$data_parsed[] = $estitmated_data;

		// add estimated time undefined
			$time_undefined_data = new stdClass();
				$time_undefined_data->id = 'estitmated_time_undefined';
				$time_undefined_data->value = $estitmated_time_undefined;
			$data_parsed[] = $time_undefined_data;

		return $data_parsed;
	}//end get_dato_parsed




}//end sum_dates
