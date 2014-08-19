<?php
/**
 * PHP Opcode-Cache detection
 *
 * @author Alexander Over <phpclasses@quadrat4.de>
 * @example DetectOpCodeCache::checkAll();
 * @example DetectOpCodeCache::hasApc();
 */
final class DetectOpCodeCache {
  
  final public static function checkAll()  {

      switch(true) {

        case (self::hasXcache()) : return 'Xcache';
        break;

        case (self::hasEaccelerator()) : return 'Eaccelerator';
        break;

        case (self::hasApc()) : return 'Apc';
        break;

        case (self::hasZend()) : return 'Zend';
        break;
        
        case (self::hasIoncube()) : return 'Ioncube';
        break;

        case (self::hasNusphere()) : return 'Nusphere';
        break;

        case (self::hasWincache()) : return 'hasWincache';
        break;
      }

      return 'none';
  }

  /**
   * check if we have Xcache
   *
   * @link http://xcache.lighttpd.net
   * @return bool
   */
  public static function hasXcache()
  {
    return function_exists( 'xcache_isset' );
  }

  /**
   * check if we have Wincache
   *
   * @link http://www.iis.net/expand/WinCacheForPHP
   * @return bool
   */
  public static function hasWincache()
  {
    return function_exists( 'wincache_fcache_fileinfo' );
  }

  /**
   * check if we have Alternative PHP Cache
   *
   * @link http://pecl.php.net/package/apc
   * @return bool
   */
  public static function hasApc()
  {
    return function_exists( 'apc_add' );
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
    return (bool)strlen( ini_get( 'eaccelerator.enable' ) );
  }

  /**
   * check if we have ionCube Loader
   *
   * @link http://www.php-accelerator.co.uk
   * @return bool
   */
  public static function hasIoncube()
  {
    return (bool)strlen( ini_get( 'phpa' ) );
  }

  /**
   * check if we have Zend Optimizer+
   *
   * @link http://www.zend.com/products/server
   * @return bool
   */
  public static function hasZend()
  {
    return (bool)strlen( ini_get( 'zend_optimizer.enable_loader' ) );
  }

  /**
   * check if we have nuSphere phpExpress
   *
   * @link http://www.nusphere.com/products/phpexpress.htm
   * @return bool
   */
  public static function hasNusphere()
  {
    return function_exists( 'phpexpress' );
  }
}
