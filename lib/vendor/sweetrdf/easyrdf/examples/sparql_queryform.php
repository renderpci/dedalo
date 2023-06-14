<?php
/**
 * Form to submit and display SPARQL queries
 *
 * This example presents a form that you can enter the URI
 * of a a SPARQL endpoint and a SPARQL query into. The
 * results are displayed using a call to dump() on what will be
 * either a EasyRdf\Sparql\Result or EasyRdf\Graph object.
 *
 * A list of registered namespaces is displayed above the query
 * box - any of these namespaces can be used in the query and PREFIX
 * statements will automatically be added to the start of the query
 * string.
 *
 * @copyright  Copyright (c) 2009-2014 Nicholas J Humfrey
 * @license    http://unlicense.org/
 */
require_once realpath(__DIR__.'/..').'/vendor/autoload.php';
require_once __DIR__.'/html_tag_helpers.php';
?>
<html>
<head>
  <title>EasyRdf SPARQL Query Form</title>
  <style type="text/css">
    .error {
      width: 35em;
      border: 2px red solid;
      padding: 1em;
      margin: 0.5em;
      background-color: #E6E6E6;
    }
  </style>
</head>
<body>
<h1>EasyRdf SPARQL Query Form</h1>

<div style="margin: 0.5em">
  <?php
        echo form_tag();
echo label_tag('endpoint');
echo text_field_tag('endpoint', 'http://dbpedia.org/sparql', ['size' => 80]).'<br />';
echo '<code>';
foreach (\EasyRdf\RdfNamespace::namespaces() as $prefix => $uri) {
    echo "PREFIX $prefix: &lt;".htmlspecialchars($uri)."&gt;<br />\n";
}
echo '</code>';
echo text_area_tag('query', "SELECT * WHERE {\n  ?s ?p ?o\n}\nLIMIT 10", ['rows' => 10, 'cols' => 80]).'<br />';
echo check_box_tag('text').label_tag('text', 'Plain text results').'<br />';
echo reset_tag().submit_tag();
echo form_end_tag();
?>
</div>

<?php
if (isset($_REQUEST['endpoint']) && isset($_REQUEST['query'])) {
    $sparql = new \EasyRdf\Sparql\Client($_REQUEST['endpoint']);
    try {
        $results = $sparql->query($_REQUEST['query']);
        if (isset($_REQUEST['text'])) {
            echo '<pre>'.htmlspecialchars($results->dump('text')).'</pre>';
        } else {
            echo $results->dump('html');
        }
    } catch (Exception $e) {
        echo "<div class='error'>".$e->getMessage()."</div>\n";
    }
}
?>

</body>
</html>
