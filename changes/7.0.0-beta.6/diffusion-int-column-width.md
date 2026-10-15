---
title: Publishing no longer fails creating a MariaDB integer column sized by `varchar`.
type: fixed
audience: admin
date: 2026-10-06
---
A `field_int` diffusion node whose properties carried `varchar` (for example
`"varchar": 1024`) was created as `INT(1024)`, which MariaDB refuses, and the
whole publication run stopped with "An unexpected error stopped the diffusion
run". The two sizing properties are separate again: `varchar` sizes text
columns only and `length` sizes integer columns only. The integer column is
now created as `INT(8)` unless `length` says otherwise.
