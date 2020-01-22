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
 * @version    $Id: DateFrame.php 177 2010-03-09 13:13:34Z svollbehr $
 */

/**#@+ @ignore */
require_once DEDALO_ROOT . '/lib/Zend/Media/Id3/TextFrame.php';
/**#@-*/

/**
 * A base class for all the text frames representing a date or parts of it.
 *
 * @category   Zend
 * @package    Zend_Media
 * @subpackage ID3
 * @author     Sven Vollbehr <sven@vollbehr.eu>
 * @copyright  Copyright (c) 2005-2009 Zend Technologies USA Inc. (http://www.zend.com) 
 * @license    http://framework.zend.com/license/new-bsd     New BSD License
 * @version    $Id: DateFrame.php 177 2010-03-09 13:13:34Z svollbehr $
 */
abstract class Zend_Media_Id3_DateFrame
    extends Zend_Media_Id3_TextFrame
{
    private $_format;

    /**
     * Constructs the class with given parameters and parses object related
     * data.
     *
     * @param Zend_Io_Reader $reader The reader object.
     * @param Array $options The options array.
     * @param string $format Rule for formatting output. If null the default
     *  ISO 8601 date format is used.
     */
    public function __construct
        ($reader = null, &$options = array(), $format = null)
    {
        Zend_Media_Id3_Frame::__construct($reader, $options);

        $this->setEncoding(Zend_Media_Id3_Encoding::ISO88591);

        $this->_format = $format;

        if ($this->_reader === null) {
            return;
        }

        $this->_reader->skip(1);
        $this->setText($this->_reader->readString8($this->_reader->getSize()));
    }

    /**
     * Returns the date.
     *
     * @return Zend_Date
     */
    public function getDate()
    {
        require_once DEDALO_ROOT . '/lib/Zend/Date.php';
        $date = new Zend_Date(0);
        $date->setTimezone('UTC');
        $date->set
            ($this->getText(),
             $this->_format ? $this->_format : Zend_Date::ISO_8601);
        return $date;
    }

    /**
     * Sets the date. If called with null value the current time is entered.
     *
     * @param Zend_Date $date The date.
     */
    public function setDate($date = null)
    {
        require_once DEDALO_ROOT . '/lib/Zend/Date.php';
        if ($date === null) {
            $date = Zend_Date::now();
        }
        $date->setTimezone('UTC');
        $this->setText($date->toString(Zend_Date::ISO_8601));
    }

    /**
     * Writes the frame raw data without the header.
     *
     * @param Zend_Io_Writer $writer The writer object.
     * @return void
     */
    protected function _writeData($writer)
    {
        $this->setEncoding(Zend_Media_Id3_Encoding::ISO88591);
        parent::_writeData($writer);
    }
}
