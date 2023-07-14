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
interface RdfNamespaceInterface {

    /**
     * Registers a given URL prefix.
     * 
     * @param string $iriPrefix
     * @param string|null $shortName Short name to register the IRI prefix under.
     *   If null or empty, the short name is automatically generated.
     * @return string The short name under which the URL prefix was registered.
     */
    public function add(string $iriPrefix, ?string $shortName = null): string;

    /**
     * Drops a given short name and IRI prefix associated with it.
     * 
     * @param string $shortName
     * @return void
     */
    public function remove(string $shortName): void;

    /**
     * Returns a IRI prefix for a given short name.
     * 
     * Throws an exception if a given short name isn't registered.
     * @param string $shortName
     * @return string
     * @throws \OutOfBoundsException
     */
    public function get(string $shortName): string;

    /**
     * Returns associative array of all registered namespaces with array keys
     * being namespace short names and array values containing URL prefixes.
     * 
     * @return array<string, string>
     */
    public function getAll(): array;

    /**
     * Expands a shortened IRI to a NamedNode.
     * 
     * Throws an error if the short name used in the shortened IRI is unknown or
     * when the $shortIri is not a shortened IRI.
     * @param string $shortIri
     * @return NamedNodeInterface
     * @throws \OutOfBoundsException
     * @throws \BadMethodCallException
     */
    public function expand(string $shortIri): NamedNodeInterface;

    /**
     * Shortens provided NamedNode IRI.
     * 
     * If corresponding IRI prefix is not registered yet, the behavior depends on
     * the $create parameter value. If it's true, a new short name is registered
     * automatically. Otherwise an expception is thrown.
     * @param NamedNodeInterface $Iri
     * @param bool $create Should a new short name be registered for the IRI
     *   prefix if there is no matching one?
     * @return string
     * @throws \OutOfBoundsException
     */
    public function shorten(NamedNodeInterface $Iri, bool $create): string;
}
