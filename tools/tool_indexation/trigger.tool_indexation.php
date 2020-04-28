<?php
$start_time=microtime(1);
include( dirname(dirname(dirname(dirname(__FILE__)))) .'/config/config.php');
# TRIGGER_MANAGER. Add trigger_manager to receive and parse requested data
common::trigger_manager();


