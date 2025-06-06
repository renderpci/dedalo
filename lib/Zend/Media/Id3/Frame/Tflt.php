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
 * @version    $Id: Tflt.php 177 2010-03-09 13:13:34Z svollbehr $
 */

/**#@+ @ignore */
require_once DEDALO_ROOT . '/lib/Zend/Media/Id3/TextFrame.php';
/**#@-*/

/**
 * The <i>File type</i> frame indicates which type of audio this tag defines.
 * The following types and refinements are defined:
 *
 * <pre>
 * MIME   MIME type follows
 *  MPG    MPEG Audio
 *    /1     MPEG 1/2 layer I
 *    /2     MPEG 1/2 layer II
 *    /3     MPEG 1/2 layer III
 *    /2.5   MPEG 2.5
 *    /AAC   Advanced audio compression
 *  VQF    Transform-domain Weighted Interleave Vector Quantisation
 *  PCM    Pulse Code Modulated audio
 * </pre>
 *
 * but other types may be used, but not for these types though. This is used in
 * a similar way to the predefined types in the
 * {@link Zend_Media_Id3_Frame_Tmed TMED} frame. If this frame is not present
 * audio type is assumed to be MPG.
 *
 * @category   Zend
 * @package    Zend_Media
 * @subpackage ID3
 * @author     Sven Vollbehr <sven@vollbehr.eu>
 * @copyright  Copyright (c) 2005-2009 Zend Technologies USA Inc. (http://www.zend.com) 
 * @license    http://framework.zend.com/license/new-bsd     New BSD License
 * @version    $Id: Tflt.php 177 2010-03-09 13:13:34Z svollbehr $
 */
final class Zend_Media_Id3_Frame_Tflt extends Zend_Media_Id3_TextFrame
{}
