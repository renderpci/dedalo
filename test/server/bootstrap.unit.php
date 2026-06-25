<?php declare(strict_types=1);

// Hermetic unit bootstrap for the Dédalo v7 config-foundation classes.
// NO config, NO database, NO session — foundation tests require their
// class-under-test directly. This is the `TEST` boot profile from the
// config+bootstrap design spec, in its smallest form.
define('IS_UNIT_TEST', true);

error_reporting(E_ALL & ~E_DEPRECATED);
