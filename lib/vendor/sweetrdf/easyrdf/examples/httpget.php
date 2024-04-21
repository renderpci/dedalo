<?php
/**
 * No RDF, just test EasyRdf\Http\Client
 *
 * This example does nothing but test EasyRdf's build in HTTP client.
 * It demonstrates setting Accept headers and displays the response
 * headers and body.
 *
 * @copyright  Copyright (c) 2009-2020 Nicholas J Humfrey
 * @license    http://unlicense.org/
 */
require_once realpath(__DIR__.'/..').'/vendor/autoload.php';
require_once __DIR__.'/html_tag_helpers.php';

$accept_options = [
    'text/html' => 'text/html',
    'application/rdf+xml' => 'application/rdf+xml',
    'application/xhtml+xml' => 'application/xhtml+xml',
    'application/json' => 'application/json',
    'text/turtle' => 'text/turtle',
];
?>
<html>
<head>
  <title>Test EasyRdf HTTP Client Get</title>
  <style type="text/css">
    .body
    {
      width: 800px;
      font-family: monospace;
      font-size: 0.8em;
    }
  </style>
</head>
<body>
<h1>Test EasyRdf HTTP Client Get</h1>
<?php echo form_tag(); ?>
<?php echo text_field_tag('uri', 'http://tomheath.com/id/me', ['size' => 50]); ?><br />
<?php echo label_tag('accept', 'Accept Header: ').select_tag('accept', $accept_options); ?>
<?php echo submit_tag(); ?>
<?php echo form_end_tag(); ?>

<?php
        if (isset($_REQUEST['uri'])) {
            $client = new EasyRdf\Http\Client($_REQUEST['uri']);
            $client->setHeaders('Accept', $_REQUEST['accept']);
            $response = $client->request(); ?>

    <p class="status">
    <b>Status</b>: <?php echo $response->getStatus(); ?><br />
    <b>Message</b>: <?php echo $response->getMessage(); ?><br />
    <b>Version</b>: HTTP/<?php echo $response->getVersion(); ?><br />
    </p>

    <p class="headers">
    <?php
            foreach ($response->getHeaders() as $name => $value) {
                echo "<b>$name</b>: $value<br />\n";
            } ?>
    </p>

    <p class="body">
      <?php
            if (defined('ENT_SUBSTITUTE')) {
                // This is needed for PHP 5.4+
                echo nl2br(htmlentities($response->getBody(), \ENT_SUBSTITUTE | \ENT_QUOTES));
            } else {
                echo nl2br(htmlentities($response->getBody()));
            } ?>
    </p>

<?php
        }
?>

</body>
</html>
