<!DOCTYPE html>
<html>
<head>
  <title>EasyRdf Examples</title>
</head>
<body>
<h1>EasyRdf Examples</h1>
<?php
  $dh = opendir(__DIR__);
if (!$dh) {
    exit('Failed to open directory: '.__DIR__);
}

$exampleList = [];
while (($filename = readdir($dh)) !== false) {
    if ('.' == substr($filename, 0, 1)
        || 'index.php' == $filename
        || 'html_tag_helpers.php' == $filename) {
        continue;
    }

    $exampleList[] = $filename;
}
closedir($dh);

sort($exampleList);

echo '<ul>';
foreach ($exampleList as $example) {
    echo "<li><a href='./$example'>$example</a></li>\n";
}
echo '</ul>';
?>
</body>
</html>
