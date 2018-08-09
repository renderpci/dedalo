DELIMITER $$
CREATE DEFINER=`bilbomatica`@`localhost` PROCEDURE `SP_ActualizarMunicipio`(IN `par_codmun` INT, IN `par_denmun` TEXT CHARSET utf8, OUT `coderror` INT)
    NO SQL
    COMMENT 'Procedimiento almacenado para generar los municipios '
BEGIN

DECLARE ides varchar(8);
DECLARE idnuevo int;

DECLARE exit handler for sqlexception
BEGIN
	set coderror = 998;
	rollback;
END;

START TRANSACTION;

set coderror = 999;

IF EXISTS(SELECT * FROM `municipios` WHERE `codmun` = par_codmun) THEN
	/* Actualizar Municipio */
	SET ides = (SELECT `iddedalo` FROM municipios WHERE `codmun` = par_codmun);	
	UPDATE `municipios` SET `denmun`=par_denmun WHERE `codmun` = par_codmun;
	UPDATE `matrix_descriptors` SET `dato`=par_denmun WHERE `parent`=ides;
ELSE
	/* Insertar Nuevo Municipio */
	INSERT INTO `jer_es`(`parent`, `modelo`, `esmodelo`, `esdescriptor`, `visible`, `norden`, `usableIndex`, `traducible`, `relaciones`, `propiedades`) 
	VALUES ('es8827', 'es8872', 'no', 'si', 'si', 0, 'si', 'si', NULL, NULL);
	SET idnuevo = LAST_INSERT_ID();
	UPDATE `jer_es` SET `terminoID`= CONCAT('es',idnuevo) WHERE `id`=idnuevo;
	INSERT INTO `matrix_descriptors` (`parent`, `dato`, `tipo`, `lang`) VALUES (CONCAT('es',idnuevo),par_denmun, 'termino', 'lg-spa');
	INSERT INTO `municipios`(`codmun`, `denmun`, `iddedalo`) VALUES (par_codmun,par_denmun,CONCAT('es',idnuevo));
END IF;

set coderror = 0;

COMMIT;

END$$

DELIMITER ;
