<?php

namespace Tests\ParserTest\RDFa;

/*
 * EasyRdf
 *
 * LICENSE
 *
 * Copyright (c) 2012-2014 Nicholas J Humfrey.  All rights reserved.
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
 * @copyright  Copyright (c) 2012-2014 Nicholas J Humfrey
 * @license    https://www.opensource.org/licenses/bsd-license.php
 */

use EasyRdf\Exception;
use EasyRdf\Graph;
use EasyRdf\Parser\Ntriples;
use EasyRdf\Parser\Rdfa;
use Test\TestCase;

class RdfaTest extends TestCase
{
    private string $baseUri = 'http://rdfa.info/test-suite/test-cases/rdfa1.1/xhtml5/';

    /**
     * @throws \Exception if file does not exist
     */
    private function loadTestFileContent(string $filename): string
    {
        $path = ROOT_PATH
            .\DIRECTORY_SEPARATOR
            .'tests'
            .\DIRECTORY_SEPARATOR
            .'ParserTest'
            .\DIRECTORY_SEPARATOR
            .'RDFa'
            .\DIRECTORY_SEPARATOR
            .'test_files'
            .\DIRECTORY_SEPARATOR
            .$filename;

        if (is_readable($path)) {
            $content = file_get_contents($path);
            if (\is_string($content)) {
                return $content;
            } else {
                throw new Exception('File content is not readable: '.$path);
            }
        }

        throw new Exception('File does not exist or is not readable: '.$path);
    }

    /**
     * @throws \Exception if serialization is invalid
     */
    private function parse(string $serialization, string $filename): array|string
    {
        if ('rdfa' == $serialization) {
            $parser = new Rdfa();
        } elseif ('ntriples' == $serialization) {
            $parser = new Ntriples();
        } else {
            throw new Exception('Invalid serialization given: '.$serialization);
        }

        $graph = new Graph();

        $parser->parse(
            $graph,
            $this->loadTestFileContent($filename),
            $serialization,
            $this->baseUri.basename($filename)
        );

        return $graph->serialise('ntriples-array');
    }

    private function rdfaTestCase(string $name, string $message): void
    {
        self::assertEquals(
            $this->parse('ntriples', $name.'.nt'),
            $this->parse('rdfa', $name.'.xhtml'),
            $message
        );
    }

    public function testParseUnsupportedFormat(): void
    {
        $this->expectException(Exception::class);
        $this->expectExceptionMessage('EasyRdf\Parser\Rdfa does not support: unsupportedformat');

        (new Rdfa())->parse(new Graph(), 'data', 'unsupportedformat', null);
    }

    public function testCase0001(): void
    {
        $this->rdfaTestCase('0001', 'Predicate establishment with @property');
    }

    public function testCase0006(): void
    {
        $this->rdfaTestCase('0006', '@rel and @rev');
    }

    public function testCase0007(): void
    {
        $this->rdfaTestCase('0007', '@rel, @rev, @property, @content');
    }

    public function testCase0008(): void
    {
        $this->rdfaTestCase('0008', 'empty string @about');
    }

    public function testCase0009(): void
    {
        $this->rdfaTestCase('0009', '@rev');
    }

    public function testCase0010(): void
    {
        $this->rdfaTestCase('0010', '@rel, @rev, @href');
    }

    public function testCase0014(): void
    {
        $this->rdfaTestCase('0014', '@datatype, xsd:integer');
    }

    public function testCase0015(): void
    {
        $this->rdfaTestCase('0015', 'meta and link');
    }

    public function testCase0017(): void
    {
        $this->rdfaTestCase('0017', 'Related blanknodes');
    }

    public function testCase0018(): void
    {
        $this->rdfaTestCase('0018', '@rel for predicate');
    }

    public function testCase0020(): void
    {
        $this->rdfaTestCase('0020', 'Inheriting @about for subject');
    }

    public function testCase0021(): void
    {
        $this->rdfaTestCase('0021', 'Subject inheritance with no @about');
    }

    public function testCase0023(): void
    {
        $this->rdfaTestCase('0023', '@id does not generate subjects');
    }

    public function testCase0025(): void
    {
        $this->rdfaTestCase('0025', 'simple chaining test');
    }

    public function testCase0026(): void
    {
        $this->rdfaTestCase('0026', '@content');
    }

    public function testCase0027(): void
    {
        $this->rdfaTestCase('0027', '@content, ignore element content');
    }

    public function testCase0029(): void
    {
        $this->rdfaTestCase('0029', 'markup stripping with @datatype');
    }

    public function testCase0030(): void
    {
        $this->rdfaTestCase('0030', 'omitted @about');
    }

    public function testCase0031(): void
    {
        $this->rdfaTestCase('0031', 'simple @resource');
    }

    public function testCase0032(): void
    {
        $this->rdfaTestCase('0032', '@resource overrides @href');
    }

    public function testCase0033(): void
    {
        $this->rdfaTestCase('0033', 'simple chaining test with bNode');
    }

    public function testCase0034(): void
    {
        $this->rdfaTestCase('0034', 'simple img[@src] test');
    }

    public function testCase0036(): void
    {
        $this->rdfaTestCase('0036', '@src/@resource test');
    }

    public function testCase0038(): void
    {
        $this->rdfaTestCase('0038', '@rev - img[@src] test');
    }

    public function testCase0048(): void
    {
        $this->rdfaTestCase('0048', '@typeof with @about and @rel present, no @resource');
    }

    public function testCase0049(): void
    {
        $this->rdfaTestCase('0049', '@typeof with @about, no @rel or @resource');
    }

    public function testCase0050(): void
    {
        $this->rdfaTestCase('0050', '@typeof without anything else');
    }

    public function testCase0051(): void
    {
        $this->rdfaTestCase('0051', '@typeof with a single @property');
    }

    public function testCase0052(): void
    {
        $this->rdfaTestCase('0052', '@typeof with @resource and nothing else');
    }

    public function testCase0053(): void
    {
        $this->rdfaTestCase('0053', '@typeof with @resource and nothing else, with a subelement');
    }

    public function testCase0054(): void
    {
        $this->rdfaTestCase('0054', 'multiple @property');
    }

    public function testCase0055(): void
    {
        $this->rdfaTestCase('0055', 'multiple @rel');
    }

    public function testCase0056(): void
    {
        $this->rdfaTestCase('0056', '@typeof applies to @about on same element with hanging rel');
    }

    public function testCase0057(): void
    {
        $this->rdfaTestCase('0057', 'hanging @rel creates multiple triples');
    }

    public function testCase0059(): void
    {
        $this->rdfaTestCase('0059', 'multiple hanging @rels with multiple children');
    }

    public function testCase0060(): void
    {
        $this->rdfaTestCase('0060', 'UTF-8 conformance');
    }

    public function testCase0063(): void
    {
        $this->rdfaTestCase('0063', '@rel in head using reserved XHTML value and empty-prefix CURIE syntax');
    }

    public function testCase0064(): void
    {
        $this->rdfaTestCase('0064', '@about with safe CURIE');
    }

    public function testCase0065(): void
    {
        $this->rdfaTestCase('0065', '@rel with safe CURIE');
    }

    public function testCase0066(): void
    {
        $this->rdfaTestCase('0066', '@about with @typeof in the head');
    }

    public function testCase0067(): void
    {
        $this->rdfaTestCase('0067', '@property in the head');
    }

    public function testCase0068(): void
    {
        $this->rdfaTestCase('0068', 'Relative URI in @about');
    }

    public function testCase0069(): void
    {
        $this->rdfaTestCase('0069', 'Relative URI in @href');
    }

    public function testCase0070(): void
    {
        $this->rdfaTestCase('0070', 'Relative URI in @resource');
    }

    public function testCase0071(): void
    {
        $this->rdfaTestCase('0071', 'No explicit @about');
    }

    public function testCase0072(): void
    {
        $this->rdfaTestCase('0072', 'Relative URI in @about (with XHTML base in head)');
    }

    public function testCase0073(): void
    {
        $this->rdfaTestCase('0073', 'Relative URI in @resource (with XHTML base in head)');
    }

    public function testCase0074(): void
    {
        $this->rdfaTestCase('0074', 'Relative URI in @href (with XHTML base in head)');
    }

    public function testCase0075(): void
    {
        $this->rdfaTestCase('0075', 'Reserved word \'license\' in @rel with no explicit @about');
    }

    public function testCase0080(): void
    {
        $this->rdfaTestCase('0080', '@about overrides @resource in incomplete triples');
    }

    public function testCase0083(): void
    {
        $this->rdfaTestCase('0083', 'multiple ways of handling incomplete triples (merged)');
    }

    public function testCase0084(): void
    {
        $this->rdfaTestCase('0084', 'multiple ways of handling incomplete triples, this time with both @rel and @rev');
    }

    public function testCase0088(): void
    {
        $this->markTestIncomplete("FIXME: Graph comparison isn't working");

        // $this->rdfaTestCase('0088', 'Interpretation of the CURIE "_:"');
    }

    public function testCase0089(): void
    {
        $this->rdfaTestCase('0089', '@src sets a new subject (@typeof)');
    }

    public function testCase0091(): void
    {
        $this->rdfaTestCase('0091', 'Non-reserved, un-prefixed CURIE in @property');
    }

    public function testCase0093(): void
    {
        $this->rdfaTestCase('0093', 'Tests XMLLiteral content with explicit @datatype (user-data-typed literal)');
    }

    public function testCase0099(): void
    {
        $this->rdfaTestCase('0099', 'Preservation of white space in literals');
    }

    public function testCase0104(): void
    {
        $this->rdfaTestCase('0104', 'rdf:value');
    }

    public function testCase0106(): void
    {
        $this->rdfaTestCase('0106', 'chaining with empty value in inner @rel');
    }

    public function testCase0107(): void
    {
        $this->rdfaTestCase('0107', 'no garbage collecting bnodes');
    }

    public function testCase0110(): void
    {
        $this->rdfaTestCase('0110', 'bNode generated even though no nested @about exists');
    }

    public function testCase0111(): void
    {
        $this->rdfaTestCase('0111', 'two bNodes generated after three levels of nesting');
    }

    public function testCase0112(): void
    {
        $this->rdfaTestCase('0112', 'plain literal with datatype=""');
    }

    public function testCase0115(): void
    {
        $this->rdfaTestCase('0115', 'XML Entities must be supported by RDFa parser');
    }

    public function testCase0117(): void
    {
        $this->rdfaTestCase('0117', 'Fragment identifiers stripped from BASE');
    }

    public function testCase0118(): void
    {
        $this->rdfaTestCase('0118', 'empty string "" is not equivalent to NULL - @about');
    }

    public function testCase0119(): void
    {
        $this->rdfaTestCase('0119', '"[prefix:]" CURIE format is valid');
    }

    public function testCase0120(): void
    {
        $this->rdfaTestCase('0120', '"[:]" CURIE format is valid');
    }

    public function testCase0121(): void
    {
        $this->rdfaTestCase('0121', '"[]" is a valid safe CURIE');
    }

    public function testCase0122(): void
    {
        $this->rdfaTestCase('0122', 'resource="[]" does not set the object');
    }

    public function testCase0126(): void
    {
        $this->rdfaTestCase('0126', 'Multiple @typeof values');
    }

    public function testCase0134(): void
    {
        $this->rdfaTestCase('0134', 'Uppercase reserved words');
    }

    public function testCase0140(): void
    {
        $this->rdfaTestCase('0140', 'Blank nodes identifiers are not allowed as predicates');
    }

    public function testCase0147(): void
    {
        $this->rdfaTestCase('0147', 'xmlns prefix \'xmlzzz\' (reserved)');
    }

    public function testCase0174(): void
    {
        $this->rdfaTestCase('0174', 'Support single character prefix in CURIEs');
    }

    public function testCase0175(): void
    {
        $this->rdfaTestCase('0175', 'IRI for @property is allowed');
    }

    public function testCase0176(): void
    {
        $this->rdfaTestCase('0176', 'IRI for @rel and @rev is allowed');
    }

    public function testCase0177(): void
    {
        $this->rdfaTestCase('0177', 'Test @prefix');
    }

    public function testCase0178(): void
    {
        $this->rdfaTestCase('0178', 'Test @prefix with multiple mappings');
    }

    public function testCase0179(): void
    {
        $this->rdfaTestCase('0179', 'Test @prefix vs @xmlns priority');
    }

    public function testCase0181(): void
    {
        $this->rdfaTestCase('0181', 'Test default XHTML vocabulary');
    }

    public function testCase0182(): void
    {
        $this->rdfaTestCase('0182', 'Test prefix locality');
    }

    public function testCase0183(): void
    {
        $this->rdfaTestCase('0183', 'Test @xmlns redefines @prefix');
    }

    public function testCase0186(): void
    {
        $this->rdfaTestCase('0186', '@vocab after subject declaration');
    }

    public function testCase0187(): void
    {
        $this->rdfaTestCase('0187', '@vocab redefinition');
    }

    public function testCase0188(): void
    {
        $this->rdfaTestCase('0188', '@vocab only affects predicates');
    }

    public function testCase0189(): void
    {
        $this->rdfaTestCase('0189', '@vocab overrides default term');
    }

    public function testCase0190(): void
    {
        $this->rdfaTestCase('0190', 'Test term case insensitivity');
    }

    public function testCase0196(): void
    {
        $this->rdfaTestCase('0196', 'Test process explicit XMLLiteral');
    }

    public function testCase0197(): void
    {
        $this->rdfaTestCase('0197', 'Test TERMorCURIEorAbsURI requires an absolute URI');
    }

    public function testCase0198(): void
    {
        $this->rdfaTestCase('0198', 'datatype XMLLiteral with other embedded RDFa');
    }

    public function testCase0206(): void
    {
        $this->rdfaTestCase('0206', 'Usage of Initial Context');
    }

    public function testCase0207(): void
    {
        $this->rdfaTestCase('0207', 'Vevent using @typeof');
    }

    public function testCase0213(): void
    {
        $this->rdfaTestCase('0213', 'Datatype generation for a literal with XML content, version 1.1');
    }

    public function testCase0214(): void
    {
        $this->rdfaTestCase('0214', 'Root element has implicit @about=""');
    }

    public function testCase0216(): void
    {
        $this->rdfaTestCase('0216', 'Proper character encoding detection in spite of large headers');
    }

    public function testCase0217(): void
    {
        $this->rdfaTestCase('0217', '@vocab causes rdfa:usesVocabulary triple to be added');
    }

    public function testCase0218(): void
    {
        $this->rdfaTestCase('0218', '@inlist to create empty list');
    }

    public function testCase0219(): void
    {
        $this->rdfaTestCase('0219', '@inlist with literal');
    }

    public function testCase0220(): void
    {
        $this->rdfaTestCase('0220', '@inlist with IRI');
    }

    public function testCase0221(): void
    {
        $this->rdfaTestCase('0221', '@inlist with hetrogenious membership');
    }

    public function testCase0224(): void
    {
        $this->markTestIncomplete('FIXME: need to implement @inlist');

        // $this->rdfaTestCase('0224', '@inlist hanging @rel');
    }

    public function testCase0225(): void
    {
        $this->rdfaTestCase('0225', '@inlist on different elements with same subject');
    }

    public function testCase0228(): void
    {
        $this->rdfaTestCase('0228', '1.1 alternate for test 0040: @rev - @src/@resource test');
    }

    public function testCase0229(): void
    {
        $this->rdfaTestCase('0229', 'img[@src] test with omitted @about');
    }

    public function testCase0231(): void
    {
        $this->rdfaTestCase('0231', 'Set image license information');
    }

    public function testCase0232(): void
    {
        $this->rdfaTestCase(
            '0232',
            '@typeof with @rel present, no @href, @resource, or @about (1.1 behavior of 0046);'
        );
    }

    public function testCase0233(): void
    {
        $this->rdfaTestCase('0233', '@typeof with @rel and @resource present, no @about (1.1 behavior of 0047)');
    }

    public function testCase0246(): void
    {
        $this->markTestIncomplete("FIXME: Graph comparison isn't working");

        // $this->rdfaTestCase('0246', 'hanging @rel creates multiple triples, @typeof permutation; RDFa 1.1 version');
    }

    public function testCase0247(): void
    {
        $this->markTestIncomplete('FIXME: Multiple incomplete triples, RDFa 1.1version');

        // $this->rdfaTestCase('0247', 'Multiple incomplete triples, RDFa 1.1version');
    }

    public function testCase0248(): void
    {
        $this->rdfaTestCase('0248', 'multiple ways of handling incomplete triples (with @rev); RDFa 1.1 version');
    }

    public function testCase0249(): void
    {
        $this->rdfaTestCase(
            '0249',
            'multiple ways of handling incomplete triples (with @rel and @rev); RDFa 1.1 version'
        );
    }

    public function testCase0250(): void
    {
        $this->rdfaTestCase('0250', 'Checking the right behaviour of @typeof with @about, in presence of @property');
    }

    public function testCase0251(): void
    {
        $this->rdfaTestCase('0251', 'lang');
    }

    public function testCase0252(): void
    {
        $this->rdfaTestCase('0252', 'lang inheritance');
    }

    public function testCase0253(): void
    {
        $this->rdfaTestCase('0253', 'plain literal with datatype="" and lang preservation');
    }

    public function testCase0254(): void
    {
        $this->rdfaTestCase('0254', '@datatype="" generates plain literal in presence of child nodes');
    }

    public function testCase0255(): void
    {
        $this->rdfaTestCase('0255', 'lang="" clears language setting');
    }

    public function testCase0256(): void
    {
        $this->rdfaTestCase('0256', 'lang and xml:lang on the same element');
    }

    public function testCase0257(): void
    {
        $this->rdfaTestCase(
            '0257',
            'element with @property and no child nodes generates  empty plain literal (HTML5 version of 0113)'
        );
    }

    public function testCase0259(): void
    {
        $this->rdfaTestCase('0259', 'XML+RDFa Initial Context');
    }

    public function testCase0261(): void
    {
        $this->rdfaTestCase('0261', 'White space preservation in XMLLiteral');
    }

    public function testCase0262(): void
    {
        $this->rdfaTestCase(
            '0262',
            'Predicate establishment with @property, with white spaces before and after the attribute value'
        );
    }

    public function testCase0263(): void
    {
        $this->rdfaTestCase('0263', '@property appearing on the html element yields the base as the subject');
    }

    public function testCase0264(): void
    {
        $this->rdfaTestCase(
            '0264',
            '@property appearing on the head element gets the subject from <html>, ie, parent'
        );
    }

    public function testCase0265(): void
    {
        $this->rdfaTestCase(
            '0265',
            '@property appearing on the head element gets the subject from <html>, ie, parent'
        );
    }

    public function testCase0266(): void
    {
        $this->rdfaTestCase('0266', '@property without @content or @datatype, typed object set by @href and @typeof');
    }

    public function testCase0267(): void
    {
        $this->rdfaTestCase(
            '0267',
            '@property without @content or @datatype, typed object set by @resource and @typeof'
        );
    }

    public function testCase0268(): void
    {
        $this->rdfaTestCase('0268', '@property without @content or @datatype, typed object set by @src and @typeof');
    }

    public function testCase0269(): void
    {
        $this->rdfaTestCase(
            '0269',
            '@property appearing on the html element yields the base as the subject, also with @content'
        );
    }

    public function testCase0271(): void
    {
        $this->rdfaTestCase('0271', 'Use of @property in HEAD with explicit parent subject via @about');
    }

    public function testCase0272(): void
    {
        $this->rdfaTestCase('0272', 'time element with @datetime an xsd:date');
    }

    public function testCase0273(): void
    {
        $this->rdfaTestCase('0273', 'time element with @datetime an xsd:time');
    }

    public function testCase0274(): void
    {
        $this->rdfaTestCase('0274', 'time element with @datetime an xsd:dateTime');
    }

    public function testCase0275(): void
    {
        $this->rdfaTestCase('0275', 'time element with value an xsd:date');
    }

    public function testCase0276(): void
    {
        $this->rdfaTestCase('0276', 'time element with value an xsd:time');
    }

    public function testCase0277(): void
    {
        $this->rdfaTestCase('0277', 'time element with value an xsd:dateTime');
    }

    public function testCase0278(): void
    {
        $this->rdfaTestCase('0278', '@content overrides @datetime');
    }

    public function testCase0279(): void
    {
        $this->rdfaTestCase('0279', '@datatype used with @datetime overrides default datatype');
    }

    public function testCase0281(): void
    {
        $this->rdfaTestCase('0281', 'time element with @datetime an xsd:gYear');
    }

    public function testCase0282(): void
    {
        $this->rdfaTestCase('0282', 'time element with @datetime an xsd:gYearMonth');
    }

    public function testCase0283(): void
    {
        $this->rdfaTestCase('0283', 'time element with @datetime an invalid datatype generates plain literal');
    }

    public function testCase0284(): void
    {
        $this->rdfaTestCase('0284', 'time element not matching datatype but with explicit @datatype');
    }

    public function testCase0287(): void
    {
        $this->rdfaTestCase('0287', 'time element with @datetime an xsd:dateTime with TZ offset');
    }

    public function testCase0289(): void
    {
        $this->rdfaTestCase('0289', '@href becomes subject when @property and @content are present');
    }

    public function testCase0290(): void
    {
        $this->rdfaTestCase('0290', '@href becomes subject when @property and @datatype are present');
    }

    public function testCase0291(): void
    {
        $this->rdfaTestCase('0291', '@href as subject overridden by @about');
    }

    public function testCase0292(): void
    {
        $this->rdfaTestCase('0292', '@about overriding @href as subject is used as parent resource');
    }

    public function testCase0293(): void
    {
        $this->rdfaTestCase('0293', 'Testing the \':\' character usage in a CURIE');
    }

    public function testCase0296(): void
    {
        $this->rdfaTestCase('0296', '@property does set parent object without @typeof');
    }

    public function testCase0297(): void
    {
        $this->rdfaTestCase('0297', '@about=[] with @typeof does not create a new subject');
    }

    public function testCase0298(): void
    {
        $this->rdfaTestCase('0298', '@about=[] with @typeof does not create a new object');
    }

    public function testCase0299(): void
    {
        $this->rdfaTestCase('0299', '@resource=[] with @href or @src uses @href or @src (@rel)');
    }

    public function testCase0300(): void
    {
        $this->rdfaTestCase('0300', '@resource=[] with @href or @src uses @href or @src (@property)');
    }

    public function testCase0301(): void
    {
        $this->rdfaTestCase('0301', '@property with @typeof creates a typed_resource for chaining');
    }

    public function testCase0302(): void
    {
        $this->rdfaTestCase('0302', '@typeof with different content types');
    }

    public function testCase0311(): void
    {
        $this->rdfaTestCase('0311', 'Ensure no triples are generated when @property is empty');
    }

    public function testCase0312(): void
    {
        $this->markTestIncomplete('FIXME: Mute plain @rel if @property is present');

        // $this->rdfaTestCase('0312', 'Mute plain @rel if @property is present');
    }

    public function testCase0315(): void
    {
        $this->rdfaTestCase('0315', '@property and @typeof with incomplete triples');
    }

    public function testCase0316(): void
    {
        $this->rdfaTestCase('0316', '@property and @typeof with incomplete triples (@href variant)');
    }

    public function testCase0317(): void
    {
        $this->rdfaTestCase('0317', '@datatype inhibits new @property behavior');
    }

    public function testCase0318(): void
    {
        $this->rdfaTestCase('0318', 'Setting @vocab to empty strings removes default vocabulary');
    }

    public function testCase0319(): void
    {
        $this->rdfaTestCase('0319', 'Relative @profile');
    }

    public function testCase0321(): void
    {
        $this->markTestIncomplete('FIXME: rdfa:copy to rdfa:Pattern');

        // $this->rdfaTestCase('0321', 'rdfa:copy to rdfa:Pattern');
    }

    public function testCase0322(): void
    {
        $this->markTestIncomplete('FIXME: rdfa:copy for additional property value');

        // $this->rdfaTestCase('0322', 'rdfa:copy for additional property value');
    }

    public function testCase0323(): void
    {
        $this->markTestIncomplete('FIXME: Multiple references to rdfa:Pattern');

        // $this->rdfaTestCase('0323', 'Multiple references to rdfa:Pattern');
    }

    public function testCase0324(): void
    {
        $this->markTestIncomplete('FIXME: Multiple references to rdfa:Pattern');

        // $this->rdfaTestCase('0324', 'Multiple references to rdfa:Pattern');
    }

    public function testCase0325(): void
    {
        $this->markTestIncomplete('FIXME: Multiple references to rdfa:Pattern creating a resource');

        // $this->rdfaTestCase('0325', 'Multiple references to rdfa:Pattern creating a resource');
    }

    public function testCase0326(): void
    {
        $this->markTestIncomplete('FIXME: rdfa:Pattern removed only if referenced');

        // $this->rdfaTestCase('0326', 'rdfa:Pattern removed only if referenced');
    }

    public function testCase0327(): void
    {
        $this->markTestIncomplete('FIXME: rdfa:Pattern chaining');

        // $this->rdfaTestCase('0327', 'rdfa:Pattern chaining');
    }

    public function testCase0328(): void
    {
        $this->rdfaTestCase('0328', '@content overrides the content of the time element.');
    }

    public function testCase0329(): void
    {
        $this->rdfaTestCase('0329', 'Recursive triple generation ');
    }

    public function testCase0330(): void
    {
        $this->rdfaTestCase('0330', '@datatype overrides inherited @lang');
    }

    public function testCase0331(): void
    {
        $this->rdfaTestCase('0331', '@datatype overrides inherited @lang, with @content');
    }

    public function testCase0332(): void
    {
        $this->rdfaTestCase('0332', 'Empty @datatype doesn\'t override inherited @lang, with @content');
    }

    public function testCase0333(): void
    {
        $this->rdfaTestCase('0333', '@content overrides @datetime (with @datatype specified)');
    }
}
