<?php

namespace Tests\EasyRdf;

use EasyRdf\Literal;
use EasyRdf\ParsedUri;
use EasyRdf\RdfNamespace;
use Test\TestCase;

/**
 * EasyRdf
 *
 * LICENSE
 *
 * Copyright (c) 2009-2014 Nicholas J Humfrey.  All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 * 1. Redistributions of source code must retain the above copyright
 *    notice, this list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright notice,
 *    this list of conditions and the following disclaimer in the documentation
 *    and/or other materials provided with the distribution.
 * 3. The name of the author 'Nicholas J Humfrey" may be used to endorse or
 *    promote products derived from this software without specific prior
 *    written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
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
 * @copyright  Copyright (c) 2009-2014 Nicholas J Humfrey
 * @license    https://www.opensource.org/licenses/bsd-license.php
 */
class LiteralTest extends TestCase
{
    protected function setUp(): void
    {
        RdfNamespace::set('ex', 'http://www.example.com/');
    }

    protected function tearDown(): void
    {
        Literal::deleteDatatypeMapping('ex:mytype');
        RdfNamespace::delete('ex');
    }

    public function testCreate()
    {
        $literal = Literal::create('Rat');
        $this->assertClass('EasyRdf\Literal', $literal);
        $this->assertSame('Rat', $literal->getValue());
        $this->assertStringEquals('', $literal->getLang());
        $this->assertStringEquals('', $literal->getDatatype());
    }

    public function testCreateWithLanguage()
    {
        $literal = Literal::create('Rat', 'en');
        $this->assertClass('EasyRdf\Literal', $literal);
        $this->assertSame('Rat', $literal->getValue());
        $this->assertSame('en', $literal->getLang());
        $this->assertStringEquals('', $literal->getDatatype());
    }

    public function testCreateWithDatatype()
    {
        $literal = Literal::create(1, null, 'xsd:integer');
        $this->assertClass('EasyRdf\Literal\Integer', $literal);
        $this->assertEquals(1, $literal->getValue());
        $this->assertStringEquals('', $literal->getLang());
        $this->assertSame('xsd:integer', $literal->getDatatype());
    }

    public function testCreateWithLanguageAndDatatype()
    {
        $literal = Literal::create('Rat', 'en', 'http://www.w3.org/2001/XMLSchema#string');
        $this->assertClass('EasyRdf\Literal', $literal);
        $this->assertSame('Rat', $literal->getValue());
        $this->assertStringEquals('', $literal->getLang());
        $this->assertSame('xsd:string', $literal->getDatatype());
    }

    public function testCreateIntegerLiteralWithLanguage()
    {
        $literal = Literal::create(10, 'en');
        $this->assertClass('EasyRdf\Literal', $literal);
        $this->assertSame('10', $literal->getValue());
        $this->assertSame('en', $literal->getLang());
        $this->assertStringEquals('', $literal->getDatatype());
    }

    public function testCreateWithObjectDatatype()
    {
        $datatype = new ParsedUri('http://www.w3.org/2001/XMLSchema#integer');
        $literal = Literal::create(1, null, $datatype);
        $this->assertClass('EasyRdf\Literal\Integer', $literal);
        $this->assertEquals(1, $literal->getValue());
        $this->assertStringEquals('', $literal->getLang());
        $this->assertSame('xsd:integer', $literal->getDatatype());
    }

    public function testCreateWithUriDatatype()
    {
        $literal = Literal::create(
            1,
            null,
            'http://www.w3.org/2001/XMLSchema#integer'
        );
        $this->assertClass('EasyRdf\Literal\Integer', $literal);
        $this->assertEquals(1, $literal->getValue());
        $this->assertStringEquals('', $literal->getLang());
        $this->assertSame('xsd:integer', $literal->getDatatype());
    }

    public function testCreateWithUnshortenableUriDatatype()
    {
        $literal = Literal::create(
            1,
            null,
            'http://example.com/integer'
        );
        $this->assertClass('EasyRdf\Literal', $literal);
        $this->assertSame('1', $literal->getValue());
        $this->assertStringEquals('', $literal->getLang());
        $this->assertStringEquals('', $literal->getDatatype());
    }

    public function testCreateWithAssociativeArray()
    {
        $literal = Literal::create(['value' => 'Rat']);
        $this->assertClass('EasyRdf\Literal', $literal);
        $this->assertSame('Rat', $literal->getValue());
        $this->assertStringEquals('', $literal->getLang());
        $this->assertStringEquals('', $literal->getDatatype());
    }

    public function testCreateWithAssociativeArrayWithLang()
    {
        $literal = Literal::create(['value' => 'Rat', 'lang' => 'en']);
        $this->assertClass('EasyRdf\Literal', $literal);
        $this->assertSame('Rat', $literal->getValue());
        $this->assertStringEquals('', $literal->getDatatype());
        $this->assertSame('en', $literal->getLang());
    }

    public function testCreateWithAssociativeArrayWithXmlLang()
    {
        $literal = Literal::create(['value' => 'Rattus', 'xml:lang' => 'fr']);
        $this->assertClass('EasyRdf\Literal', $literal);
        $this->assertSame('Rattus', $literal->getValue());
        $this->assertStringEquals('', $literal->getDatatype());
        $this->assertSame('fr', $literal->getLang());
    }

    public function testCreateWithAssociativeArrayWithDatatype()
    {
        $literal = Literal::create(['value' => 'Rat', 'datatype' => 'xsd:string']);
        $this->assertClass('EasyRdf\Literal', $literal);
        $this->assertSame('Rat', $literal->getValue());
        $this->assertSame('xsd:string', $literal->getDatatype());
        $this->assertStringEquals('', $literal->getLang());
    }

    public function testCreateWithInteger()
    {
        $literal = Literal::create(10);
        $this->assertClass('EasyRdf\Literal\Integer', $literal);
        $this->assertEquals(10, $literal->getValue());
        $this->assertSame('xsd:integer', $literal->getDatatype());
        $this->assertStringEquals('', $literal->getLang());
    }

    public function testCreateWithFloat()
    {
        $literal = Literal::create(1.5);
        $this->assertClass('EasyRdf\Literal', $literal);
        $this->assertSame('1.5', $literal->getValue());
        $this->assertSame('xsd:double', $literal->getDatatype());
        $this->assertStringEquals('', $literal->getLang());
    }

    public function testCreateWithFloatInBadLocale()
    {
        $current_locale = setlocale(\LC_NUMERIC, 0);
        setlocale(\LC_NUMERIC, 'ru_RU');

        try {
            $literal = Literal::create(1.5);
            $this->assertSame('1.5', $literal->getValue());

            setlocale(\LC_NUMERIC, $current_locale);
        } catch (\Exception $e) {
            setlocale(\LC_NUMERIC, $current_locale);
            throw $e;
        }
    }

    public function testCreateWithBooleanTrue()
    {
        $literal = Literal::create(true);
        $this->assertClass('EasyRdf\Literal\Boolean', $literal);
        $this->assertTrue($literal->getValue());
        $this->assertSame('xsd:boolean', $literal->getDatatype());
        $this->assertStringEquals('', $literal->getLang());
    }

    public function testCreateWithBooleanFalse()
    {
        $literal = Literal::create(false);
        $this->assertClass('EasyRdf\Literal\Boolean', $literal);
        $this->assertFalse($literal->getValue());
        $this->assertSame('xsd:boolean', $literal->getDatatype());
        $this->assertStringEquals('', $literal->getLang());
    }

    public function testCreateWithDateTime()
    {
        $dt = new \DateTime('2010-09-08T07:06:05Z');
        $literal = Literal::create($dt);
        $this->assertStringEquals('2010-09-08T07:06:05Z', $literal);
        $this->assertEquals($dt, $literal->getValue());
        $this->assertStringEquals('', $literal->getLang());
        $this->assertSame('xsd:dateTime', $literal->getDatatype());
    }

    public function testCreateConvertToBooleanTrue()
    {
        $literal = Literal::create(1, null, 'xsd:boolean');
        $this->assertClass('EasyRdf\Literal\Boolean', $literal);
        $this->assertEquals('boolean', \gettype($literal->getValue()));
        $this->assertTrue($literal->getValue());
        $this->assertSame('xsd:boolean', $literal->getDatatype());
        $this->assertStringEquals('', $literal->getLang());
    }

    public function testCreateConvertToBooleanFalse()
    {
        $literal = Literal::create(0, null, 'xsd:boolean');
        $this->assertClass('EasyRdf\Literal\Boolean', $literal);
        $this->assertEquals('boolean', \gettype($literal->getValue()));
        $this->assertFalse($literal->getValue());
        $this->assertSame('xsd:boolean', $literal->getDatatype());
        $this->assertStringEquals('', $literal->getLang());
    }

    public function testCreateConvertToInteger()
    {
        $literal = Literal::create('100.00', null, 'xsd:integer');
        $this->assertClass('EasyRdf\Literal\Integer', $literal);
        $this->assertEquals('integer', \gettype($literal->getValue()));
        $this->assertEquals(100, $literal->getValue());
        $this->assertSame('xsd:integer', $literal->getDatatype());
        $this->assertStringEquals('', $literal->getLang());
    }

    public function testCreateConvertToDecimal()
    {
        $literal = Literal::create('1', null, 'xsd:decimal');
        $this->assertClass('EasyRdf\Literal\Decimal', $literal);
        $this->assertEquals('string', \gettype($literal->getValue()));
        $this->assertSame('1.0', $literal->getValue());
        $this->assertSame('xsd:decimal', $literal->getDatatype());
        $this->assertStringEquals('', $literal->getLang());
    }

    public function testCreateConvertToString()
    {
        $literal = Literal::create(true, null, 'xsd:string');
        $this->assertClass('EasyRdf\Literal', $literal);
        $this->assertEquals('string', \gettype($literal->getValue()));
        // Hmm, not sure about this, but PHP does the conversion not me:
        $this->assertSame('1', $literal->getValue());
        $this->assertSame('xsd:string', $literal->getDatatype());
        $this->assertStringEquals('', $literal->getLang());
    }

    public function testConstruct()
    {
        $literal = new Literal('Rat');
        $this->assertSame('Rat', $literal->getValue());
        $this->assertStringEquals('', $literal->getLang());
        $this->assertStringEquals('', $literal->getDatatype());
    }

    public function testConstructWithLanguage()
    {
        $literal = new Literal('Rat', 'en');
        $this->assertSame('Rat', $literal->getValue());
        $this->assertSame('en', $literal->getLang());
        $this->assertStringEquals('', $literal->getDatatype());
    }

    public function testConstructWithDatatype()
    {
        $literal = new Literal(1, null, 'xsd:integer');
        $this->assertSame('1', $literal->getValue());
        $this->assertStringEquals('', $literal->getLang());
        $this->assertSame('xsd:integer', $literal->getDatatype());
    }

    public function testConstructWithObjectDatatype()
    {
        $datatype = new ParsedUri('http://www.w3.org/2001/XMLSchema#integer');
        $literal = new Literal(1, null, $datatype);
        $this->assertSame('1', $literal->getValue());
        $this->assertStringEquals('', $literal->getLang());
        $this->assertSame('xsd:integer', $literal->getDatatype());
    }

    public function testGetDatatypeUri()
    {
        $literal = Literal::create(1);
        $this->assertSame(
            'http://www.w3.org/2001/XMLSchema#integer',
            $literal->getDatatypeUri()
        );
    }

    public function testToString()
    {
        $literal = Literal::create('Rat');
        $this->assertSame('Rat', (string) $literal);
    }

    public function testToRdfPhp()
    {
        $literal = Literal::create('Rat');
        $this->assertSame(
            [
               'type' => 'literal',
               'value' => 'Rat',
            ],
            $literal->toRdfPhp()
        );
    }

    public function testToRdfPhpWithLang()
    {
        $literal = new Literal('Chat', 'fr');
        $this->assertSame(
            [
               'type' => 'literal',
               'value' => 'Chat',
               'lang' => 'fr',
            ],
            $literal->toRdfPhp()
        );
    }

    public function testToRdfPhpWithDatatype()
    {
        $literal = Literal::create(44);
        $this->assertSame(
            [
               'type' => 'literal',
               'value' => '44',
               'datatype' => 'http://www.w3.org/2001/XMLSchema#integer',
            ],
            $literal->toRdfPhp()
        );
    }

    public function testDumpValue()
    {
        $literal = Literal::create('hello & world');
        $this->assertSame(
            '"hello & world"',
            $literal->dumpValue('text')
        );
        $this->assertSame(
            "<span style='color:black'>&quot;hello &amp; world&quot;</span>",
            $literal->dumpValue('html')
        );
    }

    public function testDumpValueWithLanguage()
    {
        $literal = new Literal('Nick', 'en');
        $this->assertSame(
            '"Nick"@en',
            $literal->dumpValue('text')
        );
        $this->assertSame(
            "<span style='color:black'>&quot;Nick&quot;@en</span>",
            $literal->dumpValue('html')
        );
    }

    public function testDumpValueWithDatatype()
    {
        $literal = Literal::create(1, null, 'xsd:integer');
        $this->assertSame(
            '"1"^^xsd:integer',
            $literal->dumpValue('text')
        );
        $this->assertSame(
            "<span style='color:black'>&quot;1&quot;^^xsd:integer</span>",
            $literal->dumpValue('html')
        );
    }

    public function testConstructCustomClass()
    {
        Literal::setDatatypeMapping('ex:mytype', MyDatatypeClass::class);
        $literal = new MyDatatypeClass('foobar');
        $this->assertClass(MyDatatypeClass::class, $literal);
        $this->assertStringEquals('!foobar!', $literal);
        $this->assertSame('foobar', $literal->getValue());
        $this->assertSame('ex:mytype', $literal->getDatatype());
        $this->assertStringEquals('', $literal->getLang());
    }

    public function testCreateCustomClass()
    {
        Literal::setDatatypeMapping('ex:mytype', MyDatatypeClass::class);
        $literal = Literal::create('foobar', null, 'ex:mytype');
        $this->assertClass(MyDatatypeClass::class, $literal);
        $this->assertStringEquals('!foobar!', $literal);
        $this->assertSame('foobar', $literal->getValue());
        $this->assertSame('ex:mytype', $literal->getDatatype());
        $this->assertStringEquals('', $literal->getLang());
    }

    public function testSetDatatypeMappingNull()
    {
        $this->expectException('InvalidArgumentException');
        $this->expectExceptionMessage(
            '$datatype should be a string and cannot be null or empty'
        );
        Literal::setDatatypeMapping(null, MyDatatypeClass::class);
    }

    public function testSetDatatypeMappingEmpty()
    {
        $this->expectException('InvalidArgumentException');
        $this->expectExceptionMessage(
            '$datatype should be a string and cannot be null or empty'
        );
        Literal::setDatatypeMapping('', MyDatatypeClass::class);
    }

    public function testSetDatatypeMappingNonString()
    {
        $this->expectException('InvalidArgumentException');
        $this->expectExceptionMessage(
            '$datatype should be a string and cannot be null or empty'
        );
        Literal::setDatatypeMapping([], MyDatatypeClass::class);
    }

    public function testSetDatatypeMappingClassNull()
    {
        $this->expectException('InvalidArgumentException');
        $this->expectExceptionMessage(
            '$class should be a string and cannot be null or empty'
        );
        Literal::setDatatypeMapping('ex:mytype', null);
    }

    public function testSetDatatypeMappingClassEmpty()
    {
        $this->expectException('InvalidArgumentException');
        $this->expectExceptionMessage(
            '$class should be a string and cannot be null or empty'
        );
        Literal::setDatatypeMapping('ex:mytype', '');
    }

    public function testSetDatatypeMappingClassNonString()
    {
        $this->expectException('InvalidArgumentException');
        $this->expectExceptionMessage(
            '$class should be a string and cannot be null or empty'
        );
        Literal::setDatatypeMapping('ex:mytype', []);
    }

    public function testDeleteDatatypeMappingNull()
    {
        $this->expectException('InvalidArgumentException');
        $this->expectExceptionMessage(
            '$datatype should be a string and cannot be null or empty'
        );
        Literal::deleteDatatypeMapping(null);
    }

    public function testDeleteDatatypeMappingEmpty()
    {
        $this->expectException('InvalidArgumentException');
        $this->expectExceptionMessage(
            '$datatype should be a string and cannot be null or empty'
        );
        Literal::deleteDatatypeMapping('');
    }

    public function testDeleteDatatypeMappingNonString()
    {
        $this->expectException('InvalidArgumentException');
        $this->expectExceptionMessage(
            '$datatype should be a string and cannot be null or empty'
        );
        Literal::deleteDatatypeMapping([]);
    }
}
