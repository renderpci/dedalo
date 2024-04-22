<?php

/*
 * The MIT License
 *
 * Copyright 2024 zozlak.
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

use rdfInterface\BlankNodeInterface;
use rdfInterface\NamedNodeInterface;
use rdfInterface\DefaultGraphInterface;
use rdfInterface\QuadNoSubjectInterface;
use rdfInterface\TermInterface;

/**
 * Description of QuadNoSubject
 *
 * @author zozlak
 */
class QuadNoSubject implements QuadNoSubjectInterface {

    private NamedNodeInterface $predicate;
    private TermInterface $object;
    private NamedNodeInterface | BlankNodeInterface | DefaultGraphInterface $graph;

    public function __construct(NamedNodeInterface $predicate,
                                TermInterface $object,
                                NamedNodeInterface | BlankNodeInterface | DefaultGraphInterface | null $graph) {
        $this->predicate = $predicate;
        $this->object    = $object;
        $this->graph     = $graph ?? new DefaultGraph();
    }

    public function getPredicate(): NamedNodeInterface {
        return $this->predicate;
    }

    public function getObject(): TermInterface {
        return $this->object;
    }

    public function getGraph(): NamedNodeInterface | BlankNodeInterface | DefaultGraphInterface {
        return $this->graph;
    }
}
