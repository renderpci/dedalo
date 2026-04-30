<?php
session_id('135982eada0475fd7d501d533f40cc2d'); session_start();
session_write_close();
$argv = [NULL];
$argv[1] = '{"class_name":"ThisClassDoesNotExist","method_name":"any","user_id":1,"session_id":"135982eada0475fd7d501d533f40cc2d","server":[]}';
include '/Users/render/Desktop/trabajos/dedalo/v7/master_dedalo/core/base/process_runner.php';
