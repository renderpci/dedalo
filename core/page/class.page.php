<?php
/*
* CLASS  PAGE

	CREATE A PAGE AND INSERT HTMLOBJECT IN THE BODY
*/
abstract class page {

	/**
	* STATIC METHOD GET_HTML
	* @param $content (String or Obj)
	*/
	public static function get_html( $page_options ) {
		
		ob_start();
		include ( DEDALO_CORE_PATH .'/'. get_class() . '/' . get_class() . '.php' );
		$html = ob_get_clean();

		return $html;
	}//end get_html


}
?>