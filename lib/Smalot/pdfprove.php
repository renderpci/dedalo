<?php

header('Content-Type: text/html; charset=utf-8');

require_once('../tcpdf/config/tcpdf_config.php');
require_once('../tcpdf/tcpdf_parser.php');
require_once('PdfParser/Parser.php');
require_once('PdfParser/Document.php');
require_once('PdfParser/Header.php');
require_once('PdfParser/Object.php');

require_once('PdfParser/Font.php');
require_once('PdfParser/Element.php');
require_once('PdfParser/Encoding.php');

require_once('PdfParser/Encoding/ISOLatin1Encoding.php');
require_once('PdfParser/Encoding/ISOLatin9Encoding.php');
require_once('PdfParser/Encoding/MacRomanEncoding.php');
require_once('PdfParser/Encoding/StandardEncoding.php');
require_once('PdfParser/Encoding/WinAnsiEncoding.php');

require_once('PdfParser/Page.php');
require_once('PdfParser/Pages.php');
require_once('PdfParser/XObject/Image.php');

require_once('PdfParser/Element/ElementArray.php');
require_once('PdfParser/Element/ElementXRef.php');
require_once('PdfParser/Element/ElementMissing.php');
require_once('PdfParser/Element/ElementNumeric.php');
require_once('PdfParser/Element/ElementName.php');
require_once('PdfParser/Element/ElementBoolean.php');
require_once('PdfParser/Element/ElementString.php');
require_once('PdfParser/Element/ElementDate.php');
require_once('PdfParser/Element/ElementHexa.php');
require_once('PdfParser/Element/ElementNull.php');
require_once('PdfParser/Element/ElementStruct.php');

require_once('PdfParser/Font/FontTrueType.php');
require_once('PdfParser/Font/FontTrueType.php');


#require_once('../dedalo/config/config4.php');

$filename = "El_pasado_en_su_lugar_2014.pdf";

$parser = new \Smalot\PdfParser\Parser();
$pdf    = $parser->parseFile($filename);

$pages  = $pdf->getPages();

 $i = 0;
foreach ($pages as $page) {
    echo $page->getText();
    echo "<br>";
    echo "PAGE : " + $i++;
    echo "<br>";

}

#$text = $pdf->getText();
#echo $text;

#dump($text,'$text');
?>