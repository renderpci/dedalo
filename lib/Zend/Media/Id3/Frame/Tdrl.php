<?php
/**
 * Zend Framework
 *
 * LICENSE
 *
 * This source file is subject to the new BSD license that is bundled
 * with this package in the file LICENSE.txt.
 * It is also available through the world-wide-web at this URL:
 * http://framework.zend.com/license/new-bsd
 * If you did not receive a copy of the license and are unable to
 * obtain it through the world-wide-web, please send an email
 * to license@zend.com so we can send you a copy immediately.
 *
 * @category   Zend
 * @package    Zend_Media
 * @subpackage ID3
 * @copyright  Copyright (c) 2005-2009 Zend Technologies USA Inc. (http://www.zend.com) 
 * @license    http://framework.zend.com/license/new-bsd     New BSD License
 * @version    $Id: Tdrl.php 177 2010-03-09 13:13:34Z svollbehr $
 * @since      ID3v2.4.0
 */

/**#@+ @ignore */
require_once DEDALO_ROOT . '/lib/Zend/Media/Id3/DateFrame.php';
/**#@-*/

/**
 * The <i>Release time</i> frame contains a timestamp describing when the audio
 * was first released.
 *
 * @category   Zend
 * @package    Zend_Media
 * @subpackage ID3
 * @author     Sven Vollbehr <sven@vollbehr.eu>
 * @copyright  Copyright (c) 2005-2009 Zend Technologies USA Inc. (http://www.zend.com) 
 * @license    http://framework.zend.com/license/new-bsd     New BSD License
 * @version    $Id: Tdrl.php 177 2010-03-09 13:13:34Z svollbehr $
 * @since      ID3v2.4.0
 */
final class Zend_Media_Id3_Frame_Tdrl extends Zend_Media_Id3_DateFrame
{}
