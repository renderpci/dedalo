<?php
declare(strict_types=1);
/**
* AREA_DEVELOPMENT
*
*
*/
class area_development extends area_common {

	/**
	* GET_AR_WIDGETS
	* @return array $data_items
	*	Array of widgets object
	*/
	public function get_ar_widgets() : array {

		$ar_widgets = [];

		$DEDALO_PREFIX_TIPOS = get_legacy_constant_value('DEDALO_PREFIX_TIPOS');

		// dedalo_api_test_environment *
			// $item = new stdClass();
			// 	$item->id		= 'dedalo_api_test_environment';
			// 	$item->class	= 'width_100';
			// 	$item->typo		= 'widget';
			// 	$item->tipo		= $this->tipo;
			// 	$item->label	= 'DÉDALO API TEST ENVIRONMENT';
			// 	$item->value	= (object)[];
			// $widget = $this->widget_factory($item);
			// $ar_widgets[] = $widget;


		return $ar_widgets;
	}//end get_ar_widgets



	/**
	* WIDGET_FACTORY
	* Unified way to create an area-development widget
	* @param object $item
	* @return object $widget
	*/
	public function widget_factory(object $item) : object {

		$widget = new stdClass();
			$widget->id			= $item->id;
			$widget->class		= $item->class ?? null;
			$widget->typo		= 'widget';
			$widget->tipo		= $item->tipo ?? $this->tipo;
			$widget->parent		= $item->parent ?? $this->tipo;
			$widget->label		= $item->label ?? 'Undefined label for: '.$this->tipo;
			$widget->info		= $item->info ?? null;
			$widget->body		= $item->body  ?? null;
			$widget->run		= $item->run ?? [];
			$widget->trigger	= $item->trigger ?? null;
			$widget->value		= $item->value ?? null;


		return $widget;
	}//end widget_factory



}//end class area_development
