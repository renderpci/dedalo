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

use BadMethodCallException;
use Stringable;
use zozlak\RdfConstants as RDF;

/**
 *
 * @author zozlak
 */
interface LiteralInterface extends TermInterface, TermCompareInterface {

    public const CAST_LEXICAL_FORM = 1;
    public const CAST_DATATYPE     = 2;

    /**
     * Returns literal's value.
     * 
     * Separate cast options are needed as the RDF specification defines a few
     * kinds of literal values. See 
     * https://www.w3.org/TR/rdf11-concepts/#section-Graph-Literal for details.
     * 
     * @param int $cast Determines the kind of value being returned:
     *   * \rdfInterface\CAST_LEXICAL_FORM - a string with literal's lexical form.
     *     All implementations must handle this kind of cast.
     *   * \rdfInterface\CAST_DATATYPE - value mapped to the datatype's domain.
     *     Implementations may handle this kind of cast. It's up to the 
     *     implementation which datatypes are supported and how the mapping is
     *     being done.
     *   Implementations may provide additional types of cast.
     * @return mixed
     */
    public function getValue(int $cast = self::CAST_LEXICAL_FORM): mixed;

    /**
     * Returns literal's language tag.
     * 
     * If a literal lacks a language tag, null should be returned. It means this
     * method can't return an empty string.
     * @return string|null
     */
    public function getLang(): ?string;

    /**
     * Returns literal's datatype.
     * 
     * The method must return the actual datatype even if it's implicit. It
     * means `http://www.w3.org/1999/02/22-rdf-syntax-ns#langString` must be
     * returned for literals with a lang tag and 
     * `http://www.w3.org/2001/XMLSchema#string` must be returned for literals
     * without lang tag and without datatype specified explicitely.
     * 
     * @return string
     */
    public function getDatatype(): string;

    /**
     * Returns a new literal being a copy of this one with a given value.
     * 
     * If the $value type is int/float/bool, the lang tag of the returned literal
     * is set to null and the datatype is set to a corresponding XSD type (see
     * the constructor documentation). If the $value is string/Stringable, the
     * lang tag and datatype are preserved.
     * 
     * @param int|float|string|bool|Stringable $value
     * @return LiteralInterface
     */
    public function withValue(int | float | string | bool | Stringable $value): LiteralInterface;

    /**
     * Returns a new literal being a copy of this one with a lang tag set to 
     * a given value.
     * 
     * Be aware setting a lang tag on a literal without one as well as dropping
     * a lang tag from a literal having it implicitly changes literal's datatype.
     * Setting a lang on a literal without one enforces setting its datatype to
     * rdf:langString while dropping a lang from a literal having it changes
     * literal's datatype to xsd:string (see 
     * https://www.w3.org/TR/rdf11-concepts/#section-Graph-Literal for details).
     * 
     * @param string|null $lang 
     * @return LiteralInterface
     */
    public function withLang(?string $lang): LiteralInterface;

    /**
     * Returns a new literal being a copy with this one with datatype set to
     * a given value.
     * 
     * Be aware it's impossibe to set the datatype to rdf::langString that way
     * as it would require setting a non-empty lang tag. The withLang()
     * method should be used in such a case as it changes the datatype implicitly.
     * 
     * As this method by definition doesn't allow to set a datatype allowing
     * a literal to have a lang tag, it must set returned literal's lang tag
     * to null.
     * 
     * This method must throw a \BadMethodCallException when called with a wrong
     * datatype (`http://www.w3.org/1999/02/22-rdf-syntax-ns#langString` or an
     * empty one).
     * 
     * @param string $datatype
     * @return LiteralInterface
     * @see withLang()
     * @throws BadMethodCallException
     */
    public function withDatatype(string $datatype): LiteralInterface;
}
