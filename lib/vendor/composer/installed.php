<?php return array(
    'root' => array(
        'name' => '__root__',
        'pretty_version' => 'dev-v6_developer',
        'version' => 'dev-v6_developer',
        'reference' => '137d2c93f2dd965f2925b426c98767e15a6eccc4',
        'type' => 'library',
        'install_path' => __DIR__ . '/../../',
        'aliases' => array(),
        'dev' => true,
    ),
    'versions' => array(
        '__root__' => array(
            'pretty_version' => 'dev-v6_developer',
            'version' => 'dev-v6_developer',
            'reference' => '137d2c93f2dd965f2925b426c98767e15a6eccc4',
            'type' => 'library',
            'install_path' => __DIR__ . '/../../',
            'aliases' => array(),
            'dev_requirement' => false,
        ),
        'easyrdf/easyrdf' => array(
            'dev_requirement' => false,
            'replaced' => array(
                0 => '1.0.*|1.1.*',
            ),
        ),
        'sweetrdf/easyrdf' => array(
            'pretty_version' => '1.8.0',
            'version' => '1.8.0.0',
            'reference' => '2c57de7380ed16f5017e95810bcd08c0dffae640',
            'type' => 'library',
            'install_path' => __DIR__ . '/../sweetrdf/easyrdf',
            'aliases' => array(),
            'dev_requirement' => false,
        ),
    ),
);
