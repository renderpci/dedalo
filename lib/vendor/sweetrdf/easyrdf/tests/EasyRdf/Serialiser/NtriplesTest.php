<?php

namespace Tests\EasyRdf\Serialiser;

/*
 * EasyRdf
 *
 * LICENSE
 *
 * Copyright (c) 2021 Konrad Abicht <hi@inspirito.de>
 * Copyright (c) 2009-2020 Nicholas J Humfrey.  All rights reserved.
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
 * @package    EasyRdf
 * @copyright  Copyright (c) 2021 Konrad Abicht <hi@inspirito.de>
 * @copyright  Copyright (c) 2009-2020 Nicholas J Humfrey
 * @license    https://www.opensource.org/licenses/bsd-license.php
 */

use EasyRdf\Graph;
use EasyRdf\Literal;
use EasyRdf\RdfNamespace;
use EasyRdf\Resource;
use EasyRdf\Serialiser\Ntriples;
use Test\TestCase;

class NtriplesTest extends TestCase
{
    /** @var Ntriples */
    protected $serialiser;
    /** @var Graph */
    protected $graph;

    protected function setUp(): void
    {
        $this->graph = new Graph();
        $this->serialiser = new Ntriples();
    }

    protected function tearDown(): void
    {
        parent::tearDown();
        RdfNamespace::resetNamespaces();
        RdfNamespace::reset();
    }

    public function testSerialiseValueUriResource()
    {
        $this->assertSame(
            '<http://example.com/>',
            $this->serialiser->serialiseValue(
                new Resource('http://example.com/')
            )
        );
    }

    public function testSerialiseValueUriArray()
    {
        $this->assertSame(
            '<http://example.com/>',
            $this->serialiser->serialiseValue(
                ['type' => 'uri', 'value' => 'http://example.com/']
            )
        );
    }

    public function testSerialiseValueBnodeArray()
    {
        $this->assertSame(
            '_:one',
            $this->serialiser->serialiseValue(
                ['type' => 'bnode', 'value' => '_:one']
            )
        );
    }

    public function testSerialiseValueBnodeResource()
    {
        $this->assertSame(
            '_:two',
            $this->serialiser->serialiseValue(
                new Resource('_:two')
            )
        );
    }

    public function testSerialiseValueLiteralArray()
    {
        $this->assertSame(
            '"foo"',
            $this->serialiser->serialiseValue(
                ['type' => 'literal', 'value' => 'foo']
            )
        );
    }

    public function testSerialiseValueLiteralObject()
    {
        $this->assertSame(
            '"Hello"',
            $this->serialiser->serialiseValue(
                new Literal('Hello')
            )
        );
    }

    public function testSerialiseValueLiteralObjectWithDatatype()
    {
        $this->assertSame(
            '"10"^^<http://www.w3.org/2001/XMLSchema#integer>',
            $this->serialiser->serialiseValue(
                Literal::create(10)
            )
        );
    }

    public function testSerialiseValueLiteralObjectWithLang()
    {
        $this->assertSame(
            '"Hello World"@en',
            $this->serialiser->serialiseValue(
                new Literal('Hello World', 'en')
            )
        );
    }

    public function testSerialiseBadValue()
    {
        $this->expectException('EasyRdf\Exception');
        $this->expectExceptionMessage(
            "Unable to serialise object of type 'chipmonk' to ntriples"
        );
        $this->serialiser->serialiseValue(
            ['type' => 'chipmonk', 'value' => 'yes?']
        );
    }

    public function testSerialise()
    {
        $joe = $this->graph->resource(
            'http://www.example.com/joe#me',
            'foaf:Person'
        );
        $joe->set('foaf:name', 'Joe Bloggs');
        $joe->set(
            'foaf:homepage',
            $this->graph->resource('http://www.example.com/joe/')
        );
        $this->assertSame(
            '<http://www.example.com/joe#me> '.
            '<http://www.w3.org/1999/02/22-rdf-syntax-ns#type> '.
            "<http://xmlns.com/foaf/0.1/Person> .\n".
            '<http://www.example.com/joe#me> '.
            '<http://xmlns.com/foaf/0.1/name> '.
            "\"Joe Bloggs\" .\n".
            '<http://www.example.com/joe#me> '.
            '<http://xmlns.com/foaf/0.1/homepage> '.
            "<http://www.example.com/joe/> .\n",
            $this->serialiser->serialise($this->graph, 'ntriples')
        );
    }

    public function testSerialiseQuotes()
    {
        $joe = $this->graph->resource('http://www.example.com/joe#me');
        $joe->set('foaf:nick', '"Joey"');
        $this->assertSame(
            '<http://www.example.com/joe#me> '.
            '<http://xmlns.com/foaf/0.1/nick> '.
            '"\"Joey\"" .'."\n",
            $this->serialiser->serialise($this->graph, 'ntriples')
        );
    }

    public function testSerialiseBackslash()
    {
        $joe = $this->graph->resource('http://www.example.com/joe#me');
        $joe->set('foaf:nick', '\\backslash');
        $this->assertSame(
            '<http://www.example.com/joe#me> '.
            '<http://xmlns.com/foaf/0.1/nick> '.
            '"\\\\backslash" .'."\n",
            $this->serialiser->serialise($this->graph, 'ntriples')
        );
    }

    public function testSerialiseBNode()
    {
        $joe = $this->graph->resource('http://www.example.com/joe#me');
        $project = $this->graph->newBNode();
        $project->add('foaf:name', 'Project Name');
        $joe->add('foaf:project', $project);

        $this->assertSame(
            "_:genid1 <http://xmlns.com/foaf/0.1/name> \"Project Name\" .\n".
            '<http://www.example.com/joe#me> '.
            "<http://xmlns.com/foaf/0.1/project> _:genid1 .\n",
            $this->serialiser->serialise($this->graph, 'ntriples')
        );
    }

    public function testSerialiseLang()
    {
        $joe = $this->graph->resource('http://example.com/joe#me');
        $joe->set('foaf:name', new Literal('Joe', 'en'));

        $turtle = $this->serialiser->serialise($this->graph, 'ntriples');
        $this->assertStringEquals(
            '<http://example.com/joe#me> '.
            '<http://xmlns.com/foaf/0.1/name> '.
            "\"Joe\"@en .\n",
            $turtle
        );
    }

    public function testSerialiseDatatype()
    {
        $joe = $this->graph->resource('http://example.com/joe#me');
        $joe->set('foaf:foo', Literal::create(1, null, 'xsd:integer'));

        $ntriples = $this->serialiser->serialise($this->graph, 'ntriples');
        $this->assertStringEquals(
            '<http://example.com/joe#me> '.
            '<http://xmlns.com/foaf/0.1/foo> '.
            "\"1\"^^<http://www.w3.org/2001/XMLSchema#integer> .\n",
            $ntriples
        );
    }

    public function testSerialiseEmptyPrefix()
    {
        RdfNamespace::set('', 'http://foo/bar/');

        $joe = $this->graph->resource(
            'http://foo/bar/me'
        );

        $joe->set('foaf:name', 'Joe Bloggs');
        $joe->set(
            'foaf:homepage',
            $this->graph->resource('http://example.com/joe/')
        );

        $ntriples = $this->serialiser->serialise($this->graph, 'ntriples');

        $this->assertSame(
            "<http://foo/bar/me> <http://xmlns.com/foaf/0.1/name> \"Joe Bloggs\" .\n".
            "<http://foo/bar/me> <http://xmlns.com/foaf/0.1/homepage> <http://example.com/joe/> .\n",
            $ntriples
        );
    }

    public function testSerialiseUnsupportedFormat()
    {
        $this->expectException('EasyRdf\Exception');
        $this->expectExceptionMessage(
            'EasyRdf\Serialiser\Ntriples does not support: unsupportedformat'
        );
        $this->serialiser->serialise(
            $this->graph,
            'unsupportedformat'
        );
    }

    /**
     * @see https://github.com/easyrdf/easyrdf/issues/219
     * @see https://phabricator.wikimedia.org/T76854
     */
    public function testIssue219Unicode()
    {
        $pairs = [
            '位' => '"位"',
            'Дуглас Адамс' => '"Дуглас Адамс"',
        ];

        $serializer = new Ntriples();

        foreach ($pairs as $string => $expected) {
            $literal = new Literal($string);
            $actual = $serializer->serialiseValue($literal);

            $this->assertEquals($expected, $actual);
        }
    }

    /**
     * Tests combinations of control characters and multibyte characters.
     */
    public function testMixedWithControlCharacters()
    {
        $serializer = new Ntriples();
        // Include the NULL byte, a character, a control character,
        // a multibyte character, a character, and a character outside the BMP.
        $string = mb_convert_encoding(\chr(0).'a'.\chr(31), 'UTF-8', 'ISO-8859-1');
        $string .= '位'.mb_convert_encoding(\chr(127), 'UTF-8', 'ISO-8859-1').'𐀐';

        $literal = new Literal($string);
        $actual = $serializer->serialiseValue($literal);
        $this->assertEquals('"'.$string.'"', $actual);
    }

    /**
     * Tests that random sequences are not confused with multibyte characters.
     */
    public function testUnintendedMultibyteCharacter()
    {
        $serializer = new Ntriples();
        // Ensure that when the sequence from \xC1 to \xCF are interpreted as
        // separate characters and not confused with multibyte characters.
        $string = "\xC1\xC2\xC3\xC4\xC5\xC6\xC7\xC8\xC9\xCA\xCB\xCC\xCD\xCE\xCF";
        // Converts the string to 'ÁÂÃÄÅÆÇÈÉÊËÌÍÎÏ'.
        $string = mb_convert_encoding($string, 'UTF-8', 'ISO-8859-1');
        $literal = new Literal($string);
        $actual = $serializer->serialiseValue($literal);
        $expected = '"ÁÂÃÄÅÆÇÈÉÊËÌÍÎÏ"';
        $this->assertEquals($expected, $actual);

        // Retry by directly inputing the UTF-8 sequence.
        $string = 'ÁÂÃÄÅÆÇÈÉÊËÌÍÎÏ';
        $literal = new Literal($string);
        $actual = $serializer->serialiseValue($literal);
        $this->assertEquals($expected, $actual);
    }

    /**
     * Tests the basic Latin characters from U+0020 to U+007E.
     */
    public function testVisibleLatinCharacters()
    {
        $serializer = new Ntriples();
        $string = '!"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~';
        $literal = new Literal($string);
        $actual = $serializer->serialiseValue($literal);
        $expected = '"!\"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\\\]^_`abcdefghijklmnopqrstuvwxyz{|}~"';
        $this->assertEquals($expected, $actual);
    }

    /**
     * Tests the Latin-1 Supplement characters from U+00A0 to U+00FF.
     */
    public function testLatin1SupplementCharacters()
    {
        $serializer = new Ntriples();
        $string = '¡¢£¤¥¦§¨©ª«¬­®¯°±²³´µ¶·¸¹º»¼½¾¿ÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖ×ØÙÚÛÜÝÞßàáâãäåæçèéêëìíîïðñòóôõö÷øùúûüýþÿ';
        $literal = new Literal($string);
        $actual = $serializer->serialiseValue($literal);
        $expected = '"¡¢£¤¥¦§¨©ª«¬­®¯°±²³´µ¶·¸¹º»¼½¾¿ÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖ×ØÙÚÛÜÝÞßàáâãäåæçèéêëìíîïðñòóôõö÷øùúûüýþÿ"';
        $this->assertEquals($expected, $actual);
    }

    /**
     * Tests the Latin Extended-A characters from U+0100 to U+017F.
     */
    public function testLatinExtendedACharacters()
    {
        $serializer = new Ntriples();
        $string = 'ĀāĂăĄąĆćĈĉĊċČčĎďĐđĒēĔĕĖėĘęĚěĜĝĞğĠġĢģĤĥĦħĨĩĪīĬĭĮįİıĲĳĴĵĶķĸĹĺĻļĽľĿŀŁłŃńŅņŇňŉŊŋŌōŎŏŐőŒœŔŕŖŗŘřŚśŜŝŞşŠšŢţŤťŦŧŨũŪūŬŭŮůŰűŲųŴŵŶŷŸŹźŻżŽžſ';
        $literal = new Literal($string);
        $actual = $serializer->serialiseValue($literal);
        $expected = '"ĀāĂăĄąĆćĈĉĊċČčĎďĐđĒēĔĕĖėĘęĚěĜĝĞğĠġĢģĤĥĦħĨĩĪīĬĭĮįİıĲĳĴĵĶķĸĹĺĻļĽľĿŀŁłŃńŅņŇňŉŊŋŌōŎŏŐőŒœŔŕŖŗŘřŚśŜŝŞşŠšŢţŤťŦŧŨũŪūŬŭŮůŰűŲųŴŵŶŷŸŹźŻżŽžſ"';
        $this->assertEquals($expected, $actual);
    }

    /**
     * Tests the Latin Extended-B, Non-European & historic Latin characters.
     */
    public function testLatinExtendedBCharacters()
    {
        // Test characters from U+0180 to U+01BF.
        $serializer = new Ntriples();
        $string = 'ƀƁƂƃƄƅƆƇƈƉƊƋƌƍƎƏƐƑƒƓƔƕƖƗƘƙƚƛƜƝƞƟƠơƢƣƤƥƦƧƨƩƪƫƬƭƮƯưƱƲƳƴƵƶƷƸƹƺƻƼƽƾƿ';
        $literal = new Literal($string);
        $actual = $serializer->serialiseValue($literal);
        $expected = '"ƀƁƂƃƄƅƆƇƈƉƊƋƌƍƎƏƐƑƒƓƔƕƖƗƘƙƚƛƜƝƞƟƠơƢƣƤƥƦƧƨƩƪƫƬƭƮƯưƱƲƳƴƵƶƷƸƹƺƻƼƽƾƿ"';
        $this->assertEquals($expected, $actual);
    }

    /**
     * Tests the Latin Extended B, African clicks.
     */
    public function testLatinExtendedBAfricanClicks()
    {
        $serializer = new Ntriples();
        $string = 'ǀǁǂǃ';
        $literal = new Literal($string);
        $actual = $serializer->serialiseValue($literal);
        $expected = '"ǀǁǂǃ"';
        $this->assertEquals($expected, $actual);
    }

    /**
     * Tests the Latin Extended B - Croatian, Pinyin, Phonetic & historic letters.
     */
    public function testLatinExtendedBCroatianPinyinPhoneticHistoric()
    {
        $serializer = new Ntriples();
        $string = 'ǄǅǆǇǈǉǊǋǌǍǎǏǐǑǒǓǔǕǖǗǘǙǚǛǜǝǞǟǠǡǢǣǤǥǦǧǨǩǪǫǬǭǮǯǰǱǲǳǴǵǶǷǸǹǺǻǼǽǾǿ';
        $literal = new Literal($string);
        $actual = $serializer->serialiseValue($literal);
        $expected = '"ǄǅǆǇǈǉǊǋǌǍǎǏǐǑǒǓǔǕǖǗǘǙǚǛǜǝǞǟǠǡǢǣǤǥǦǧǨǩǪǫǬǭǮǯǰǱǲǳǴǵǶǷǸǹǺǻǼǽǾǿ"';
        $this->assertEquals($expected, $actual);
    }

    /**
     * Tests the Latin Extended B - Slovenian & Croatian, Romanian & Misc.
     */
    public function testLatinExtendedBSlovenianCroatianRomanianMisc()
    {
        $serializer = new Ntriples();
        $string = 'ȀȁȂȃȄȅȆȇȈȉȊȋȌȍȎȏȐȑȒȓȔȕȖȗȘșȚțȜȝȞȟȠȡȢȣȤȥȦȧȨȩ';
        $literal = new Literal($string);
        $actual = $serializer->serialiseValue($literal);
        $expected = '"ȀȁȂȃȄȅȆȇȈȉȊȋȌȍȎȏȐȑȒȓȔȕȖȗȘșȚțȜȝȞȟȠȡȢȣȤȥȦȧȨȩ"';
        $this->assertEquals($expected, $actual);
    }

    /**
     * Tests the Latin Extended B - Livonian, Sinology & Misc.
     */
    public function testLatinExtendedBLivonianSinologyMisc()
    {
        $serializer = new Ntriples();
        $string = 'ȦȧȨȩȪȫȬȭȮȯȰȱȲȳȴȵȶȷȸȹȺȻȼȽȾȿɀɁɂɃɄɅɆɇɈɉɊɋɌɍɎɏ';
        $literal = new Literal($string);
        $actual = $serializer->serialiseValue($literal);
        $expected = '"ȦȧȨȩȪȫȬȭȮȯȰȱȲȳȴȵȶȷȸȹȺȻȼȽȾȿɀɁɂɃɄɅɆɇɈɉɊɋɌɍɎɏ"';
        $this->assertEquals($expected, $actual);
    }
}
