<?php
require_once __DIR__ . '/../../../config/config.php';
$conn = DBi::_getConnection();
$sql = "SELECT tipo, term FROM dd_ontology WHERE model = 'diffusion_element'";
$res = pg_query($conn, $sql);
$elements = [];
while ($row = pg_fetch_assoc($res)) {
    $elements[] = $row;
}
echo json_encode($elements, JSON_PRETTY_PRINT);
