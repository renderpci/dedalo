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
use rdfInterface\TermInterface;
use rdfInterface\TermCompareInterface;

/**
 * Wrapper making almost anything (e.g. array, generator or a single 
 * QuadInterface object) a QuadIteratorInterface.
 *
 * @author zozlak
 */
class GenericTermIterator implements \rdfInterface\TermIteratorInterface {

    /**
     *
     * @var Iterator<TermInterface>
     */
    private Iterator $iter;
    private GenericTermIterator $skip;
    private GenericTermIterator $intersect;

    /**
     *
     * @param array<TermInterface>|Iterator<TermInterface>|IteratorAggregate<TermInterface>|TermInterface $iter
     */
    public function __construct(array | Iterator | IteratorAggregate | TermInterface $iter) {
        if ($iter instanceof TermInterface) {
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

    public function current(): TermInterface | null {
        return $this->iter->valid() ? $this->iter->current() : null;
    }

    public function key(): mixed {
        return $this->iter->key();
    }

    public function next(): void {
        do {
            $this->iter->next();
        } while ($this->iter->valid() && !$this->valid2());
    }

    public function rewind(): void {
        $this->iter->rewind();
        if ($this->iter->valid() && !$this->valid2()) {
            $this->next();
        }
    }

    public function valid(): bool {
        return $this->iter->valid();
    }

    private function valid2(): bool {
        return (!isset($this->skip) || !$this->skip->contains($this->iter->current())) && (!isset($this->intersect) || $this->intersect->contains($this->iter->current()));
    }

    public function contains(TermCompareInterface $term): bool {
        foreach ($this as $i) {
            if ($term->equals($this->current())) {
                return true;
            }
        }
        return false;
    }

    /**
     * 
     * @return array<string>
     */
    public function getValues(): array {
        return array_map(fn($x) => $x->getValue(), iterator_to_array($this->iter));
    }

    /**
     * 
     * @param array<TermInterface>|Iterator<TermInterface>|IteratorAggregate<TermInterface>|TermInterface $terms
     * @return self
     */
    public function skip(array | Iterator | IteratorAggregate | TermInterface $terms): self {
        $iter       = new GenericTermIterator($this->iter);
        $iter->skip = new GenericTermIterator($terms);
        if (isset($this->intersect)) {
            $iter->intersect = $this->intersect;
        }
        return $iter;
    }

    /**
     * 
     * @param array<TermInterface>|Iterator<TermInterface>|IteratorAggregate<TermInterface>|TermInterface $terms
     * @return self
     */
    public function intersect(array | Iterator | IteratorAggregate | TermInterface $terms): self {
        $iter            = new GenericTermIterator($this->iter);
        $iter->intersect = new GenericTermIterator($terms);
        if (isset($this->skip)) {
            $iter->skip = $this->skip;
        }
        return $iter;
    }
}
