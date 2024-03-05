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

    /**
     * Creates a new RDF named node.
     * 
     * @param string|Stringable $iri
     * @return NamedNodeInterface
     */
    public static function namedNode(string | Stringable $iri): NamedNodeInterface;

    /**
     * Creates a new RDF blank node.
     * 
     * @param string|Stringable|null $iri
     * @return BlankNodeInterface
     */
    public static function blankNode(string | Stringable | null $iri = null): BlankNodeInterface;

    /**
     * Creates a new RDF literal.
     * 
     * If the $datatype is null or empty, it must be set according to the
     * $value and $lang parameter values:
     * 
     * - if $lang is not empty, the $datatype must be set to
     *   `http://www.w3.org/1999/02/22-rdf-syntax-ns#langString`
     * - if $lang is empty or null, the $datatype depends on the PHP type of the
     *   $value parameter:
     *     * bool - `http://www.w3.org/2001/XMLSchema#boolean`
     *     * int - `http://www.w3.org/2001/XMLSchema#integer`
     *     * float - `http://www.w3.org/2001/XMLSchema#decimal`
     *     * string - `http://www.w3.org/2001/XMLSchema#string`
     *     * Stringable object - `http://www.w3.org/2001/XMLSchema#string` or
     *       any other more precise XSD datatype if the implementation is able 
     *       to derive it from the object class
     * 
     * The created literal must have valid combination of datatype and lang tag
     * (meaning the datatype is rdf:langString if and only if the literal has 
     * a lang tag). It's up to the implementation how to assure it. Both throwing
     * an exception and one of $lang/$datatype taking precedense over the other
     * are considered valid solutions. Of course the implementation behavior
     * should be documented.
     * 
     * See https://www.w3.org/TR/rdf11-concepts/#section-Graph-Literal for 
     * a reference.
     * 
     * @param int|float|string|bool|Stringable $value Literal's value.
     *   Only values which can be casted to a string are allowed so it's clear
     *   how to obtain literal's value lexical form (see the RDF specification
     *   mentioned above). The lexical forms of scalar values must be created 
     *   (returned by the getValue() method) in a way that back-casting them
     *   to the scalar type gives an equal value (probably the only tricky case
     *   here is boolean `false`).
     * @param string|Stringable|null $lang Literal's lang tag. If null or empty string, the literal
     *   is assumed not to have a lang tag (as an empty lang tag is not allowed in RDF).
     * @param string|Stringable|null $datatype Literal's datatype. If it's null, the datatype 
     *   must be assigned according to the $lang and $value parameter values.
     *   The detailed procedure is described above.
     */
    public static function literal(int | float | string | bool | Stringable $value,
                                   string | Stringable | null $lang = null,
                                   string | Stringable | null $datatype = null): LiteralInterface;

    /**
     * Returns an RDF default graph object.
     * 
     * @return DefaultGraphInterface
     */
    public static function defaultGraph(): DefaultGraphInterface;

    /**
     * Creates a new RDF quad.
     * 
     * @param TermInterface $subject
     * @param NamedNodeInterface $predicate
     * @param TermInterface $object
     * @param NamedNodeInterface|BlankNodeInterface|DefaultGraphInterface|null $graph
     */
    public static function quad(TermInterface $subject,
                                NamedNodeInterface $predicate,
                                TermInterface $object,
                                NamedNodeInterface | BlankNodeInterface | DefaultGraphInterface | null $graph = null): QuadInterface;
    
    /**
     * Creates a new RDF quadNoSubject.
     * 
     * @param NamedNodeInterface $predicate
     * @param TermInterface $object
     * @param NamedNodeInterface|BlankNodeInterface|DefaultGraphInterface|null $graph
     */
    public static function quadNoSubject(
                                NamedNodeInterface $predicate,
                                TermInterface $object,
                                NamedNodeInterface | BlankNodeInterface | DefaultGraphInterface | null $graph = null): QuadNoSubjectInterface;
}
