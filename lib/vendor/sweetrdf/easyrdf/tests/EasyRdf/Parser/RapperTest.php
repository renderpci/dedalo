<?php

namespace Tests\EasyRdf\Parser;

/*
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
 * @copyright  Copyright (c) 2021 Konrad Abicht <hi@inspirito.de>
 * @copyright  Copyright (c) 2009-2014 Nicholas J Humfrey
 * @license    https://www.opensource.org/licenses/bsd-license.php
 */

use EasyRdf\Graph;
use EasyRdf\Parser\Rapper;
use Test\TestCase;

class RapperTest extends TestCase
{
    /** @var Rapper */
    protected $parser;
    /** @var Graph */
    protected $graph;
    protected $rdf_data;

    protected function setUp(): void
    {
        exec('rapper --version 2>/dev/null', $output, $retval);
        if (0 == $retval) {
            $this->parser = new Rapper();
            $this->graph = new Graph();
            $this->rdf_data = readFixture('foaf.rdf');
        } else {
            $this->markTestSkipped(
                'The rapper command is not available on this system.'
            );
        }
    }

    public function testRapperNotFound()
    {
        $this->expectException('EasyRdf\Exception');
        $this->expectExceptionMessage(
            "Failed to execute the command 'random_command_that_doesnt_exist'"
        );
        new Rapper('random_command_that_doesnt_exist');
    }

    public function testRapperTooOld()
    {
        $this->expectException('EasyRdf\Exception');
        $this->expectExceptionMessage(
            'Version 1.4.17 or higher of rapper is required.'
        );
        new Rapper('echo 1.0.0');
    }

    public function testParseRdfXml()
    {
        $count = $this->parser->parse(
            $this->graph,
            $this->rdf_data,
            'rdfxml',
            'http://www.example.com/joe/foaf.rdf'
        );
        $this->assertSame(14, $count);

        $joe = $this->graph->resource('http://www.example.com/joe#me');
        $this->assertNotNull($joe);
        $this->assertClass('EasyRdf\Resource', $joe);
        $this->assertSame('http://www.example.com/joe#me', $joe->getUri());

        $name = $joe->get('foaf:name');
        $this->assertNotNull($name);
        $this->assertClass('EasyRdf\Literal', $name);
        $this->assertStringEquals('Joe Bloggs', $name);
        $this->assertSame('en', $name->getLang());
        $this->assertNull($name->getDatatype());

        $foaf = $this->graph->resource('http://www.example.com/joe/foaf.rdf');
        $this->assertNotNull($foaf);
        $this->assertStringEquals("Joe Bloggs' FOAF File", $foaf->label());
    }

    public function testParseEmpty()
    {
        $count = $this->parser->parse(
            $this->graph,
            readFixture('empty.rdf'),
            'rdfxml',
            'http://www.example.com/empty.rdf'
        );

        // Should be empty but no exception thrown
        $this->assertSame(0, $count);
        $this->assertSame(0, $this->graph->countTriples());
    }

    public function testParseXMLLiteral()
    {
        $count = $this->parser->parse(
            $this->graph,
            readFixture('xml_literal.rdf'),
            'rdfxml',
            'http://www.example.com/'
        );
        $this->assertSame(2, $count);

        $doc = $this->graph->resource('http://www.example.com/');
        $this->assertSame('foaf:Document', $doc->type());
        $description = $doc->get('dc:description');
        $this->assertSame('rdf:XMLLiteral', $description->getDataType());
        $this->assertSame(
            "\n      <p>Here is a block of <em>HTML text</em></p>\n    ",
            $description->getValue()
        );
    }

    public function testParseUnsupportedFormat()
    {
        $this->expectException('EasyRdf\Exception');
        $this->expectExceptionMessage(
            'Error while executing command rapper'
        );

        $this->parser->parse(
            $this->graph,
            $this->rdf_data,
            'unsupportedformat',
            null
        );
    }
}
