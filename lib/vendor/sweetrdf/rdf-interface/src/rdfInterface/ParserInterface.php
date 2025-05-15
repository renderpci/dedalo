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

namespace rdfInterface;

/**
 *
 * @author zozlak
 */
interface ParserInterface {

    /**
     * `$baseUri` value to be used when identifiers of blanks nodes encountered
     *  in the input source should be preserved. If you need it on production,
     *  think twice. It can be a last resort though in some corner cases like
     *  parsing reference test outputs.
     */
    const BLANK_NODES_PRESERVE = '__PRESERVE_BLANK_NODES__';

    /**
     * 
     * @param DataFactoryInterface $dataFactory factory to be used to generate RDF terms.
     */
    public function __construct(DataFactoryInterface $dataFactory);

    /**
     * 
     * @param string $input
     * @param string $baseUri allows to specify the base URI of the parsed document
     *   so a parser can correctly determine which blank nodes belong to the same 
     *   document (see also the `BLANK_NODES_PRESERVE` constant)
     * @return QuadIteratorInterface
     */
    public function parse(string $input, string $baseUri = ''): QuadIteratorInterface;

    /**
     *
     * @param resource | \Psr\Http\Message\StreamInterface $input
     * @param string $baseUri allows to specify the base URI of the parsed document
     *   so a parser can correctly determine which blank nodes belong to the same 
     *   document (see also the `BLANK_NODES_PRESERVE` constant)
     * @return \rdfInterface\QuadIteratorInterface
     */
    public function parseStream($input, string $baseUri = ''): QuadIteratorInterface;
}
