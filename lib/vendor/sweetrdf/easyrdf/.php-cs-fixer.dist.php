<?php

use PhpCsFixer\Config;
use PhpCsFixer\Finder;

$finder = Finder::create()
    ->in(__DIR__ .'/examples')
    ->in(__DIR__ .'/lib')
    ->in(__DIR__ .'/test')
    ->name('*.php')
;

$config = new Config();
$config
    ->setFinder($finder)
    ->setRules([
        '@Symfony' => true,
        'phpdoc_summary' => false,
    ])
;

return $config;
