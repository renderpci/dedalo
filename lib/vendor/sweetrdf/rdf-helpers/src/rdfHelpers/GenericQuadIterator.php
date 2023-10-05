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

use Iterator;
use IteratorAggregate;
use OutOfBoundsException;
use rdfInterface\QuadInterface as Quad;

/**
 * Wrapper making almost anything (e.g. array, generator or a single Quad object)
 * a QuadIterator.
 *
 * @author zozlak
 */
class GenericQuadIterator implements \rdfInterface\QuadIteratorInterface {

    /**
     *
     * @var Iterator<Quad>
     */
    private Iterator $iter;

    /**
     *
     * @param array<Quad>|Iterator<Quad>|IteratorAggregate<Quad>|Quad $iter
     */
    public function __construct(array | Iterator | IteratorAggregate | Quad $iter) {
        if ($iter instanceof Quad) {
            $iter = [$iter];
        }
        if (is_array($iter)) {
            $this->iter = new \ArrayIterator($iter);
        } elseif ($iter instanceof IteratorAggregate) {
            do {
                $iter = $iter->getIterator();
            } while ($iter instanceof IteratorAggregate);
            $this->iter = $iter;
        } else {
            $this->iter = $iter;
        }
    }

    public function current(): Quad | null {
        return $this->iter->valid() ? $this->iter->current() : null;
    }

    public function key(): mixed {
        return $this->iter->key();
    }

    public function next(): void {
        $this->iter->next();
    }

    public function rewind(): void {
        $this->iter->rewind();
    }

    public function valid(): bool {
        try {
            return $this->iter->valid();
        } catch (OutOfBoundsException) {
            return false;
        }
    }
}
