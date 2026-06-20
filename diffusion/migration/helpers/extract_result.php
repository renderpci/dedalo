<?php
require_once __DIR__ . '/../../../config/bootstrap.php';
$conn = DBi::_getConnection_mysql();
$target_db = 'web_default';
$target_table = 'interview';
$query = "SELECT * FROM `$target_db`.`$target_table` WHERE section_id = 1";
$res = $conn->query($query);
$rows = [];
while ($row = $res->fetch_assoc()) {
    $rows[] = $row;
}
echo json_encode($rows, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
