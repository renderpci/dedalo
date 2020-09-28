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
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS 'AS IS'
 * AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
 * ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE
 * LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
 * CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
 * SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
 * INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
 * CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
 * ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
 * POSSIBILITY OF SUCH DAMAGE.
 *
 * @category   Zend
 * @package    Zend_Media
 * @subpackage ISO14496
 * @copyright  Copyright (c) 2005-2009 Zend Technologies USA Inc. (http://www.zend.com) 
 * @license    http://framework.zend.com/license/new-bsd     New BSD License
 * @version    $Id: Stsd.php 177 2010-03-09 13:13:34Z svollbehr $
 */

/**#@+ @ignore */
require_once DEDALO_ROOT . '/lib/Zend/Media/Iso14496/FullBox.php';
/**#@-*/

/**
 * The <i>Sample Description Box</i> table gives detailed information about the
 * coding type used, and any initialization information needed for that coding.
 *
 * @category   Zend
 * @package    Zend_Media
 * @subpackage ISO14496
 * @author     Sven Vollbehr <sven@vollbehr.eu>
 * @copyright  Copyright (c) 2005-2009 Zend Technologies USA Inc. (http://www.zend.com) 
 * @license    http://framework.zend.com/license/new-bsd     New BSD License
 * @version    $Id: Stsd.php 177 2010-03-09 13:13:34Z svollbehr $
 * @todo       Implementation
 */
final class Zend_Media_Iso14496_Box_Stsd extends Zend_Media_Iso14496_FullBox
{
     private $_SampleDescriptionTable = array();

    /**
     * Constructs the class with given parameters and reads box related data
     * from the ISO Base Media file.
     *
     * @param Zend_Io_Reader $reader  The reader object.
     * @param Array          $options The options array.
     */
    public function __construct($reader, &$options = array())
    {
        parent::__construct($reader, $options);

           $entryCount = $this->_reader->readUInt32BE();
        for ($i = 1; $i <= $entryCount; $i++) {
           $this->_SampleDescriptionTable[$i]= $this->_reader->readUInt32BE();
			$this->_SampleDescriptionTable[$i+1] = $this->_reader->read(4);
			$this->_SampleDescriptionTable[$i+2] = $this->_reader->readUInt32BE();
			$this->_SampleDescriptionTable[$i+3] = $this->_reader->readUInt32BE();
			$this->_SampleDescriptionTable[$i+4] = $this->_reader->readUInt16BE();
			$this->_SampleDescriptionTable[$i+5] = $this->_reader->readUInt16BE();
			$this->_SampleDescriptionTable[$i+6] = $this->_reader->readUInt32BE();
			$this->_SampleDescriptionTable[$i+7] = $this->_reader->readUInt16BE();
			$this->_SampleDescriptionTable[$i+8] = $this->_reader->readUInt16BE();
			$this->_SampleDescriptionTable[$i+9] = $this->_reader->readUInt16BE();
			$this->_SampleDescriptionTable[$i+10] = $this->_reader->readUInt16BE();
			$this->_SampleDescriptionTable[$i+11] = $this->_reader->readUInt16BE();
        }
    }
	
    /**
     * Returns an array of values. Each entry has the entry number as its index
     * and an integer that gives the numbers of the samples that are random
     * access points in the stream as its value.
     *
     * @return Array
     */

	  public function getSampleDescriptionTable()
    {
        return $this->_SampleDescriptionTable;
    }
	    /**
     * Sets an array of values. Each entry has the entry number as its index
     * and an integer that gives the numbers of the samples that are random
     * access points in the stream as its value.
     *
     * @param Array $syncSampleTable The array of values.
     */
	
	    public function setSampleDescriptionTable($SampleDescriptionTable)
    {
        $this->_SampleDescriptionTable = $SampleDescriptionTable;
    }
    /**
     * Returns the box heap size in bytes.
     *
     * @return integer
     */
    public function getHeapSize()
    {
        return parent::getHeapSize() + 4 + count($this->_SampleDescriptionTable) * 4;
    }

    /**
     * Writes the box data.
     *
     * @param Zend_Io_Writer $writer The writer object.
     * @return void
     */
    protected function _writeData($writer)
    {
        parent::_writeData($writer);
        $writer->write($this->_data);
    }
}
