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

use Stringable;

/**
 *
 * @author zozlak
 */
interface DataFactoryInterface {

    public static function namedNode(string | Stringable $iri): NamedNodeInterface;

    public static function blankNode(string | Stringable | null $iri = null): BlankNodeInterface;

    public static function literal(int | float | string | bool | Stringable $value,
                                   string | Stringable | null $lang = null,
                                   string | Stringable | null $datatype = null): LiteralInterface;

    public static function defaultGraph(): DefaultGraphInterface;

    public static function quad(TermInterface $subject, NamedNodeInterface $predicate,
                                TermInterface $object,
                                NamedNodeInterface | BlankNodeInterface | DefaultGraphInterface | null $graph = null): QuadInterface;

}
