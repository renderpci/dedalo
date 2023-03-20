<?php

/**
 * Convert RDF from one format to another
 *
 * The source RDF data can either be fetched from the web
 * or typed into the Input box.
 *
 * The first thing that this script does is make a list the names of the
 * supported input and output formats. These options are then
 * displayed on the HTML form.
 *
 * The input data is loaded or parsed into an EasyRdf\Graph.
 * That graph is than outputted again in the desired output format.
 *
 * @copyright  Copyright (c) 2009-2020 Nicholas J Humfrey
 * @license    http://unlicense.org/
 */
require_once realpath(__DIR__.'/..').'/vendor/autoload.php';

require_once __DIR__.'/html_tag_helpers.php';

$input_format_options = ['Guess' => 'guess'];

$output_format_options = [];

foreach (\EasyRdf\Format::getFormats() as $format) {
    if ($format->getSerialiserClass()) {
        $output_format_options[$format->getLabel()] = $format->getName();
    }
    if ($format->getParserClass()) {
        $input_format_options[$format->getLabel()] = $format->getName();
    }
}

// Default to Guess input and Turtle output

if (!isset($_REQUEST['output_format'])) {
    $_REQUEST['output_format'] = 'turtle';
}

if (!isset($_REQUEST['input_format'])) {
    $_REQUEST['input_format'] = 'guess';
}

// Display the form, if raw option isn't set

if (!isset($_REQUEST['raw'])) {
    echo "<html>\n";
    echo "<head><title>EasyRdf Converter</title></head>\n";
    echo "<body>\n";
    echo "<h1>EasyRdf Converter</h1>\n";

    echo "<div style='margin: 10px'>\n";
    echo form_tag();
    echo label_tag('data', 'Input Data: ').'<br />'.text_area_tag('data', '', ['cols' => 80, 'rows' => 10])."<br />\n";
    echo label_tag('uri', 'or Uri: ').text_field_tag('uri', 'http://danbri.org/foaf.rdf#danbri', ['size' => 80])."<br />\n";
    echo label_tag('input_format', 'Input Format: ').select_tag('input_format', $input_format_options)."<br />\n";
    echo label_tag('output_format', 'Output Format: ').select_tag('output_format', $output_format_options)."<br />\n";
    echo label_tag('raw', 'Raw Output: ').check_box_tag('raw')."<br />\n";
    echo reset_tag().submit_tag();
    echo form_end_tag();
    echo "</div>\n";
}

if (isset($_REQUEST['uri']) || isset($_REQUEST['data'])) {
    // Parse the input
    $graph = new \EasyRdf\Graph($_REQUEST['uri']);
    if (empty($_REQUEST['data'])) {
        $graph->load($_REQUEST['uri'], $_REQUEST['input_format']);
    } else {
        $graph->parse($_REQUEST['data'], $_REQUEST['input_format'], $_REQUEST['uri']);
    }

    // Lookup the output format
    $format = \EasyRdf\Format::getFormat($_REQUEST['output_format']);

    // Serialise to the new output format
    $output = $graph->serialise($format);
    if (!is_scalar($output)) {
        $output = var_export($output, true);
    }

    // Send the output back to the client
    if (isset($_REQUEST['raw'])) {
        header('Content-Type: '.$format->getDefaultMimeType());
        echo $output;
    } else {
        echo '<pre>'.htmlspecialchars($output).'</pre>';
    }
}

if (!isset($_REQUEST['raw'])) {
    echo "</body>\n";
    echo "</html>\n";
}
