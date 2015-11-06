

/* incluirmos acceso a usuarios nuevos para usuarios*/
UPDATE `matrix` SET `dato` = REPLACE(`dato`,'"dd128":"2"','"dd128-admin":"2","dd128":"2"') WHERE `matrix`.`id` = 23 and `matrix`.`tipo` = 'dd240';
/* incluirmos acceso a usuarios nuevos para perfiles*/
UPDATE `matrix` SET `dato` = REPLACE(`dato`,'"dd234":"2"','"dd234-admin":"2","dd234":"2"') WHERE `matrix`.`id` = 23 and `matrix`.`tipo` = 'dd240';
/* incluirmos acceso a usuarios nuevos para proyectos*/
UPDATE `matrix` SET `dato` = REPLACE(`dato`,'"dd153":"2"','"dd153-admin":"2","dd153":"2"') WHERE `matrix`.`id` = 23 and `matrix`.`tipo` = 'dd240';
/* incluirmos acceso a usuarios nuevos para actividad*/
UPDATE `matrix` SET `dato` = REPLACE(`dato`,'"dd542":"2"','"dd542-admin":"2","dd542":"2"') WHERE `matrix`.`id` = 23 and `matrix`.`tipo` = 'dd240';




