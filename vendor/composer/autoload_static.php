<?php

// autoload_static.php @generated by Composer

namespace Composer\Autoload;

class ComposerStaticInitf20ee85e863585bbf23a73c4501f9f6e
{
    public static $prefixLengthsPsr4 = array (
        'R' => 
        array (
            'RobRichards\\XMLSecLibs\\' => 23,
        ),
        'O' => 
        array (
            'OneLogin\\' => 9,
        ),
        'M' => 
        array (
            'MaxMind\\WebService\\' => 19,
            'MaxMind\\Exception\\' => 18,
            'MaxMind\\Db\\' => 11,
        ),
        'G' => 
        array (
            'GeoIp2\\' => 7,
        ),
        'E' => 
        array (
            'EasyRdf\\' => 8,
        ),
        'C' => 
        array (
            'Composer\\CaBundle\\' => 18,
        ),
    );

    public static $prefixDirsPsr4 = array (
        'RobRichards\\XMLSecLibs\\' => 
        array (
            0 => __DIR__ . '/..' . '/robrichards/xmlseclibs/src',
        ),
        'OneLogin\\' => 
        array (
            0 => __DIR__ . '/..' . '/onelogin/php-saml/src',
        ),
        'MaxMind\\WebService\\' => 
        array (
            0 => __DIR__ . '/..' . '/maxmind/web-service-common/src/WebService',
        ),
        'MaxMind\\Exception\\' => 
        array (
            0 => __DIR__ . '/..' . '/maxmind/web-service-common/src/Exception',
        ),
        'MaxMind\\Db\\' => 
        array (
            0 => __DIR__ . '/..' . '/maxmind-db/reader/src/MaxMind/Db',
        ),
        'GeoIp2\\' => 
        array (
            0 => __DIR__ . '/..' . '/geoip2/geoip2/src',
        ),
        'EasyRdf\\' => 
        array (
            0 => __DIR__ . '/..' . '/easyrdf/easyrdf/lib',
        ),
        'Composer\\CaBundle\\' => 
        array (
            0 => __DIR__ . '/..' . '/composer/ca-bundle/src',
        ),
    );

    public static $classMap = array (
        'Composer\\InstalledVersions' => __DIR__ . '/..' . '/composer/InstalledVersions.php',
        'lessc' => __DIR__ . '/..' . '/leafo/lessphp/lessc.inc.php',
        'lessc_formatter_classic' => __DIR__ . '/..' . '/leafo/lessphp/lessc.inc.php',
        'lessc_formatter_compressed' => __DIR__ . '/..' . '/leafo/lessphp/lessc.inc.php',
        'lessc_formatter_lessjs' => __DIR__ . '/..' . '/leafo/lessphp/lessc.inc.php',
        'lessc_parser' => __DIR__ . '/..' . '/leafo/lessphp/lessc.inc.php',
    );

    public static function getInitializer(ClassLoader $loader)
    {
        return \Closure::bind(function () use ($loader) {
            $loader->prefixLengthsPsr4 = ComposerStaticInitf20ee85e863585bbf23a73c4501f9f6e::$prefixLengthsPsr4;
            $loader->prefixDirsPsr4 = ComposerStaticInitf20ee85e863585bbf23a73c4501f9f6e::$prefixDirsPsr4;
            $loader->classMap = ComposerStaticInitf20ee85e863585bbf23a73c4501f9f6e::$classMap;

        }, null, ClassLoader::class);
    }
}