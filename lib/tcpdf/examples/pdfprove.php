<?php
require_once('config/tcpdf_config_alt.php');
require_once('../tcpdf_parser.php');
require_once('../../dedalo/config/config4.php');

$filename = "El_pasado_en_su_lugar_2014.pdf";

$rawdata = file_get_contents($filename);

$parse = new TCPDF_PARSER(ltrim($rawdata));

	list($xref, $data) = $parse->getParsedData();
	dump($xref,'$xref');
	dump($data,'$data');die();

        if (isset($xref['trailer']['encrypt'])) {
            throw new \Exception('Secured pdf file are currently not supported.');
        }

        if (empty($data)) {
            throw new \Exception('Object list not found. Possible secured file.');
        }

        // Create destination object.
        $document      = new Document();
        $this->objects = array();

        foreach ($data as $id => $structure) {
            $this->parseObject($id, $structure, $document);
        }

        $document->setTrailer($this->parseTrailer($xref['trailer'], $document));
        $document->setObjects($this->objects);



?>