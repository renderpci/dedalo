DELIMITER $$
CREATE DEFINER=`bilbomatica`@`localhost` PROCEDURE `SP_UltimoRegistro`(OUT `result` TEXT CHARSET utf8)
    NO SQL
BEGIN

	DECLARE dat text;
	DECLARE registro int;

	SET dat = (SELECT `dato` FROM `matrix` WHERE `tipo` = 'dd376' and `dato` like '"31%' ORDER BY `dato` DESC LIMIT 1);

	IF dat = null THEN
		set dat = '31-000000';
	END IF;

	SET dat = REPLACE(dat,'"','');

	SET dat = REPLACE(dat,'31-','');

	SET registro = CAST(dat as SIGNED);

	SET registro = registro + 1;

	SET result = CONCAT('"31-',REPEAT('0',6-LENGTH(registro)), CAST(registro as CHAR),'"');

END$$

DELIMITER ;