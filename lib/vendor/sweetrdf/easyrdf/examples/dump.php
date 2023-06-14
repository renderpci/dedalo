<?php
/**
 * Display the contents of a graph
 *
 * Data from the chosen URI is loaded into an EasyRdf\Graph object.
 * Then the graph is dumped and printed to the page using the
 * $graph->dump() method.
 *
 * The call to preg_replace() replaces links in the page with
 * links back to this dump script.
 *
 * @copyright  Copyright (c) 2009-2014 Nicholas J Humfrey
 * @license    http://unlicense.org/
 */
require_once realpath(__DIR__.'/..').'/vendor/autoload.php';
require_once __DIR__.'/html_tag_helpers.php';
?>
<html>
<head><title>EasyRdf Graph Dumper</title></head>
<body>
<h1>EasyRdf Graph Dumper</h1>

<div style="margin: 10px">
  <?php echo form_tag(); ?>
  URI: <?php echo text_field_tag('uri', 'http://mmt.me.uk/foaf.rdf', ['size' => 80]); ?><br />
  Format: <?php echo label_tag('format_html', 'HTML').' '.radio_button_tag('format', 'html', true); ?>
          <?php echo label_tag('format_text', 'Text').' '.radio_button_tag('format', 'text'); ?><br />

  <?php echo submit_tag(); ?>
  <?php echo form_end_tag(); ?>
</div>

<?php
if (isset($_REQUEST['uri'])) {
    $graph = \EasyRdf\Graph::newAndLoad($_REQUEST['uri']);
    if (isset($_REQUEST['format']) && 'text' == $_REQUEST['format']) {
        echo '<pre>'.$graph->dump('text').'</pre>';
    } else {
        $dump = $graph->dump('html');
        echo preg_replace_callback("/ href='([^#][^']*)'/", 'makeLinkLocal', $dump);
    }
}

// Callback function to re-write links in the dump to point back to this script
function makeLinkLocal($matches)
{
    $href = $matches[1];

    return " href='?uri=".urlencode($href)."#$href'";
}
?>
</body>
</html>
