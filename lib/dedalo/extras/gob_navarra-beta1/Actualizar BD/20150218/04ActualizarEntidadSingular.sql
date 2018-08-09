DELIMITER $$
CREATE PROCEDURE `SP_ActualizarEntidadSingular`(IN `par_codentsing` INT, IN `par_codmun` INT, IN `par_codentine` INT, IN `par_denomentsing` TEXT, OUT `coderror` INT)
    NO SQL
    COMMENT 'Procedimiento almacenado para generar las Entidades Singulares'
BEGIN

DECLARE ides varchar(8);
DECLARE idnuevo int;
DECLARE idesmunicipio varchar(8);

DECLARE exit handler for sqlexception
BEGIN
	set coderror = 998;
	rollback;
END;

START TRANSACTION;

set coderror = 999;

IF EXISTS(SELECT * FROM `entidadessingulares` WHERE `codentsing` = par_codentsing) THEN
	/* Actualizar Entidad Singular */
	SET ides = (SELECT `iddedalo` FROM entidadessingulares WHERE `codentsing` = par_codentsing);	
	UPDATE `entidadessingulares` SET `denomentsing`=par_denomentsing WHERE `codentsing` = par_codentsing;
	UPDATE `matrix_descriptors` SET `dato`=par_denomentsing WHERE `parent`=ides;
ELSE
	/* Insertar Nueva Entidad Singular */
	SET idesmunicipio = (SELECT `iddedalo` FROM municipios WHERE `codmun` = par_codmun);
	INSERT INTO `jer_es`(`parent`, `modelo`, `esmodelo`, `esdescriptor`, `visible`, `norden`, `usableIndex`, `traducible`, `relaciones`, `propiedades`) 
	VALUES (idesmunicipio, 'es8905', 'no', 'si', 'si', 0, 'si', 'si', NULL, NULL);
	SET idnuevo = LAST_INSERT_ID();
	UPDATE `jer_es` SET `terminoID`= CONCAT('es',idnuevo) WHERE `id`=idnuevo;
	INSERT INTO `matrix_descriptors` (`parent`, `dato`, `tipo`, `lang`) VALUES (CONCAT('es',idnuevo), par_denomentsing, 'termino', 'lg-spa');	
	INSERT INTO `entidadessingulares`(`codentsing`, `codmun`, `codentine`, `denomentsing`, `iddedalo`) VALUES (par_codentsing,par_codmun,par_codentine,par_denomentsing,CONCAT('es',idnuevo));
END IF;

set coderror = 0;

COMMIT;

END$$

DELIMITER ;