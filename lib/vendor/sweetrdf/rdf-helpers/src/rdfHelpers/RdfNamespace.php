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

use OutOfBoundsException;
use BadMethodCallException;
use rdfInterface\NamedNodeInterface as NamedNode;

/**
 * Provides an implementation of rdfInterface\RdfNamespace.
 * 
 * The class is abstract as it depends on the rdfInterface\NamedNode
 * implementation which is not provided in this library.
 * 
 * It can be reused by deriving a class from it and providing an implementation
 * of the getNamedNode() method (which should be just a one-liner).
 *
 * @author zozlak
 */
abstract class RdfNamespace implements \rdfInterface\RdfNamespaceInterface {

    abstract protected function getNamedNode(string $iri): NamedNode;

    protected int $n = 0;

    /**
     *
     * @var array<string, string>
     */
    protected array $namespaces = [];

    public function add(string $iriPrefix, ?string $shortName = null): string {
        $key = array_search($iriPrefix, $this->namespaces);
        if ($key !== false) {
            if (!empty($shortName)) {
                throw new RdfHelpersException("$iriPrefix already registered as $key");
            } else {
                return $key;
            }
        }
        if (empty($shortName)) {
            $shortName = 'n' . $this->n;
            $this->n++;
        }
        $this->namespaces[$shortName] = $iriPrefix;
        return $shortName;
    }

    public function remove(string $shortName): void {
        unset($this->namespaces[$shortName]);
    }

    public function get(string $shortName): string {
        if (isset($this->namespaces[$shortName])) {
            return $this->namespaces[$shortName];
        }
        throw new OutOfBoundsException('Unknown prefix');
    }

    public function getAll(): array {
        return $this->namespaces;
    }

    public function expand(string $shortIri): NamedNode {
        $pos = strpos($shortIri, ':');
        if ($pos === false) {
            throw new BadMethodCallException("parameter is not a shortened IRI");
        }
        $alias = substr($shortIri, 0, $pos);
        if (isset($this->namespaces[$alias])) {
            return $this->getNamedNode($this->namespaces[$alias] . substr($shortIri, $pos + 1));
        }
        throw new OutOfBoundsException('Unknown alias');
    }

    public function shorten(NamedNode $iri, bool $create): string {
        $iri = (string) $iri->getValue();
        $n   = strlen($iri);
        $p   = max(strrpos($iri, '/'), strrpos($iri, '#'));
        if ($p + 1 >= $n) {
            $iritmp = substr($iri, 0, $n - 1);
            $p      = max(strrpos($iritmp, '/'), strrpos($iritmp, '#'));
        }
        $prefix    = substr($iri, 0, $p + 1);
        $shortName = array_search($prefix, $this->namespaces);
        if ($shortName === false) {
            if ($create) {
                $shortName                    = "n" . $this->n;
                $this->n++;
                $this->namespaces[$shortName] = $prefix;
            } else {
                throw new OutOfBoundsException("Iri doesn't match any registered prefix");
            }
        }
        return $shortName . ':' . substr($iri, $p + 1);
    }
}
