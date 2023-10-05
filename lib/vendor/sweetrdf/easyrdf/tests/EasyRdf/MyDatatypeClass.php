<?php

namespace Tests\EasyRdf;

/*
 * This file is licensed under the terms of BSD-3 license and
 * is part of the EasyRdf package.
 *
 * (c) Konrad Abicht <hi@inspirito.de>
 * (c) Nicholas J Humfrey
 *
 * For the full copyright and license information, please view the LICENSE.md
 * file that was distributed with this source code.
 */

use EasyRdf\Literal;

class MyDatatypeClass extends Literal
{
    public function __toString()
    {
        return '!'.(string) $this->value.'!';
    }
}
