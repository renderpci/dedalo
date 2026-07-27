<?php declare(strict_types=1);
/**
* PREPARE_V7 (activation shim)
* Makes the "Prepare installation for v7" widget discoverable by v6's maintenance API,
* which includes DEDALO_CORE_PATH.'/area_maintenance/widgets/<model>/class.<model>.php'
* and then calls <model>::<action>() statically.
*
* The widget itself is NOT duplicated here: it lives in the migration package under
* core/area_maintenance/widgets/close_v6_prepare_v7/. This file only
*   1. points PREPARE_V7_PACKAGE_ROOT at the built package (dist/prepare_v7 — the copy
*      that carries engine/ + run/), unless the operator already set it, and
*   2. requires the package's widget class, which resolves everything from that root.
*
* Deploying to another v6 install: copy dist/prepare_v7/widget/prepare_v7/ into
* core/area_maintenance/widgets/prepare_v7/ instead of this shim (then __DIR__ resolution
* finds the package by itself), or keep a shim like this one pointing at wherever the
* package was unpacked.
*
* @package Dédalo
* @subpackage close_v6_prepare_v7
*/

// package root: env override first, then the built package inside this v6 tree
	$prepare_v7_env	= getenv('PREPARE_V7_PACKAGE_ROOT');
	$prepare_v7_pkg	= (is_string($prepare_v7_env) && $prepare_v7_env!=='' && is_dir($prepare_v7_env))
		? rtrim($prepare_v7_env, DIRECTORY_SEPARATOR)
		: DEDALO_CORE_PATH . '/area_maintenance/widgets/close_v6_prepare_v7/dist/prepare_v7';

// class source: the package source of truth (identical to the one inside dist/)
	$prepare_v7_class = DEDALO_CORE_PATH . '/area_maintenance/widgets/close_v6_prepare_v7/widget/prepare_v7/class.prepare_v7.php';
	if (!is_file($prepare_v7_class)) {
		$prepare_v7_class = $prepare_v7_pkg . '/widget/prepare_v7/class.prepare_v7.php';
	}
	if (!is_file($prepare_v7_class)) {
		throw new Exception('Error. prepare_v7 widget class not found. Is the migration package installed?', 1);
	}

	putenv('PREPARE_V7_PACKAGE_ROOT=' . $prepare_v7_pkg);

	require_once $prepare_v7_class;
