<?php

header('Content-Type: text/html; charset=utf-8');

$lib_path = DEDALO_ROOT."/lib/Smalot/PdfParser/";
$lib_tcpdf_path = DEDALO_ROOT."/lib/tcpdf/";

require_once($lib_tcpdf_path.'config/tcpdf_config.php');
require_once($lib_tcpdf_path.'tcpdf_parser.php');

require_once($lib_path.'Object.php');

require_once($lib_path.'Document.php');
require_once($lib_path.'Element.php');
require_once($lib_path.'Encoding.php');
require_once($lib_path.'Font.php');
require_once($lib_path.'Header.php');

require_once($lib_path.'Page.php');
require_once($lib_path.'Pages.php');
require_once($lib_path.'Parser.php');


# Encoding
require_once($lib_path.'Encoding/ISOLatin1Encoding.php');
require_once($lib_path.'Encoding/ISOLatin9Encoding.php');
require_once($lib_path.'Encoding/MacRomanEncoding.php');
require_once($lib_path.'Encoding/StandardEncoding.php');
require_once($lib_path.'Encoding/WinAnsiEncoding.php');

# XObject
require_once($lib_path.'XObject/Image.php');
require_once($lib_path.'XObject/Form.php');

# Element
require_once($lib_path.'Element/ElementArray.php');
require_once($lib_path.'Element/ElementXRef.php');
require_once($lib_path.'Element/ElementMissing.php');
require_once($lib_path.'Element/ElementNumeric.php');
require_once($lib_path.'Element/ElementName.php');
require_once($lib_path.'Element/ElementBoolean.php');
require_once($lib_path.'Element/ElementString.php');
require_once($lib_path.'Element/ElementDate.php');
require_once($lib_path.'Element/ElementHexa.php');
require_once($lib_path.'Element/ElementNull.php');
require_once($lib_path.'Element/ElementStruct.php');

# Font
require_once($lib_path.'Font/FontTrueType.php');
require_once($lib_path.'Font/FontCIDFontType0.php');
require_once($lib_path.'Font/FontCIDFontType2.php');
require_once($lib_path.'Font/FontType1.php');
require_once($lib_path.'Font/FontType0.php');


#require_once('../dedalo/config/config4.php');

//$filename = "El_pasado_en_su_lugar_2014.pdf";

$parser = new \Smalot\PdfParser\Parser();
$pdf    = $parser->parseFile($path_pdf);

$pages  = $pdf->getPages();

$pdf_text = '';

$i=1;
foreach ($pages as $page) {

	if($i>1) {
		$pdf_text .= '<br>';
	}
    $pdf_text .= '[page-n-'. $i .']';
    $pdf_text .= '<br>';
    $pdf_text .= $page->getText();

    $i++;
}

#$text = $pdf->getText();
#echo $text;

#dump($text,'$text');
?>