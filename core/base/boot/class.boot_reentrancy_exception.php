<?php declare(strict_types=1);

/**
* BOOT_REENTRANCY_EXCEPTION
* Thrown when boot::run() is invoked again while a boot is already IN_PROGRESS
* (e.g. a class autoloaded during boot triggers boot again). A DISTINCT type so
* callers — notably a Phase-3b shutdown handler — can tell a structural
* re-entrancy bug from an ordinary phase failure by exception type, not by
* parsing failed_phase().
*/
final class boot_reentrancy_exception extends \RuntimeException {}
