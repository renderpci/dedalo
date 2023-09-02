<?php

/*
 * To change this license header, choose License Headers in Project Properties.
 * To change this template file, choose Tools | Templates
 * and open the template in the editor.
 */

namespace rdfHelpers;

use Stringable;
use rdfInterface\TermInterface as iTerm;
use rdfInterface\DefaultGraphInterface as iDefaultGraph;

/**
 * Description of DefaultGraph
 *
 * @author zozlak
 */
class DefaultGraph implements iDefaultGraph {

    public function __construct() {
        
    }

    public function __toString(): string {
        return '__DefaultGraph__';
    }

    public function getValue(): int | float | string | bool | Stringable {
        return '';
    }

    public function equals(iTerm $term): bool {
        return $term instanceof iDefaultGraph;
    }
}
