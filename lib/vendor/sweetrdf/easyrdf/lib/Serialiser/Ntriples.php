<?php

namespace EasyRdf\Serialiser;

/*
 * EasyRdf
 *
 * LICENSE
 *
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
 * @copyright  Copyright (c) 2009-2020 Nicholas J Humfrey
 * @license    https://www.opensource.org/licenses/bsd-license.php
 */
use EasyRdf\Exception;
use EasyRdf\Graph;
use EasyRdf\Serialiser;
use rdfHelpers\NtriplesUtil;

/**
 * Class to serialise an EasyRdf\Graph to N-Triples
 * with no external dependencies.
 *
 * @copyright  Copyright (c) 2009-2020 Nicholas J Humfrey
 * @license    https://www.opensource.org/licenses/bsd-license.php
 */
class Ntriples extends Serialiser
{
    /**
     * List of control characters that are escaped.
     *
     * @var array<string,string>
     */
    protected $escapeControlCharacters = [];

    /**
     * Escapes a string literal according to the N-Triples specification.
     *
     * The sequence with which the characters are replaced is important.
     *
     * The sequence of replacements is:
     * - Backslash (\) - Escape character. It is escaped first so that we do not
     *   double escape other sequences that contain a backslash.
     * - Control characters (0-31) and DEL (127) - except \t, \n, \r and \".
     *   These are replaced with their unicode representation using a normal
     *   str_replace because they break preg_replace_callback.
     * - 8-byte characters - These are replaced with their unicode
     *   representation using a preg_replace_callback. They are replaced first
     *   so that they are not replaced as multiple characters down below.
     * - 4-byte characters - These are replaced with their unicode
     *   representation using a preg_replace_callback. They are replaced next so
     *   that they are not replaced as multiple characters down below.
     * - Characters from 127 to 255 - These are replaced with their unicode
     *   representation using a normal str_replace because fail to match in
     *   preg_replace_callback. This takes place here because otherwise, they
     *   might be confused with multibyte characters if it takes place before
     *   the two steps above. And it takes place after the above two steps, in
     *   order to avoid replacing them as multiple characters.
     * - Characters from 32 to 126 - These are not escaped as they are printable
     *   characters. However, the double quote (\") is escaped above as it is a
     *   special character in N-Triples.
     *
     * @see https://www.w3.org/TR/n-triples/#n-triples-grammar
     *
     * @param string $str The string to escape
     *
     * @return string The escaped string
     */
    protected function escapeString($str)
    {
        $special_control_chrs = $this->getEscapeControlCharacters();
        $str = str_replace(array_keys($special_control_chrs), array_values($special_control_chrs), $str);

        // Handle all 8-byte characters first so that they are not replaced
        // as multiple characters down below.
        if (preg_match('/[\x{10000}-\x{10FFFF}]/u', $str)) {
            $str = preg_replace_callback(
                '/[\x{10000}-\x{10FFFF}]/u',
                function ($matches) {
                    return $this->unicodeChar($this->unicodeCharNo($matches[0]), 8);
                },
                $str
            );
        }

        // Handle all 4-byte characters next, so that they are not replaced
        // as multiple characters down below.
        if (preg_match('/[\x{7F}-\x{FFFF}]/u', $str)) {
            $str = preg_replace_callback(
                '/[\x{7F}-\x{FFFF}]/u',
                function ($matches) {
                    return $this->unicodeChar($this->unicodeCharNo($matches[0]));
                },
                $str
            );
        }

        // Replace characters from 127 to 255 with their unicode representation.
        // This is done after the 4-byte characters so that we do not replace
        // them as multiple characters.
        $replacements = [];
        foreach (range(127, 255) as $i) {
            $replacements[\chr($i)] = $this->unicodeChar($i);
        }
        $str = str_replace(array_keys($replacements), array_values($replacements), $str);

        // Handle the rest of the characters. From 32 to 126, except 34 (\)
        // which we escaped earlier.
        if (preg_match('/[\x{32}-\x{5B}\x{5D}-\x{7E}]/u', $str)) {
            $str = preg_replace_callback(
                '/[\x{32}-\x{5B}\x{5D}-\x{7E}]/u',
                function ($matches) {
                    $match = $this->unicodeCharNo($matches[0]);
                    $replacements = [
                        9 => '\t',
                        10 => '\n',
                        13 => '\r',
                        34 => '\\"',
                    ];

                    if (92 === $match) {
                        return $matches[0];
                    }

                    if (isset($replacements[$match])) {
                        return $replacements[$match];
                    }

                    // Printable characters remain the same.
                    if ($match >= 32 && $match <= 126 && 34 !== $match) {
                        return $matches[0];
                    }

                    if ($match <= 0x10FFFF) {
                        return $this->unicodeChar($match);
                    }

                    return $this->unicodeChar($match, 8);
                },
                $str
            );
        }

        return $str;
    }

    private function unicodeChar($unicode_number, $pad = 4)
    {
        return (4 === $pad ? '\\u' : '\\U').sprintf('%0'.$pad.'X', $unicode_number);
    }

    /**
     * @ignore
     */
    protected function unicodeCharNo($cUtf)
    {
        $bl = \strlen($cUtf); /* binary length */
        $r = 0;
        switch ($bl) {
            case 1: /* 0####### (0-127) */
                $r = \ord($cUtf);
                break;
            case 2: /* 110##### 10###### = 192+x 128+x */
                $r = ((\ord($cUtf[0]) - 192) * 64) +
                    (\ord($cUtf[1]) - 128);
                break;
            case 3: /* 1110#### 10###### 10###### = 224+x 128+x 128+x */
                $r = ((\ord($cUtf[0]) - 224) * 4096) +
                    ((\ord($cUtf[1]) - 128) * 64) +
                    (\ord($cUtf[2]) - 128);
                break;
            case 4: /* 1111#### 10###### 10###### 10###### = 240+x 128+x 128+x 128+x */
                $r = ((\ord($cUtf[0]) - 240) * 262144) +
                    ((\ord($cUtf[1]) - 128) * 4096) +
                    ((\ord($cUtf[2]) - 128) * 64) +
                    (\ord($cUtf[3]) - 128);
                break;
        }

        return $r;
    }

    /**
     * @ignore
     */
    protected function serialiseResource($res)
    {
        $escaped = $this->escapeString($res);
        if ('_:' == substr($res, 0, 2)) {
            return $escaped;
        } else {
            return "<$escaped>";
        }
    }

    /**
     * Serialise an RDF value into N-Triples
     *
     * The value can either be an array in RDF/PHP form, or
     * an EasyRdf\Literal or EasyRdf\Resource object.
     *
     * @param array|object $value An associative array or an object
     *
     * @return string The RDF value serialised to N-Triples
     *
     * @throws Exception
     */
    public function serialiseValue($value)
    {
        if (\is_object($value)) {
            $value = $value->toRdfPhp();
        }

        if ('uri' == $value['type'] || 'bnode' == $value['type']) {
            return $this->serialiseResource($value['value']);
        } elseif ('literal' == $value['type']) {
            $escaped = NtriplesUtil::escapeLiteral($value['value']);
            if (isset($value['lang'])) {
                $lang = $this->escapeString($value['lang']);

                return '"'.$escaped.'"@'.$lang;
            } elseif (isset($value['datatype'])) {
                $datatype = $this->escapeString($value['datatype']);

                return '"'.$escaped.'"'."^^<$datatype>";
            } else {
                return '"'.$escaped.'"';
            }
        } else {
            throw new Exception("Unable to serialise object of type '".$value['type']."' to ntriples: ");
        }
    }

    /**
     * Serialise an EasyRdf\Graph into N-Triples
     *
     * @param Graph  $graph  an EasyRdf\Graph object
     * @param string $format the name of the format to convert to
     *
     * @return string the RDF in the new desired format
     *
     * @throws Exception
     */
    public function serialise(Graph $graph, $format, array $options = [])
    {
        parent::checkSerialiseParams($format);

        if ('ntriples' == $format) {
            $nt = '';
            foreach ($graph->toRdfPhp() as $resource => $properties) {
                foreach ($properties as $property => $values) {
                    foreach ($values as $value) {
                        $nt .= $this->serialiseResource($resource).' ';
                        $nt .= '<'.$this->escapeString($property).'> ';
                        $nt .= $this->serialiseValue($value)." .\n";
                    }
                }
            }

            return $nt;
        } else {
            throw new Exception(__CLASS__." does not support: $format");
        }
    }

    /**
     * Returns the list of control characters to escape.
     *
     * @return array the list of control characters to escape
     */
    private function getEscapeControlCharacters(): array
    {
        if (empty($this->escapeControlCharacters)) {
            // List of characters indexed by their printed representation.
            // Initialize it with the ['\\' => '\\\\'] in order to first replace the
            // '\\' character.
            $this->escapeControlCharacters = [\chr(92) => '\\\\'];

            foreach (range(0, 31) as $i) {
                $this->escapeControlCharacters[\chr($i)] = $this->unicodeChar($i);
            }

            // However, "\t", "\n", "\r" and "\"" are allowed.
            $this->escapeControlCharacters[\chr(9)] = '\t';
            $this->escapeControlCharacters[\chr(10)] = '\n';
            $this->escapeControlCharacters[\chr(13)] = '\r';
            $this->escapeControlCharacters[\chr(34)] = '\\"';

            // Handle also the DEL character.
            $this->escapeControlCharacters[\chr(127)] = $this->unicodeChar(127);
        }

        return $this->escapeControlCharacters;
    }
}
