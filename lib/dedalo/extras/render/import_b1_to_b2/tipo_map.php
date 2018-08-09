<?php
require_once( dirname(dirname(dirname(dirname(__FILE__)))) .'/config/config4.php');

if(login::is_logged()!==true) die("<span class='error'> Auth error: please login </span>");

if ($_SESSION['dedalo4']['auth']['user_id']!=='-1' || strpos(DEDALO_HOST, '8888')===false) {
	die("<span class='error'> Auth error: please login as admin in development host </span>");
}

#echo map_tipos('dd334');

function map_tipos($current_tipo){
	$mapeo = array(
		'dd334' 	=> 'mupreva1',
		'dd1112' 	=> 'mupreva2',
		'dd1114' 	=> 'mupreva13',
		'dd1113' 	=> 'mupreva14',
		'dd495' 	=> 'mupreva15',
		'dd496' 	=> 'mupreva16',
		'dd1124' 	=> 'mupreva3',
		'dd1125' 	=> 'mupreva17',
		'dd20' 		=> 'rsc2',
		'dd342' 	=> 'rsc5',
		'dd845' 	=> 'rsc19',
		'dd1280' 	=> 'rsc20',
		'dd1115' 	=> 'rsc21',
		'dd345' 	=> 'rsc22',
		'dd967' 	=> 'rsc23',
		'dd1116' 	=> 'rsc24',
		'dd1131' 	=> 'rsc25',
		'dd968' 	=> 'rsc26',
		'dd847' 	=> 'rsc27',
		'dd364' 	=> 'rsc28',
		'dd120' 	=> 'rsc6',
		'dd750' 	=> 'rsc29',
		'dd751' 	=> 'rsc30',
		'dd122' 	=> 'rsc31',
		'dd368' 	=> 'rsc32',
		'dd1110' 	=> 'rsc33',
		'dd851' 	=> 'rsc34',
		'dd970' 	=> 'rsc7',
		'dd732' 	=> 'rsc35',
		'dd343' 	=> 'rsc36',
		'dd331' 	=> 'rsc8',
		'dd537' 	=> 'rsc37',
		'dd565' 	=> 'rsc38',
		'dd118' 	=> 'rsc9',
		'dd119' 	=> 'rsc39',
		'dd121' 	=> 'rsc40',
		'dd822' 	=> 'rsc41',
		'dd140' 	=> 'rsc42',
		'dd139' 	=> 'rsc43',
		'dd931' 	=> 'rsc10',
		'dd896' 	=> 'rsc44',
		'dd897' 	=> 'rsc45',
		'dd903' 	=> 'rsc46',
		'dd25' 		=> 'rsc47',
		'dd933' 	=> 'rsc48',
		'dd934' 	=> 'rsc49',
		'dd935' 	=> 'rsc50',
		'dd936' 	=> 'rsc51',
		'dd202' 	=> 'rsc52',
		'dd1014' 	=> 'rsc53',
		'dd971' 	=> 'rsc11',
		'dd972' 	=> 'rsc54',
		'dd974' 	=> 'rsc55',
		'dd973' 	=> 'rsc56',
		'dd969' 	=> 'rsc57',
		'dd975' 	=> 'rsc58',
		'dd984' 	=> 'rsc59',
		'dd992' 	=> 'rsc60',
		'dd937' 	=> 'rsc12',
		'dd938' 	=> 'rsc61',
		'dd939' 	=> 'rsc62',
		'dd940' 	=> 'rsc63',
		'dd993' 	=> 'rsc13',
		'dd1006' 	=> 'rsc64',
		'dd1004' 	=> 'rsc65',
		'dd1005' 	=> 'rsc66',
		'dd1003' 	=> 'rsc67',
		'dd994' 	=> 'rsc14',
		'dd1008' 	=> 'rsc68',
		'dd1007' 	=> 'rsc69',
		'dd1009' 	=> 'rsc15',
		'dd1010' 	=> 'rsc70',
		'dd1012' 	=> 'rsc71',
		'dd1076' 	=> 'rsc72',
		'dd1011' 	=> 'rsc73',
		'dd1013' 	=> 'rsc74',
		'dd16' 		=> 'rsc75',
		'dd449' 	=> 'rsc76',
		'dd72' 		=> 'rsc85',
		'dd77' 		=> 'rsc86',
		'dd919' 	=> 'rsc87',
		'dd907' 	=> 'rsc88',
		'dd1066' 	=> 'rsc89',
		'dd921' 	=> 'rsc90',
		'dd859' 	=> 'rsc91',
		'dd869' 	=> 'rsc92',
		'dd860' 	=> 'rsc93',
		'dd867' 	=> 'rsc94',
		'dd920' 	=> 'rsc95',
		'dd956' 	=> 'rsc96',
		'dd871' 	=> 'rsc97',
		'dd362' 	=> 'rsc98',
		'dd406' 	=> 'rsc99',
		'dd917' 	=> 'rsc77',
		'dd868' 	=> 'rsc100',
		'dd87' 		=> 'rsc101',
		'dd286' 	=> 'rsc102',
		'dd870' 	=> 'rsc103',
		'dd872' 	=> 'rsc104'
		);

	if(in_array($current_tipo, array_keys($mapeo))){
		return $mapeo[$current_tipo];
	}else{
		return $current_tipo;
	}


}
