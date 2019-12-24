<?php
/*

	DEPRECATED

*/

















/*
* CLASS PDF_PARSER
* Manage the pdf parser for the pages of the print layout
*/
require_once( DEDALO_CONFIG_PATH .'/config.php');
require_once( DEDALO_ROOT .'/lib/tcpdf/tcpdf.php');


class pdf_parser {

	protected $pages;	# received pages html

	/**
	* __CONSTRUCT
	* @param obj $section_obj section object full
	* @param string $modo like 'page' (default)
	*/
	public function __construct($pages, $template_name) {

		// create new PDF document
		//$orientation='P', $unit='mm', $format='A4', $unicode=true, $encoding='UTF-8', $diskcache=false, $pdfa=false
		$pdf = new TCPDF(PDF_PAGE_ORIENTATION, PDF_UNIT, PDF_PAGE_FORMAT, true, 'UTF-8', false);


		// set document information
		$pdf->SetCreator(PDF_CREATOR);
		$pdf->SetAuthor('Dédalo v4');
		$pdf->SetTitle($template_name);
		//$pdf->SetSubject('TCPDF Tutorial');
		//$pdf->SetKeywords('TCPDF, PDF, example, test, guide');

		// set default header data
		//$pdf->SetHeaderData(PDF_HEADER_LOGO, PDF_HEADER_LOGO_WIDTH, PDF_HEADER_TITLE.' 061', PDF_HEADER_STRING);

		// set header and footer fonts
		//$pdf->setHeaderFont(Array(PDF_FONT_NAME_MAIN, '', PDF_FONT_SIZE_MAIN));
		//$pdf->setFooterFont(Array(PDF_FONT_NAME_DATA, '', PDF_FONT_SIZE_DATA));

		// set default monospaced font
		$pdf->SetDefaultMonospacedFont(PDF_FONT_MONOSPACED);

		// set margins
		$pdf->SetMargins(PDF_MARGIN_LEFT, PDF_MARGIN_TOP, PDF_MARGIN_RIGHT);
		//$pdf->SetHeaderMargin(PDF_MARGIN_HEADER);
		//$pdf->SetFooterMargin(PDF_MARGIN_FOOTER);

		// set auto page breaks
		$pdf->SetAutoPageBreak(TRUE, PDF_MARGIN_BOTTOM);

		// set image scale factor
		$pdf->setImageScale(PDF_IMAGE_SCALE_RATIO);

		// set some language-dependent strings (optional)
		if (@file_exists(dirname(__FILE__).'/lang/eng.php')) {
			require_once(dirname(__FILE__).'/lang/eng.php');
			$pdf->setLanguageArray($l);
		}

		// ---------------------------------------------------------

		// set font
		$pdf->SetFont('helvetica', '', 10);

		foreach ($pages as $page => $html) {
				// add a page
				//$orientation = 'P or PORTRAIT (default) L or LANDSCAPE',$format = '',$keepmargins = false, $tocpage = false 
				$pdf->AddPage();

				//parse the HTML writeHTML
				//1 $html	(string) text to display ,
				//2 if true add a new line after text ,
				//3 background must be painted (true) or transparent (false).
				//4 if true reset the last cell height 
				//5 if true add the current left (or right for RTL) padding to each Write
				//6 Allows to center or align the text. Possible values are: 
						//L : left align
						//C : center
						//R : right align
						//'' : empty string : left for LTR or right for RTL
				$pdf->writeHTML($html, true, false, false, false, '');
				$pdf->lastPage();
		}

		//Close and output PDF document, FI= F save to disk, I send to the browser
		$pdf->Output(DEDALO_CORE_PATH . "/tools/tool_layout_print/print_pdf/".$template_name.'.pdf', 'FI');
			
	}
	
};#end tool_layout_print
?>