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
 * @version    $Id: Stts.php 177 2010-03-09 13:13:34Z svollbehr $
 */

/**#@+ @ignore */
require_once DEDALO_ROOT . '/lib/Zend/Media/Iso14496/FullBox.php';
/**#@-*/

/**
 * The <i>Decoding Time to Sample Box</i> contains a compact version of a table
 * that allows indexing from decoding time to sample number. Other tables give
 * sample sizes and pointers, from the sample number. Each entry in the table
 * gives the number of consecutive samples with the same time delta, and the
 * delta of those samples. By adding the deltas a complete time-to-sample map
 * may be built.
 *
 * The Decoding Time to Sample Box contains decode time delta's: DT(n+1) = DT(n)
 * + STTS(n) where STTS(n) is the (uncompressed) table entry for sample n.
 *
 * The sample entries are ordered by decoding time stamps; therefore the deltas
 * are all non-negative.
 *
 * The DT axis has a zero origin; DT(i) = SUM(for j=0 to i-1 of delta(j)), and
 * the sum of all deltas gives the length of the media in the track (not mapped
 * to the overall timescale, and not considering any edit list).
 *
 * The {@link Zend_Media_Iso14496_Box_Elst Edit List Box} provides the initial
 * CT value if it is non-empty (non-zero).
 *
 * @category   Zend
 * @package    Zend_Media
 * @subpackage ISO14496
 * @author     Sven Vollbehr <sven@vollbehr.eu>
 * @copyright  Copyright (c) 2005-2009 Zend Technologies USA Inc. (http://www.zend.com) 
 * @license    http://framework.zend.com/license/new-bsd     New BSD License
 * @version    $Id: Stts.php 177 2010-03-09 13:13:34Z svollbehr $
 */
final class Zend_Media_Iso14496_Box_Load extends Zend_Media_Iso14496_FullBox
{
	private $_startTime;
    private $_duration;
 	private $_falgs;
  	private $_huints;
	
  
   public function __construct($reader = null, &$options = array())
    {
        parent::__construct($reader, $options);
       // $this->setContainer(true);
	  

       if ($reader === null) {
            return;
        }
		//$this->_reader->skip(4);
		$this->_startTime   = $this->_version;
        $this->_duration	= $this->_reader->readUInt32BE();
		$this->_falgs   	= $this->_reader->readUInt32BE();
        $this->_huints		= $this->_reader->readUInt32BE();
		
	 /*
			print_r($this->_startTime);
		echo"<br>";
			print_r($this->_duration);
		echo"<br>";
			print_r($this->_falgs);
		echo"<br>";
			print_r($this->_huints);
		echo"<br>";
       
		while ($this->_reader->getOffset() < $this->getSize()) {
            if (($brand = $this->_reader->readString8(4)) != '') {
                $this->_compatibleBrands[] = $brand;
            }
			
		}*/
	}

    /**
     * Returns the box heap size in bytes.
     *
     * @return integer	 
     */
	 
	     public function getStartTime()
    {
        return $this->_startTime;
    }

    /**
     * Sets the start Time.
     *
     * @param string $startTime The major version brand.
     */
    public function setStartTime($startTime)
    {
        $this->_startTime = $startTime;
    }
	/**
     * Sets the start Time.
     *
     * @param string $startTime The major version brand.
     */	
	 public function getDuration()
    {
        return $this->_duration;
    }

    /**
     * Sets the start Time.
     *
     * @param string $startTime The major version brand.
     */
    public function setDuration($duration)
    {
        $this->_duration = $duration;
    }
	 /**
     * Sets the start Time.
     *
     * @param string $startTime The major version brand.
     */

     public function getFlags()
    {
        return $this->_flags;
    }


    public function setFlags($flags)
    {
        $this->_flags = $flags;
    }

	/**
     * Sets the start Time.
     *
     * @param string $startTime The major version brand.
     */	
	  public function getHuints()
    {
        return $this->_huints;
    }

    /**
     * Sets the major version brand.
     *
     * @param string $majorBrand The major version brand.
     */
    public function setHuints($huints)
    {
        $this->_huints = $huints;
    }
	
	

	 
	 
    public function getHeapSize()
    {
        return parent::getHeapSize()+4+4+4;
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
		$this->setVersion($this->_startTime);
        $writer	
		->writeUInt32BE($this->_duration)	
		->writeUInt32BE($this->_flags)
		->writeUInt32BE($this->_huints);
		
    }
}
