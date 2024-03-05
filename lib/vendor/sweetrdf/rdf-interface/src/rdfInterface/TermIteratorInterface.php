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

use Iterator;
use IteratorAggregate;

/**
 *
 * @author zozlak
 * @extends \Iterator<int, TermInterface>
 */
interface TermIteratorInterface extends Iterator {

    public function current(): TermInterface | null;

    public function contains(TermCompareInterface $term): bool;

    /**
     * 
     * @param array<TermInterface>|Iterator<TermInterface>|IteratorAggregate<TermInterface>|TermInterface $terms
     * @return self
     */
    public function skip(array | Iterator | IteratorAggregate | TermInterface $terms): self;

    /**
     * 
     * @param array<TermInterface>|Iterator<TermInterface>|IteratorAggregate<TermInterface>|TermInterface $terms
     * @return self
     */
    public function intersect(array | Iterator | IteratorAggregate | TermInterface $terms): self;

    /**
     * Extracts values of all terms and returns them as an array.
     * 
     * @return array<string>
     */
    public function getValues(): array;
}
