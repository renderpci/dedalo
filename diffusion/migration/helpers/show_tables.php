<?php
require_once '/Users/render/Desktop/trabajos/dedalo/v7/master_dedalo/config/bootstrap.php';

$res = DBi::_getConnection_mysql()->query("SHOW TABLES FROM web_default");
while ($row = $res->fetch_assoc()) {
    print_r($row);
}
