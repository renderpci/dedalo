<?php
/**
 * Display the basic information in a FOAF document
 *
 * The example starts by loading the requested FOAF document
 * from the web. It then tries to work out if the URI given
 * was for the person or the document about the person.
 *
 * If a person is found, then the person's name, homepage
 * and description are shown, along with a list of the
 * person's friends.
 *
 * @copyright  Copyright (c) 2009-2014 Nicholas J Humfrey
 * @license    http://unlicense.org/
 */
require_once realpath(__DIR__.'/..').'/vendor/autoload.php';
require_once __DIR__.'/html_tag_helpers.php';
?>
<html>
<head><title>EasyRdf FOAF Info Example</title></head>
<body>
<h1>EasyRdf FOAF Info Example</h1>

<?php echo form_tag(); ?>
<?php echo text_field_tag('uri', 'http://njh.me/foaf.rdf', ['size' => 50]); ?>
<?php echo submit_tag(); ?>
<?php echo form_end_tag(); ?>

<?php
        if (isset($_REQUEST['uri'])) {
            $graph = EasyRdf\Graph::newAndLoad($_REQUEST['uri']);
            if ('foaf:PersonalProfileDocument' == $graph->type()) {
                $person = $graph->primaryTopic();
            } elseif ('foaf:Person' == $graph->type()) {
                $person = $graph->resource();
            }
        }

if (isset($person)) {
    ?>

<dl>
  <dt>Name:</dt><dd><?php echo $person->get('foaf:name'); ?></dd>
  <dt>Homepage:</dt><dd><?php echo link_to($person->get('foaf:homepage')); ?></dd>
</dl>

<?php
    echo "<h2>Known Persons</h2>\n";
    echo "<ul>\n";
    foreach ($person->all('foaf:knows') as $friend) {
        $label = $friend->label();
        if (!$label) {
            $label = $friend->getUri();
        }

        if ($friend->isBNode()) {
            echo "<li>$label</li>";
        } else {
            echo '<li>'.link_to_self($label, 'uri='.urlencode($friend)).'</li>';
        }
    }
    echo "</ul>\n";

    echo "<h2>Interests</h2>\n";
    echo "<ul>\n";
    foreach ($person->all('foaf:interest') as $interest) {
        $label = $interest->label();
        if ($label) {
            if ($interest->isBNode()) {
                echo "<li>$label</li>";
            } else {
                echo '<li>'.$interest->htmlLink($label).'</li>';
            }
        }
    }
    echo "</ul>\n";
}

if (isset($graph)) {
    echo '<br />';
    echo $graph->dump();
}
?>
</body>
</html>
