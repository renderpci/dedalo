DELIMITER $$
CREATE PROCEDURE `SP_tmp1`()
    NO SQL
    COMMENT 'Procedimiento almacenado para generar las Entidades Singulares'
BEGIN

/*CREAR NUEVA LISTA DE VALORES */
DECLARE idnuevo int;
DECLARE idres varchar(8);
DECLARE idvalorlst varchar(8);
DECLARE idvalor varchar(8);
DECLARE idfiltrolst varchar(8);
DECLARE idborrarlst varchar(8);
DECLARE idnuevolst varchar(8);
DECLARE idregistroslst varchar(8);

/* CREAR JERARQUÍA Y PONERLA EN EL MENÚ PRIVADAS posición 20*/
INSERT INTO `jer_dd`(`terminoID`, `parent`, `modelo`, `esmodelo`, `esdescriptor`, `visible`, `norden`, `usableIndex`, `traducible`, `relaciones`, `propiedades`) VALUES ('ddxxxx','dd137','dd6','no','si','si',20,'si','si','[{"dd626":"dd963"}]','');
SET idnuevo = LAST_INSERT_ID();
SET idres = CONCAT('dd',idnuevo);
UPDATE `jer_dd` SET `terminoID` = idres WHERE `id` = idnuevo;

INSERT INTO `matrix_descriptors_dd`(`parent`, `dato`, `tipo`, `lang`) VALUES (idres, 'Tipología Ficha PCI', 'termino', 'lg-spa');

/* POR AHORA NO AÑADIMOS NINGÚN ELEMENTO */
/* AÑADIR UN ELEMENTO A LA LISTA */
/* INSERT INTO `matrix_dd`(`parent`, `dato`, `tipo`, `lang`) VALUES (0,'{"section_id":1,"created_by_userID":"1","created_date":"2015-03-09 09:54:52","ref_name":"Tipología Ficha PCI"}',idres,'lg-nolan');*/
/* AÑADIR EL CONTANDOR DE ELEMENTOS A LA LISTA */
/*INSERT INTO `matrix_counter_dd`(`parent`, `dato`, `tipo`, `lang`, `ref`) VALUES (0,1,idres,'lg-nolan','Tipología Ficha PCI');*/


/* CREAR EL VALOR DE LA LISTA */
INSERT INTO `jer_dd`(`terminoID`, `parent`, `modelo`, `esmodelo`, `esdescriptor`, `visible`, `norden`, `usableIndex`, `traducible`, `relaciones`, `propiedades`) 
			 VALUES ('ddxxxx',idres,'dd8','no','si','si',1,'si','si',NULL,NULL);
SET idnuevo = LAST_INSERT_ID();
SET idvalorlst = CONCAT('dd',idnuevo);
UPDATE `jer_dd` SET `terminoID` = idvalorlst WHERE `id` = idnuevo;

INSERT INTO `matrix_descriptors_dd`(`parent`, `dato`, `tipo`, `lang`) VALUES (idvalorlst,'Valor de la lista','termino','lg-spa');

/* VALOR */
INSERT INTO `jer_dd`(`terminoID`, `parent`, `modelo`, `esmodelo`, `esdescriptor`, `visible`, `norden`, `usableIndex`, `traducible`, `relaciones`, `propiedades`) 
			 VALUES ('ddxxxx',idvalorlst,'dd9','no','si','si',2,'si','si',NULL,NULL);
SET idnuevo = LAST_INSERT_ID();
SET idvalor = CONCAT('dd',idnuevo);
UPDATE `jer_dd` SET `terminoID` = idvalor WHERE `id` = idnuevo;

INSERT INTO `matrix_descriptors_dd`(`parent`, `dato`, `tipo`, `lang`) VALUES (idvalor,'Tipología Ficha PCI','termino','lg-spa');

/* CREAR EL FILTRO DE LA LISTA */
INSERT INTO `jer_dd`(`terminoID`, `parent`, `modelo`, `esmodelo`, `esdescriptor`, `visible`, `norden`, `usableIndex`, `traducible`, `relaciones`, `propiedades`) 
			 VALUES ('ddxxxx',idres,'dd247','no','si','si',2,'si','si',NULL,NULL);
SET idnuevo = LAST_INSERT_ID();
SET idfiltrolst = CONCAT('dd',idnuevo);
UPDATE `jer_dd` SET `terminoID` = idfiltrolst WHERE `id` = idnuevo;

INSERT INTO `matrix_descriptors_dd`(`parent`, `dato`, `tipo`, `lang`) VALUES (idfiltrolst,'Filtro','termino','lg-spa');

/* BORRAR DE LA LISTA */
INSERT INTO `jer_dd`(`terminoID`, `parent`, `modelo`, `esmodelo`, `esdescriptor`, `visible`, `norden`, `usableIndex`, `traducible`, `relaciones`, `propiedades`) 
			 VALUES ('ddxxxx',idres,'dd183','no','si','si',3,'si','si',NULL,NULL);
SET idnuevo = LAST_INSERT_ID();
SET idborrarlst = CONCAT('dd',idnuevo);
UPDATE `jer_dd` SET `terminoID` = idborrarlst WHERE `id` = idnuevo;

INSERT INTO `matrix_descriptors_dd`(`parent`, `dato`, `tipo`, `lang`) VALUES (idborrarlst,'Borrar Tipologia Ficha PCI','termino','lg-spa');

/* NUEVO ELEMENTO EN LA LISTA */
INSERT INTO `jer_dd`(`terminoID`, `parent`, `modelo`, `esmodelo`, `esdescriptor`, `visible`, `norden`, `usableIndex`, `traducible`, `relaciones`, `propiedades`) 
			 VALUES ('ddxxxx',idres,'dd177','no','si','si',4,'si','si',NULL,NULL);
SET idnuevo = LAST_INSERT_ID();
SET idnuevolst = CONCAT('dd',idnuevo);
UPDATE `jer_dd` SET `terminoID` = idnuevolst WHERE `id` = idnuevo;

INSERT INTO `matrix_descriptors_dd`(`parent`, `dato`, `tipo`, `lang`) VALUES (idnuevolst,'Nueva Tipologia Ficha PCI','termino','lg-spa');

/* CREAR LISTADO DE REGISTRO DE LA LISTA */
INSERT INTO `jer_dd`(`terminoID`, `parent`, `modelo`, `esmodelo`, `esdescriptor`, `visible`, `norden`, `usableIndex`, `traducible`, `relaciones`, `propiedades`) 
			 VALUES ('ddxxxx',idres,'dd91','no','si','si',5,'si','si', CONCAT('[{"dd9":"',idvalor,'"},{"dd195":"dd196"}]'),NULL);
SET idnuevo = LAST_INSERT_ID();
SET idregistroslst = CONCAT('dd',idnuevo);
UPDATE `jer_dd` SET `terminoID` = idregistroslst WHERE `id` = idnuevo;

INSERT INTO `matrix_descriptors_dd`(`parent`, `dato`, `tipo`, `lang`) VALUES (idregistroslst,'Listado de registos','termino','lg-spa');

/* CAMBIAR EN LA FICHA PCI EL CONTROL TIPOLOGIO A COMBO */
UPDATE `jer_dd` SET `modelo`='dd11', `traducible`='no', `relaciones`=CONCAT('[{"dd9":"',idvalor,'"}]') WHERE `terminoID`='dd651';


/* INCLUIR LA LISTA EN SEGURIDAD */
/* ESTA PARTE POR AHORA HAY QUE HACERLA MANUAL PORQUE LOS TERMINOS HAY QUE INCLUIRLOS EN UNA POSICIÓN DETERMINADA */
/* se han incluido aquí "dd1539":2 */
/*UPDATE `matrix` SET `dato` = CONCAT('{"dd242-admin":"2","dd242":"2","dd355-admin":"2","dd355":"2","dd323-admin":"2","dd323":"2","dd335-admin":"2","dd335":"2","dd14-admin":"2","dd14":"2","dd324-admin":"2","dd324":"2","dd263-admin":"2","dd263":"2","dd1137-admin":"2","dd1137":"2","dd1167-admin":"2","dd1167":"2","dd16-admin":"2","dd16":"2","dd21-admin":"2","dd21":"2","dd328-admin":"2","dd328":"2","dd1127-admin":"2","dd1127":"2","dd801-admin":"2","dd801":"2","dd849-admin":"2","dd849":"2","dd325-admin":"2","dd325":"2","dd1326-admin":"2","dd1326":"2","dd1332-admin":"2","dd1332":"2","dd1329-admin":"2","dd1329":"2","dd1325-admin":"2","dd1325":"2","dd326-admin":"2","dd326":"2","dd329-admin":"2","dd329":"2","dd29-admin":"2","dd29":"2","dd20-admin":"2","dd20":"2","dd30-admin":"2","dd30":"2","dd207":"2","dd128":"2","dd234":"2","dd153":"2","dd68":"2","dd137-admin":"2","dd137":"2","dd64-admin":"2","dd64":"2","dd810-admin":"2","dd810":"2","dd159-admin":"2","dd159":"2","dd208-admin":"2","dd208":"2","dd833-admin":"2","dd833":"2","dd861-admin":"2","dd861":"2","dd839-admin":"2","dd839":"2","dd889-admin":"2","dd889":"2","dd911-admin":"2","dd911":"2","dd957-admin":"2","dd957":"2","dd976-admin":"2","dd976":"2","dd875-admin":"2","dd875":"2","dd1313-admin":"2","dd1313":"2","dd1117-admin":"2","dd1117":"2","dd567-admin":"2","dd567":"2","dd985-admin":"2","dd985":"2","',idres,'-admin":"2","',idres,'":"2","dd1308-admin":"2","dd1308":"2","dd1318-admin":"2","dd1318":"2","dd996-admin":"2","dd996":"2","dd1132-admin":"2","dd1132":"2","dd942-admin":"2","dd942":"2","dd922-admin":"2","dd922":"2","dd898-admin":"2","dd898":"2","dd882-admin":"2","dd882":"2","dd542":"2"}') WHERE `matrix`.`id` = 23 and `matrix`.`tipo` = 'dd240';*/
UPDATE `matrix` SET `dato` = REPLACE(`dato`,'"dd985":"2",',CONCAT('"dd985":"2",','"',idres,'-admin":"2",','"',idres,'":"2",')) WHERE `matrix`.`id` = 23 and `matrix`.`tipo` = 'dd240';

/* se han incluido aquí "dd1540":2,"dd1551":2,"dd1541":2,"dd1542":2,"dd1543":2,"dd1544":2 además de "dd1539":2 */
/*UPDATE `matrix` SET `dato` = '{"dd242":2,"dd646":2,"dd848":2,"dd640":2,"dd376":2,"dd641":2,"dd642":2,"dd643":2,"dd377":2,"dd647":2,"dd644":2,"dd645":2,"dd648":2,"dd649":2,"dd650":2,"dd651":2,"dd652":2,"dd655":2,"dd656":2,"dd657":2,"dd659":2,"dd658":2,"dd660":2,"dd661":2,"dd662":2,"dd663":2,"dd664":2,"dd665":2,"dd666":2,"dd625":2,"dd667":2,"dd668":2,"dd669":2,"dd670":2,"dd604":2,"dd681":2,"dd682":2,"dd683":2,"dd684":2,"dd686":2,"dd685":2,"dd687":2,"dd688":2,"dd689":2,"dd690":2,"dd691":2,"dd1158":2,"dd1159":2,"dd1160":2,"dd1161":2,"dd1162":2,"dd1163":2,"dd1164":2,"dd1165":2,"dd1166":2,"dd1170":2,"dd1171":2,"dd1172":2,"dd1173":2,"dd1174":2,"dd1175":2,"dd1176":2,"dd1177":2,"dd1178":2,"dd1179":2,"dd1180":2,"dd1181":2,"dd602":2,"dd606":2,"dd607":2,"dd612":2,"dd795":2,"dd614":2,"dd621":2,"dd622":2,"dd631":2,"dd632":2,"dd637":2,"dd653":2,"dd654":2,"dd671":2,"dd672":2,"dd673":2,"dd720":2,"dd721":2,"dd723":2,"dd624":2,"dd623":2,"dd378":2,"dd379":2,"dd1096":2,"dd603":2,"dd595":2,"dd805":2,"dd809":2,"dd596":2,"dd597":2,"dd598":2,"dd599":2,"dd752":2,"dd600":2,"dd674":2,"dd675":2,"dd676":2,"dd677":2,"dd678":2,"dd679":2,"dd680":2,"dd611":2,"dd616":2,"dd615":2,"dd609":2,"dd1102":2,"dd1100":2,"dd1101":2,"dd1103":2,"dd355":2,"dd323":2,"dd335":2,"dd14":2,"dd449":2,"dd72":2,"dd77":2,"dd919":2,"dd907":2,"dd1066":2,"dd921":2,"dd859":2,"dd869":2,"dd860":2,"dd867":2,"dd920":2,"dd956":2,"dd871":2,"dd362":2,"dd406":2,"dd917":2,"dd868":2,"dd87":2,"dd286":2,"dd870":2,"dd872":2,"dd520":2,"dd174":2,"dd578":2,"dd277":2,"dd281":2,"dd282":2,"dd955":2,"dd941":2,"dd327":2,"dd285":2,"dd948":2,"dd949":2,"dd367":2,"dd950":2,"dd450":2,"dd951":2,"dd952":2,"dd953":2,"dd954":2,"dd280":2,"dd283":2,"dd558":2,"dd559":2,"dd577":2,"dd522":2,"dd525":2,"dd527":2,"dd528":2,"dd531":2,"dd532":2,"dd539":2,"dd541":2,"dd553":2,"dd560":2,"dd563":2,"dd773":2,"dd342":2,"dd845":2,"dd1280":2,"dd1115":2,"dd345":2,"dd967":2,"dd1116":2,"dd1131":2,"dd968":2,"dd847":2,"dd364":2,"dd120":2,"dd750":2,"dd751":2,"dd122":2,"dd368":2,"dd1110":2,"dd851":2,"dd970":2,"dd732":2,"dd343":2,"dd331":2,"dd537":2,"dd565":2,"dd118":2,"dd119":2,"dd121":2,"dd822":2,"dd140":2,"dd139":2,"dd931":2,"dd896":2,"dd897":2,"dd903":2,"dd25":2,"dd933":2,"dd934":2,"dd935":2,"dd936":2,"dd202":2,"dd1014":2,"dd971":2,"dd972":2,"dd974":2,"dd973":2,"dd969":2,"dd975":2,"dd984":2,"dd992":2,"dd937":2,"dd938":2,"dd939":2,"dd940":2,"dd993":2,"dd1003":2,"dd1004":2,"dd1005":2,"dd1006":2,"dd994":2,"dd1007":2,"dd1008":2,"dd1009":2,"dd1010":2,"dd1011":2,"dd1012":2,"dd1013":2,"dd1076":2,"dd272":2,"dd32":2,"dd86":2,"dd109":2,"dd82":2,"dd49":2,"dd39":2,"dd85":2,"dd88":2,"dd99":2,"dd324":2,"dd263":2,"dd1137":2,"dd1167":2,"dd16":2,"dd21":2,"dd328":2,"dd1127":2,"dd801":2,"dd849":2,"dd325":2,"dd1326":2,"dd1332":2,"dd1329":2,"dd1325":2,"dd326":2,"dd329":2,"dd29":2,"dd20":2,"dd30":2,"dd207":2,"dd452":2,"dd129":2,"dd131":2,"dd132":2,"dd133":2,"dd134":2,"dd135":2,"dd136":2,"dd244":2,"dd240":2,"dd363":2,"dd170":2,"dd361":2,"dd148":2,"dd782":2,"dd784":2,"dd459":2,"dd458":2,"dd254":2,"dd179":2,"dd236":2,"dd237":2,"dd249":2,"dd774":2,"dd238":2,"dd235":2,"dd154":2,"dd155":2,"dd40":2,"dd156":2,"dd157":2,"dd53":2,"dd78":2,"dd54":2,"dd126":2,"dd51":2,"dd483":2,"dd243":2,"dd465":2,"dd169":2,"dd265":2,"dd266":2,"dd267":2,"dd33":2,"dd180":2,"dd190":2,"dd62":2,"dd410":2,"dd811":2,"dd812":2,"dd815":2,"dd467":2,"dd161":2,"dd409":2,"dd186":2,"dd182":2,"dd209":2,"dd210":2,"dd211":2,"dd213":2,"dd214":2,"dd834":2,"dd835":2,"dd836":2,"dd838":2,"dd862":2,"dd863":2,"dd864":2,"dd866":2,"dd840":2,"dd841":2,"dd842":2,"dd844":2,"dd890":2,"dd891":2,"dd892":2,"dd894":2,"dd895":2,"dd912":2,"dd914":2,"dd913":2,"dd916":2,"dd958":2,"dd959":2,"dd961":2,"dd966":2,"dd982":2,"dd977":2,"dd978":2,"dd980":2,"dd981":2,"dd983":2,"dd879":2,"dd876":2,"dd880":2,"dd995":2,"dd877":2,"dd964":2,"dd965":2,"dd1314":2,"dd1315":2,"dd1316":2,"dd1118":2,"dd1119":2,"dd1121":2,"dd1122":2,"dd1123":2,"dd568":2,"dd570":2,"dd569":2,"dd573":2,"dd574":2,"dd986":2,"dd987":2,"dd989":2,"dd990":2,"dd991":2,"dd1540":2,"dd1551":2,"dd1541":2,"dd1542":2,"dd1543":2,"dd1544":2,"dd1309":2,"dd1311":2,"dd1310":2,"dd1319":2,"dd1320":2,"dd1321":2,"dd997":2,"dd998":2,"dd1000":2,"dd1001":2,"dd1002":2,"dd1133":2,"dd1135":2,"dd1134":2,"dd1196":2,"dd943":2,"dd944":2,"dd946":2,"dd947":2,"dd923":2,"dd924":2,"dd926":2,"dd927":2,"dd928":2,"dd899":2,"dd900":2,"dd902":2,"dd883":2,"dd884":2,"dd885":2,"dd887":2,"dd888":2,"dd548":2,"dd544":2,"dd543":2,"dd545":2,"dd546":2,"dd547":2,"dd551":2,"dd550":2,"dd128":2,"dd234":2,"dd153":2,"dd68":2,"dd137":2,"dd64":2,"dd810":2,"dd159":2,"dd208":2,"dd833":2,"dd861":2,"dd839":2,"dd889":2,"dd911":2,"dd957":2,"dd976":2,"dd875":2,"dd1313":2,"dd1117":2,"dd567":2,"dd985":2,"dd1539":2,"dd1308":2,"dd1318":2,"dd996":2,"dd1132":2,"dd942":2,"dd922":2,"dd898":2,"dd882":2,"dd542":2}' WHERE `matrix`.`id` = 21 and `matrix`.`tipo` = 'dd148';*/
UPDATE `matrix` SET `dato` = REPLACE(`dato`,'"dd991":2,',CONCAT('"dd991":2,','"',idvalorlst,'":2,','"',idvalor,'":2,','"',idfiltrolst,'":2,','"',idborrarlst,'":2,','"',idnuevolst,'":2,')) WHERE `matrix`.`id` = 21 and `matrix`.`tipo` = 'dd148';
UPDATE `matrix` SET `dato` = REPLACE(`dato`,'"dd985":2,',CONCAT('"dd985":2,','"',idres,'":2,')) WHERE `matrix`.`id` = 21 and `matrix`.`tipo` = 'dd148';

END$$

DELIMITER ;
call SP_tmp1();
drop procedure if exists SP_tmp1;
