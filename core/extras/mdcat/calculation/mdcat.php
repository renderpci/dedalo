<?php
/**
* Calculation formulas to mdcat
*/


// expressos



    /**
    * CALCULATE_PERIOD
    * @param object $options
    * @return array $period
    *   Array of objects
    */
    function calculate_period($request_options) {

        $params = is_string($request_options)
            ? json_decode($request_options)
            : $request_options;

    	$data          = $params->data;
        $options       = $params->options;
    	$total_days    = $data->total_days;
        $month_days    = 30.42;

    	$years         = floor($total_days / 365);
    	$years_days    = $total_days - ($years * 365);
    	$total_months  = floor($total_days / $month_days);

    	$months        = floor($years_days / $month_days);
    	$days          = floor($years_days - ($months * $month_days));

    	$period = [];

        // $years
        	if($years > 0 && $options->years === true){

                $period[] = (object)[
                    'id' => 'years',
                    'value' => $years
                ];
        	}

        // $months
        	if($months > 0 && $options->months === true){

                $current_id    = ($options->total === true) ? 'total_months' : 'months';
                $current_value = ($options->total === true) ? $total_months : $months;

                $period[] = (object)[
                    'id' => $current_id,
                    'value' => $current_value,
                ];
        	}

        // $days
    	   if($days > 0 && $options->days === true){

                $current_id    = ($options->total === true) ? 'total_days' : 'days';
                $current_value = ($options->total === true) ? $total_days : $days;

                $period[] = (object)[
                    'id' => $current_id,
                    'value' => $current_value,
                ];
        	}

        return $period;
    }//end calculate_period



    /**
    * calculate_period
    * @return
    */
    // function calculate_period__DES($options) {
    //
    // 	$data          = $options->data;
    // 	$total_days    = $data->total_days;
    //
    // 	$years         = floor($total_days / 365);
    // 	$years_days    = $total_days - (years * 365);
    // 	$total_months  = floor($total_days / 30.42);
    //
    // 	$months        = 0;
    // 	$days          = 0;
    //
    // 	$months        = floor($years_days / 30.42);
    // 	$days          = floor($years_days - ($months * 30.42));
    //
    // 	$period = [];
    //
    // 	if($years > 0 && $options->years === true){
    // 		$year_label = $years == 1
    //             ? label::get_label("anyo")
    //             : label::get_label("anyos");
    //
    //         $year_value = ($options->label===true)
    //             ? $years .' '. $year_label
    //             : $years;
    //
    // 		$period[] = $year_value;
    // 	}
    //
    // 	if($months > 0 && $options->months === true){
    // 		$months_label = $months == 1
    //             ? label::get_label("mes")
    //             : label::get_label("meses");
    //
    // 		$months_value = "";
    // 		if($options->total === true){
    // 			$months_value = ($options->label===true)
    //                 ? $total_months . ' ' . $months_label
    //                 : $total_months;
    // 		}else{
    // 			$months_value = ($options->label===true)
    //                 ? $months . ' ' . $months_label
    //                 : $months;
    // 		}
    // 		$period[] = $months_value;
    // 	}
    //
    // 	if($days > 0 && $options->days === true){
    // 		$days_label = $days == 1
    //             ? label::get_label("dia")
    //             : label::get_label("dias");
    //
    //         $days_value = "";
    // 		if($options->total === true){
    // 			$days_value = ($options->label===true)
    //                 ? $total_days . ' ' . $days_label
    //                 : $total_days;
    // 		}else{
    // 			$days_value = ($options->label===true)
    //                 ? $days . ' ' . $days_label
    //                 : $days;
    // 		}
    // 		$period[] = $days_value;
    // 	}
    //
    // 	$result = implode(', ', $period);
    //
    //     return $result;
    // }//end calculate_period__DES



    /**
    * calculate_import_major
    * @return
    */
    function calculate_import_major($options) {

        $data = $options->data;
        $total_days = $data->total_days;
        if($total_days === 0){
        	return 0;
        }

        $years            = floor($total_days / 365);
        $years_days       = $total_days - (years * 365);
        $total_months     = floor($total_days / 30.42);

        $days             = floor($total_days - ($total_months * 30.4));

        $cal_import = 0;

        if($days > 0){
        	$total_months = $total_months + 1;
        }
        if($total_months <= 6){
        	$cal_import = 150000;
        }else{
        	$cal_import = (($total_months - 6) * 28000) + 150000;
        }
        if ($cal_import > 1000000) {
        	$cal_import = 1000000;
        }

        $result = $cal_import;

        return $result;
    }//end calculate_import_major


    /**
    * calculate_import_minor
    * @return
    */
    function calculate_import_minor($options) {

        $data = $options->data;
        $total_days = $data->total_days;
        if($total_days === 0){
        	return 0;
        }

        $years            = floor($total_days / 365);
        $years_days       = $total_days - (years * 365);
        $total_months     = floor($total_days / 30.42);
        $days             = floor($total_days - ($total_months * 30.4));

        $cal_import = 0;

        if($days > 0){
        	$total_months = $total_months + 1;
        }
        if($total_months <= 6){
        	$cal_import = 900;
        }else{
        	$cal_import = (($total_months - 6) * 170) +900;
        }
        if ($cal_import > 6010) {
        	$cal_import = 6010;
        }

        $result = $cal_import;

        return $result;
    }//end calculate_import_minor


    function to_euros($request_options){

        $options = is_string($request_options)
            ? json_decode($request_options)
            : $request_options;

        $data   = $options->data;
        $opt    = $options->options;

		$numero = $data->numero;

        $total = $numero / 166.386;

        $result[] = (object)[
            'id' => 'total',
            'value' => $total,
        ];
		return $result;
	}
