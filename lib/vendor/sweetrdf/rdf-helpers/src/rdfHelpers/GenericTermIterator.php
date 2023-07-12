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
use rdfInterface\TermInterface as Term;

/**
 * Wrapper making almost anything (e.g. array, generator or a single 
 * QuadInterface object) a QuadIteratorInterface.
 *
 * @author zozlak
 */
class GenericTermIterator implements \rdfInterface\TermIteratorInterface {

    /**
     *
     * @var Iterator<Term>
     */
    private Iterator $iter;

    /**
     *
     * @param array<Term>|Iterator<Term>|IteratorAggregate<Term>|Term $iter
     */
    public function __construct(array | Iterator | IteratorAggregate | Term $iter) {
        if ($iter instanceof Term) {
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

    public function current(): Term {
        return $this->iter->current();
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
        return $this->iter->valid();
    }
}
