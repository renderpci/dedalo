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
 * Interface allowing to compare Quads.
 * 
 * Extracted as a separated interface because it's used extensively by the
 * Dataset class methods. One could argue the TermCompare interface would also 
 * do the job but for the Dataset it's worth to distinguish beetwen lack of 
 * match and match which makes no sense like comparing with anything which is 
 * not Quad. The QuadCompare interface introduces such a distinction.
 * 
 * @author zozlak
 */
interface QuadCompareInterface extends TermCompareInterface, \Stringable {

    public function getSubject(): TermCompareInterface | null;

    public function getPredicate(): TermCompareInterface | null;

    public function getObject(): TermCompareInterface | null;

    public function getGraph(): TermCompareInterface | null;
}
