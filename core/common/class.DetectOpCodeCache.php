<?php

namespace DetectOpCodeCache;

/**
 * PHP Opcode-Cache detection
 *
 * @author Alexander Over <cyberline@php.net>
 */
final class DetectOpCodeCache
{
  final public static function checkAll()
  {
    return (self::hasXcache() ||
      self::hasWincache() ||
      self::hasApc() ||
      self::hasEaccelerator() ||
      self::hasIoncube() ||
      self::hasZend() ||
      self::hasNusphere() ||
      self::hasOpCode()
    );
  }

  /**
   * check if we have Xcache
   *
   * @link http://xcache.lighttpd.net
   * @return bool
   */
  public static function hasXcache()
  {
    return function_exists('xcache_isset');
  }

  /**
   * check if we have Wincache
   *
   * @link http://www.iis.net/expand/WinCacheForPHP
   * @return bool
   */
  public static function hasWincache()
  {
    return function_exists('wincache_fcache_fileinfo');
  }

  /**
   * check if we have Alternative PHP Cache
   *
   * @link http://pecl.php.net/package/apc
   * @return bool
   */
  public static function hasApc()
  {
    return function_exists('apc_add');
  }

  /**
   * check if we have eAccelerator
   *
   * @link http://eaccelerator.net
   * @return bool
   */
  public static function hasEaccelerator()
  {
    // !empty doesn't work, because no variable 
    return (bool)strlen(ini_get('eaccelerator.enable'));
  }

  /**
   * check if we have ionCube Loader
   *
   * @link http://www.php-accelerator.co.uk
   * @return bool
   */
  public static function hasIoncube()
  {
    return (bool)strlen(ini_get('phpa'));
  }

  /**
   * check if we have Zend Optimizer+
   *
   * @link http://www.zend.com/products/server
   * @return bool
   */
  public static function hasZend()
  {
    return (bool)strlen(ini_get('zend_optimizer.enable_loader'));
  }

  /**
   * check if we have nuSphere phpExpress
   *
   * @link http://www.nusphere.com/products/phpexpress.htm
   * @return bool
   */
  public static function hasNusphere()
  {
    return function_exists('phpexpress');
  }

  /**
   * check if we have php 5.5.5+ opcode cache
   *
   * @link http://php.net/manual/de/book.opcache.php
   * @return bool
   */
  public static function hasOpCode()
  {
    return (bool)strlen(ini_get('opcache.enable'));
  }
}
