<?php

/*
 * The MIT License
 *
 * Copyright 2021 zozlak.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */

namespace rdfHelpers;

use zozlak\RdfConstants as RDF;
use rdfInterface\NamedNodeInterface as NamedNode;
use rdfInterface\BlankNodeInterface as BlankNode;
use rdfInterface\LiteralInterface as Literal;
use rdfInterface\QuadInterface as Quad;
use rdfInterface\DefaultGraphInterface as DefaultGraph;

/**
 * Description of Util
 *
 * @author zozlak
 */
class NtriplesUtil {

    /**
     * Characters forbidden in n-triples literals according to
     * https://www.w3.org/TR/n-triples/#grammar-production-IRIREF
     *
     * @var string[]
     */
    private static $iriEscapeMap = [
        "<"    => "\\u003C",
        ">"    => "\\u003E",
        '"'    => "\\u0022",
        "{"    => "\\u007B",
        "}"    => "\\u007D",
        "|"    => "\\u007C",
        "^"    => "\\u005E",
        "`"    => "\\u0060",
        "\\"   => "\\u005C",
        "\x00" => "\\u0000",
        "\x01" => "\\u0001",
        "\x02" => "\\u0002",
        "\x03" => "\\u0003",
        "\x04" => "\\u0004",
        "\x05" => "\\u0005",
        "\x06" => "\\u0006",
        "\x07" => "\\u0007",
        "\x08" => "\\u0008",
        "\x09" => "\\u0009",
        "\x0A" => "\\u000A",
        "\x0B" => "\\u000B",
        "\x0C" => "\\u000C",
        "\x0D" => "\\u000D",
        "\x0E" => "\\u000E",
        "\x0F" => "\\u000F",
        "\x10" => "\\u0010",
        "\x11" => "\\u0011",
        "\x12" => "\\u0012",
        "\x13" => "\\u0013",
        "\x14" => "\\u0014",
        "\x15" => "\\u0015",
        "\x16" => "\\u0016",
        "\x17" => "\\u0017",
        "\x18" => "\\u0018",
        "\x19" => "\\u0019",
        "\x1A" => "\\u001A",
        "\x1B" => "\\u001B",
        "\x1C" => "\\u001C",
        "\x1D" => "\\u001D",
        "\x1E" => "\\u001E",
        "\x1F" => "\\u001F",
        "\x20" => "\\u0020",
    ];

    /**
     * Characters forbidden in n-triples literals according to
     * https://www.w3.org/TR/n-triples/#grammar-production-STRING_LITERAL_QUOTE
     * @var string[]
     */
    private static $literalEscapeMap = [
        "\n" => '\\n',
        "\r" => '\\r',
        '"'  => '\\"',
        '\\' => '\\\\'
    ];

    public static function escapeLiteral(string $str): string {
        return strtr($str, self::$literalEscapeMap);
    }

    public static function escapeIri(string $str): string {
        return strtr($str, self::$iriEscapeMap);
    }

    public static function serializeIri(NamedNode | BlankNode $res): string {
        if ($res instanceof DefaultGraph) {
            return '';
        }
        $escaped = self::escapeIri((string) $res->getValue());
        if (substr($res, 0, 2) == '_:') {
            return $escaped;
        } else {
            return "<$escaped>";
        }
    }

    public static function serializeLiteral(Literal $literal): string {
        $langtype = '@' . $literal->getLang();
        if ($langtype === '@') {
            $langtype = $literal->getDatatype();
            $langtype = $langtype == RDF::XSD_STRING ? '' : '^^<' . self::escapeIri($literal->getDatatype()) . '>';
        }
        return '"' . self::escapeLiteral((string) $literal->getValue()) . '"' . $langtype;
    }

    public static function serializeQuad(Quad $quad): string {
        $sbj   = self::serialize($quad->getSubject());
        $pred  = self::serializeIri($quad->getPredicate());
        $obj   = self::serialize($quad->getObject());
        $graph = $quad->getGraph();
        if ($graph !== null && !($graph instanceof DefaultGraph)) {
            $graph = NtriplesUtil::serializeIri($graph);
        } else {
            $graph = '';
        }
        return "<< $sbj $pred $obj $graph >>";
    }

    public static function serialize(NamedNode | BlankNode | Literal | Quad $term): string {
        if ($term instanceof Literal) {
            return self::serializeLiteral($term);
        } elseif ($term instanceof Quad) {
            return self::serializeQuad($term);
        } else {
            return self::serializeIri($term);
        }
    }
}
