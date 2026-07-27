<?php
require_once __DIR__ . '/../../../config/bootstrap.php';

$diffusion_class_name = 'diffusion_mysql';
require_once DEDALO_DIFFUSION_PATH . '/class.diffusion_mysql.php';

$diffusion = new diffusion_mysql((object)[
    'diffusion_element_tipo' => 'oh63'
]);

try {
$update_record_response = $diffusion->update_record((object)[
    'section_tipo'           => 'oh1',
    'section_id'             => 1,
    'diffusion_element_tipo' => 'oh63',
    'resolve_references'     => true
]);
print_r($update_record_response);
} catch (Throwable $t) {
    echo $t->getMessage() . "\n" . $t->getTraceAsString();
}
