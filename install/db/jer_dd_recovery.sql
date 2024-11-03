
DROP TABLE IF EXISTS "jer_dd_recovery";
CREATE TABLE "public"."jer_dd_recovery" (
    "id" integer,
    "terminoID" character varying(32),
    "parent" character varying(32),
    "modelo" character varying(8),
    "esmodelo" sino,
    "esdescriptor" sino,
    "visible" sino,
    "norden" numeric(4,0),
    "tld" character varying(32),
    "traducible" sino,
    "relaciones" text,
    "propiedades" text,
    "properties" jsonb,
    "term" jsonb
) WITH (oids = false);

TRUNCATE "jer_dd_recovery";
INSERT INTO "jer_dd_recovery" ("id", "terminoID", "parent", "modelo", "esmodelo", "esdescriptor", "visible", "norden", "tld", "traducible", "relaciones", "propiedades", "properties", "term") VALUES
(15361554,	'dd1',	'dd0',	'dd117',	'no',	'si',	'si',	1,	'dd',	'si',	'',	NULL,	'{"version": "6.2.8", "version_inf": "Specifies the minimum software version with which the Ontology is compatible."}',	'{"lg-cat": "Dédalo", "lg-deu": "Dédalo", "lg-eng": "Dédalo", "lg-eus": "Dédalo", "lg-fra": "Dédalo", "lg-spa": "Dédalo 2024-10-28T08:24:26+01:00 Benimamet"}'),
(15361555,	'dd35',	'dd1',	'dd124',	'no',	'si',	'si',	5,	'dd',	'si',	'',	NULL,	NULL,	'{"lg-ara": "العمليات", "lg-cat": "Processos", "lg-deu": "Prozesse", "lg-ell": "Διεργασίες", "lg-eng": "Processes", "lg-eus": "Prozesuak", "lg-fra": "Procédures", "lg-ita": "Processi", "lg-nep": "प्रक्रियाहरू", "lg-spa": "Procesos"}'),
(15361556,	'dd630',	'dd1',	'dd195',	'no',	'si',	'si',	7,	'dd',	'no',	'null',	NULL,	NULL,	'{"lg-cat": "Grafs", "lg-deu": "Grafiken", "lg-ell": "Δίκτυα", "lg-eng": "Graphs", "lg-fra": "Réseaux", "lg-ita": "Reti", "lg-nep": "ग्राफहरू", "lg-spa": "Grafos"}'),
(15361557,	'dd207',	'dd1',	'dd231',	'no',	'si',	'si',	8,	'dd',	'si',	'',	NULL,	NULL,	'{"lg-ara": "إدارة النظام", "lg-cat": "Administració", "lg-deu": "Administration", "lg-ell": "διαχείριση", "lg-eng": "Administration", "lg-eus": "Administrazioa", "lg-fra": "Administration", "lg-ita": "Amministrazione", "lg-nep": "प्रणाली प्रशासन", "lg-spa": "Administración"}'),
(15361558,	'dd3',	'dd117',	'dd1226',	'si',	'si',	'si',	12,	'dd',	'si',	'',	NULL,	NULL,	'{"lg-spa": "area_ontology"}'),
(15361559,	'dd242',	'dd1',	'dd341',	'no',	'si',	'si',	1,	'dd',	'si',	'',	NULL,	NULL,	'{"lg-ara": "فهرس", "lg-cat": "Inventari", "lg-deu": "Katalog", "lg-ell": "Αποθεμάτων", "lg-eng": "Catalogue", "lg-eus": "Inbentarioa", "lg-fra": "Inventaire", "lg-ita": "Inventario", "lg-nep": "क्याटलग", "lg-spa": "Inventario"}'),
(15361560,	'dd69',	'dd1',	'dd102',	'no',	'si',	'si',	2,	'dd',	'si',	'',	NULL,	NULL,	'{"lg-ara": "أنشطة", "lg-cat": "Activitats", "lg-deu": "Aktivitäten", "lg-ell": "δραστηριότητες", "lg-eng": "Activities", "lg-fra": "Activités", "lg-ita": "Attività", "lg-nep": "गतिविधिहरू", "lg-spa": "Actividades"}'),
(15361561,	'dd222',	'dd1',	'dd36',	'no',	'si',	'si',	3,	'dd',	'si',	'',	NULL,	NULL,	'{"lg-ara": "النشر", "lg-cat": "Publicació", "lg-deu": "Publikation", "lg-ell": "δημοσίευση", "lg-eng": "Publication", "lg-fra": "Publication", "lg-ita": "Pubblicazione", "lg-nep": "प्रकाशन", "lg-spa": "Publicación"}'),
(15361562,	'dd14',	'dd1',	'dd357',	'no',	'si',	'si',	4,	'dd',	'si',	'',	NULL,	NULL,	'{"lg-ara": "موارد", "lg-cat": "Recursos", "lg-deu": "Ressourcen", "lg-ell": "Πόροι", "lg-eng": "Resources", "lg-eus": "Baliabideak", "lg-fra": "Ressources", "lg-ita": "Risorse", "lg-nep": "स्रोतहरू", "lg-spa": "Recursos"}'),
(15361563,	'dd1631',	'render59',	'dd1229',	'no',	'si',	'si',	1,	'dd',	'si',	'[{"dd6":"isad1"}]',	NULL,	NULL,	'{"lg-spa": "RECYCLE DD +"}'),
(15361564,	'dd7',	'dd1190',	'dd17',	'no',	'si',	'si',	1,	'dd',	'si',	'',	NULL,	NULL,	'{"lg-spa": "dedalo"}'),
(15361565,	'dd1076',	'dd1190',	'dd17',	'no',	'si',	'si',	3,	'dd',	'si',	NULL,	NULL,	NULL,	'{"lg-spa": "dedalo_dev"}'),
(15361566,	'dd1511',	'dd1190',	'dd17',	'no',	'si',	'si',	4,	'dd',	'si',	NULL,	NULL,	NULL,	'{"lg-spa": "dedalo_demo"}'),
(15361567,	'dd1335',	'dd482',	'dd580',	'no',	'si',	'si',	2,	'dd',	'no',	NULL,	'{"css":{".wrap_component":{"style":{"width":"50%"},".content_data":{"style":{"height":"80vh"}}}}}',	'{"css": {".wrapper_component": {"grid-column": "span 5"}, ".wrapper_component >.content_data": {"min-height": "60vh"}}}',	'{"lg-cat": "Propietats", "lg-deu": "Eigenschaften", "lg-ell": "Ιδιότητες", "lg-eng": "Properties", "lg-fra": "Propriétés", "lg-ita": "Proprietà", "lg-nep": "गुणहरू", "lg-spa": "Propiedades"}'),
(15361568,	'dd1454',	'dd68',	'dd4',	'no',	'si',	'si',	8,	'dd',	'si',	NULL,	'',	'null',	'{"lg-cat": "Administració", "lg-deu": "Administration", "lg-eng": "Administration", "lg-fra": "Administration", "lg-spa": "Administración"}'),
(15361569,	'dd351',	'dd322',	'dd4',	'no',	'si',	'si',	1,	'dd',	'si',	'null',	NULL,	NULL,	'{"lg-cat": "Patrimoni documental", "lg-deu": "Dokumentenerbe", "lg-eng": "Documental heritage", "lg-fra": "Patrimoine documentaire", "lg-ita": "Patrimonio documentario", "lg-spa": "Patrimonio documental"}'),
(15361570,	'dd656',	'dd655',	'dd91',	'no',	'si',	'si',	1,	'dd',	'no',	'[{"dd9":"dd624"},{"dd9":"dd642"},{"dd11":"dd654"},{"dd57":"dd640"},{"dd57":"dd641"},{"dd57":"dd648"}]',	NULL,	NULL,	'{"lg-deu": "Liste", "lg-eng": "List", "lg-fra": "Liste", "lg-ita": "Elenco", "lg-spa": "List"}'),
(15361571,	'dd1668',	'dd1631',	'dd6',	'no',	'si',	'si',	4,	'dd',	'no',	'[{"dd6":"hierarchy1"},{"dd626":"dd1200"}]',	NULL,	NULL,	'{"lg-cat": "Ontologies principals", "lg-deu": "Ontologien Haupt", "lg-ell": "Οντολογίες κύρια", "lg-eng": "Ontologies main", "lg-fra": "Οντολογίες κύρια", "lg-ita": "Ontologie principali", "lg-nep": "ओन्टोलजीज मुख्य", "lg-spa": "Ontologías principales"}'),
(15361572,	'dd101',	'dd100',	'dd4',	'no',	'si',	'si',	7,	'dd',	'no',	'',	NULL,	NULL,	'{"lg-cat": "Toponimia", "lg-deu": "Toponymie", "lg-ell": "τοπωνύμια", "lg-eng": "Toponymy", "lg-fra": "Toponymie", "lg-ita": "Toponomastica", "lg-spa": "Toponimia"}'),
(15361573,	'dd1200',	'dd627',	'dd626',	'no',	'si',	'si',	24,	'dd',	'no',	NULL,	NULL,	'{"inverse_relations": false}',	'{"lg-spa": "matrix_ontology_main"}'),
(15361574,	'dd12',	'dd627',	'dd626',	'no',	'si',	'si',	11,	'dd',	'no',	'',	'{
  "inverse_relations": false
}',	'{"inverse_relations": false}',	'{"lg-spa": "matrix_layout_dd"}'),
(15361575,	'dd1721',	'dd627',	'dd626',	'no',	'si',	'si',	14,	'dd',	'no',	'',	'{
  "inverse_relations": false
}',	'{"inverse_relations": false}',	'{"lg-spa": "matrix_profiles"}'),
(15361576,	'dd1647',	'dd627',	'dd626',	'no',	'si',	'si',	23,	'dd',	'no',	NULL,	NULL,	'{"inverse_relations": true}',	'{"lg-spa": "matrix_nexus"}'),
(15361577,	'dd643',	'dd627',	'dd626',	'no',	'si',	'si',	1,	'dd',	'no',	NULL,	'{
  "inverse_relations": true
}',	'{"inverse_relations": true}',	'{"lg-spa": "matrix"}'),
(15361578,	'dd561',	'dd627',	'dd626',	'no',	'si',	'si',	4,	'dd',	'no',	NULL,	'{
  "inverse_relations": false
}',	'{"inverse_relations": false}',	'{"lg-spa": "matrix_dataframe"}'),
(15361579,	'dd423',	'dd627',	'dd626',	'no',	'si',	'si',	7,	'dd',	'no',	NULL,	'{
  "inverse_relations": false
}',	'{"inverse_relations": false}',	'{"lg-spa": "matrix_hierarchy_main"}'),
(15361580,	'dd485',	'dd627',	'dd626',	'no',	'si',	'si',	8,	'dd',	'si',	NULL,	'{
  "inverse_relations": false
}',	'{"inverse_relations": false}',	'{"lg-spa": "matrix_indexations"}'),
(15361581,	'dd443',	'dd627',	'dd626',	'no',	'si',	'si',	9,	'dd',	'no',	NULL,	'{
  "inverse_relations": false
}',	'{"inverse_relations": false}',	'{"lg-spa": "matrix_langs"}'),
(15361582,	'dd1648',	'dd627',	'dd626',	'no',	'si',	'si',	22,	'dd',	'no',	NULL,	NULL,	'{"inverse_relations": false}',	'{"lg-spa": "matrix_nexus_main"}'),
(15361583,	'dd917',	'dd771',	'dd6',	'no',	'si',	'si',	3,	'dd',	'no',	'[{"dd626":"dd963"}]',	NULL,	NULL,	'{"lg-deu": "Versionen", "lg-eng": "Versions", "lg-fra": "Versions", "lg-ita": "Versioni", "lg-spa": "Versiones"}'),
(15361584,	'dd938',	'dd771',	'dd6',	'no',	'si',	'si',	4,	'dd',	'no',	'[{"dd626":"dd963"}]',	NULL,	NULL,	'{"lg-deu": "Typen von Daten", "lg-eng": "Data types", "lg-fra": "Types de données", "lg-ita": "Tipi di dati", "lg-spa": "Tipos de datos"}'),
(15361585,	'dd1473',	'dd1558',	'dd8',	'no',	'si',	'no',	1,	'dd',	'no',	NULL,	NULL,	'{"css": {".content_data": {"grid-template-columns": "repeat(10, 1fr)"}}}',	'{"lg-deu": "Identifizierung", "lg-eng": "Identification", "lg-fra": "Identification", "lg-spa": "Identifiación"}'),
(15361586,	'dd1479',	'dd1558',	'dd91',	'no',	'si',	'no',	3,	'dd',	'no',	'[{"dd339":"dd1481"},{"dd9":"dd1475"},{"dd9":"dd1482"},{"dd9":"dd1483"},{"dd9":"dd1477"},{"dd10":"dd1478"},{"dd10":"dd1476"}]',	NULL,	NULL,	'{"lg-deu": "Liste", "lg-eng": "List", "lg-fra": "Liste", "lg-spa": "list"}'),
(15361587,	'dd823',	'dd822',	'dd429',	'no',	'si',	'si',	1,	'dd',	'no',	NULL,	'{"css":{".wrap_component":{"mixin":[".vertical",".inverse"],"style":{"width":"10%","border-bottom-right-radius":"10px"}}}}',	'{"source": {"records_mode": "list", "request_config": [{"sqo": {"section_tipo": [{"source": "self"}]}, "show": {"ddo_map": [{"tipo": "dd1477", "parent": "self", "section_tipo": "self", "value_with_parents": true}, {"tipo": "hierarchy5", "parent": "self", "section_tipo": "hierarchy2"}]}}]}}',	'{"lg-cat": "Dependent de", "lg-deu": "Abhängig von", "lg-ell": "εξαρτώμενος", "lg-eng": "Dependent of", "lg-fra": "Dépend de", "lg-ita": "Dipendente da", "lg-nep": "बुबा", "lg-spa": "Dependiente de"}'),
(15361588,	'dd824',	'dd822',	'dd352',	'no',	'si',	'si',	2,	'dd',	'no',	'null',	'{"css":{".wrap_component":{"mixin":[".vertical"],"style":{"width":"10%"}},".content_data":{"style":{"width":"120px"}}}}',	'{"source": {"records_mode": "list", "request_config": [{"sqo": {"section_tipo": [{"source": "self"}]}, "show": {"ddo_map": [{"tipo": "dd1477", "parent": "self", "section_tipo": "self", "value_with_parents": true}]}}]}}',	'{"lg-cat": "Fills", "lg-deu": "Unterbegriffe", "lg-ell": "απόγονος", "lg-eng": "Children", "lg-fra": "Enfants", "lg-ita": "Figli", "lg-nep": "बच्चाहरु", "lg-spa": "Hijos"}'),
(15361589,	'dd826',	'dd822',	'dd431',	'no',	'si',	'si',	3,	'dd',	'no',	NULL,	'{"css":{".wrap_component":{"mixin":[".vertical"],"style":{"width":"30%"}}}}',	'{"source": {"records_mode": "list", "request_config": [{"sqo": {"section_tipo": [{"value": [1, 4, 5], "source": "hierarchy_types"}]}, "show": {"ddo_map": [{"tipo": "dd1477", "parent": "self", "section_tipo": "self", "value_with_parents": false}]}}]}, "config_relation": {"relation_type": "dd89", "relation_type_rel": "dd620"}}',	'{"lg-cat": "Termes relacionats", "lg-deu": "Verwandte Begriffe", "lg-ell": "Σχετικοί όροι", "lg-eng": "Related terms", "lg-fra": "Termes liés", "lg-ita": "Nome", "lg-nep": "सम्बन्धित सर्तहरू", "lg-spa": "Términos relacionados"}'),
(15361590,	'dd829',	'dd1631',	'dd580',	'no',	'si',	'si',	5,	'dd',	'no',	NULL,	'{"css":{".wrap_component":{"mixin":[".vertical"],"style":{"width":"100%","height":"25vh"}}}}',	'{"css": {".wrap_component": {"mixin": [".vertical"], "style": {"width": "100%", "height": "25vh"}}}}',	'{"lg-deu": "Resultat", "lg-eng": "Result", "lg-fra": "Résultat", "lg-ita": "Risultato", "lg-spa": "Resultado"}'),
(15361591,	'dd847',	'dd1631',	'dd9',	'no',	'si',	'si',	7,	'dd',	'no',	NULL,	'{"multi_value":true,"css":{".wrap_component":{"mixin":[".vertical"],"style":{"width":"50%"}}}}',	'{"css": {".wrap_component": {"mixin": [".vertical"], "style": {"width": "50%"}}}, "multi_value": true}',	'{"lg-deu": "Eingabeparameter", "lg-eng": "Input parameter", "lg-fra": "Paramètres d''entrée", "lg-ita": "Parametro d'' entrata", "lg-spa": "Parámetro de entrada"}'),
(15361592,	'dd848',	'dd1631',	'dd530',	'no',	'si',	'si',	8,	'dd',	'no',	'[{"dd6":"dd938"},{"dd9":"dd949"}]',	'{"multi_value":true,"mode":"autocomplete","css":{".wrap_component":{"mixin":[".vertical"],"style":{"width":"50%"}}}}',	'{"css": {".wrap_component": {"mixin": [".vertical"], "style": {"width": "50%"}}}, "mode": "autocomplete", "multi_value": true}',	'{"lg-deu": "Typ des Datums", "lg-eng": "Data type", "lg-fra": "Type d''organisme", "lg-ita": "Tipo di dato", "lg-spa": "Tipo de dato"}'),
(15361593,	'dd1226',	'dd2',	'null',	'si',	'si',	'si',	3,	'dd',	'no',	'',	NULL,	NULL,	'{"lg-spa": "diffusion"}'),
(15361594,	'dd1259',	'dd1226',	'null',	'si',	'si',	'si',	1,	'dd',	'si',	'',	NULL,	NULL,	'{"lg-spa": "database"}'),
(15361595,	'dd251',	'dd1226',	NULL,	'si',	'si',	'si',	3,	'dd',	'no',	NULL,	NULL,	NULL,	'{"lg-spa": "structure_data"}'),
(15361596,	'dd1190',	'dd1',	'dd1226',	'no',	'si',	'si',	11,	'dd',	'si',	'null',	NULL,	NULL,	'{"lg-cat": "Difusió", "lg-deu": "Verbreitung", "lg-eng": "Diffusion", "lg-fra": "Diffusion", "lg-ita": "Diffusione", "lg-nep": "प्रसार", "lg-spa": "Difusión"}'),
(15361597,	'dd1201',	'dd627',	'dd626',	'no',	'si',	'si',	25,	'dd',	'no',	NULL,	NULL,	'{"info": "Deactivated (false) until the release of v6.3.0 to prevent interactions with versions <=6.2.8", "inverse_relations": false}',	'{"lg-spa": "matrix_ontology"}'),
(15361598,	'dd1132',	'rsc481',	'dd6',	'no',	'si',	'si',	6,	'dd',	'si',	'[{"dd626":"dd22"}]',	NULL,	'{"color": "#6f92be"}',	'{"lg-cat": "Col·lecció / arxiu", "lg-deu": "Sammlung / Archiv", "lg-ell": "Συλλογή / αρχείο", "lg-eng": "Collection / archive", "lg-fra": "Collection / archive", "lg-ita": "Collezione / archivio", "lg-spa": "Colección / archivo"}'),
(15361599,	'dd548',	'dd542',	'dd8',	'no',	'si',	'si',	1,	'dd',	'si',	'',	'',	NULL,	'{"lg-cat": "General", "lg-deu": "Allgemein", "lg-ell": "γενικός", "lg-eng": "General", "lg-fra": "Général", "lg-ita": "Generale", "lg-spa": "General"}'),
(15361600,	'dd337',	'dd342',	'dd395',	'no',	'si',	'si',	11,	'dd',	'si',	NULL,	'{"name":"actualizar_estructura"}',	'{"name": "update_ontology"}',	'{"lg-cat": "Actualitzar Ontologia", "lg-deu": "Ontologie aktualisieren", "lg-eng": "Update Ontology", "lg-fra": "Mise à jour de l''Ontologie", "lg-ita": "Aggiornare Ontologia", "lg-spa": "Actualizar Ontología"}'),
(15361601,	'dd597',	'dd477',	'dd91',	'no',	'si',	'si',	3,	'dd',	'no',	'[{"dd339":"dd593"},{"dd9":"dd594"},{"dd1017":"dd595"}]',	NULL,	NULL,	'{"lg-cat": "Llistat", "lg-deu": "Liste", "lg-ell": "Λίστα", "lg-eng": "List", "lg-fra": "Liste", "lg-ita": "Elenco", "lg-spa": "List"}'),
(15361602,	'dd120',	'dd906',	'dd395',	'no',	'si',	'si',	10,	'dd',	'si',	NULL,	'{"name":"total_records"}',	'{"name": "total_records"}',	'{"lg-cat": "Registres totals", "lg-deu": "Totale Einträge", "lg-ell": "συνολικές εγγραφές", "lg-eng": "Total records", "lg-fra": "Nombre total d''enregistrements", "lg-ita": "Registri totali", "lg-spa": "Registros totales"}'),
(15361603,	'dd243',	'dd1553',	'dd395',	'no',	'si',	'si',	5,	'dd',	'si',	'',	'{
  "name": "transcripcion_automatica"
}',	'{"name": "transcripcion_automatica"}',	'{"lg-cat": "Transcripció automàtica", "lg-deu": "Automatische Transkription", "lg-ell": "αυτόματη μεταγραφή", "lg-eng": "Automatic transcription", "lg-fra": "Transcription automatique", "lg-ita": "Trascrizione automatica", "lg-nep": "स्वचालित ट्रान्सक्रिप्शन", "lg-spa": "Transcripción automática"}'),
(15361604,	'dd385',	'dd382',	'dd9',	'no',	'si',	'si',	2,	'dd',	'no',	NULL,	'{"css":{".wrap_component":{"mixin":[".vertical"],"style":{"width":"20%"}}}}',	'{"css": {".wrapper_component": {"grid-column": "span 2"}}}',	'{"lg-cat": "Sigles", "lg-deu": "Initialen", "lg-ell": "ακρώνυμο", "lg-eng": "Acronym", "lg-fra": "Sigles", "lg-ita": "Sigle", "lg-spa": "Siglas"}'),
(15361605,	'dd268',	'dd234',	'dd183',	'no',	'si',	'si',	5,	'dd',	'no',	NULL,	NULL,	NULL,	'{"lg-cat": "Esborrar", "lg-deu": "Löschen", "lg-ell": "διαγράψετε", "lg-eng": "Delete", "lg-fra": "Supprimer", "lg-ita": "Cancellare", "lg-spa": "Borrar"}'),
(15361606,	'dd507',	'dd536',	'dd395',	'no',	'si',	'si',	2,	'dd',	'si',	NULL,	'{
  "name": "crear_capitulo"
}',	'{"name": "crear_capitulo"}',	'{"lg-cat": "Crear capítol", "lg-deu": "Kapitel erstellen", "lg-ell": "Δημιουργία κεφαλαίου", "lg-eng": "Create chapter", "lg-fra": "Créer un chapitre ", "lg-ita": "Creare capitolo", "lg-spa": "Crear capítulo"}'),
(15361607,	'dd470',	'dd469',	'dd8',	'no',	'si',	'si',	1,	'dd',	'no',	NULL,	NULL,	NULL,	'{"lg-cat": "Identificació", "lg-deu": "Identifizierung", "lg-eng": "Identification", "lg-fra": "Identification", "lg-ita": "Identificazione", "lg-spa": "Identificación"}'),
(15361608,	'dd471',	'dd470',	'dd9',	'no',	'si',	'si',	1,	'dd',	'si',	NULL,	NULL,	NULL,	'{"lg-cat": "Tipus de via", "lg-deu": "Typ der Pfades", "lg-eng": "Track type", "lg-fra": "Type de voie", "lg-ita": "Tipo di via", "lg-spa": "Tipo de vía"}'),
(15361609,	'dd509',	'dd536',	'dd395',	'no',	'si',	'si',	4,	'dd',	'si',	NULL,	'{
  "name": "actualizar_vista"
}',	'{"name": "actualizar_vista"}',	'{"lg-cat": "Actualitzar vista", "lg-deu": "Ansicht aktualisieren", "lg-ell": "Ενημέρωση προβολής", "lg-eng": "Update view", "lg-fra": "Mise à jour de l''aperçu", "lg-ita": "Aggiornare vista", "lg-spa": "Actualizar vista"}'),
(15361610,	'dd573',	'dd567',	'dd177',	'no',	'si',	'si',	3,	'dd',	'si',	'',	'',	NULL,	'{"lg-cat": "Nou estat Cinta", "lg-deu": "Neuer Zustand des Bandes", "lg-eng": "New state Ribbon", "lg-fra": "Nouveau statut Bande", "lg-ita": "Nuovo stato nastro", "lg-spa": "Nuevo estado Cinta"}'),
(15361611,	'dd574',	'dd567',	'dd183',	'no',	'si',	'si',	4,	'dd',	'si',	'',	'',	NULL,	'{"lg-cat": "Esborrar estat Cinta", "lg-deu": "Zustand des Bandes löschen", "lg-eng": "Clear State Tape", "lg-fra": "Effacer le statut Bande", "lg-ita": "Cancellare stato nastro", "lg-spa": "Borrar estado Cinta"}'),
(15361612,	'dd435',	'dd460',	'dd58',	'no',	'si',	'si',	5,	'dd',	'no',	'null',	NULL,	NULL,	'{"lg-cat": "Relacions", "lg-deu": "Beziehung", "lg-eng": "Relations", "lg-fra": "Relation", "lg-spa": "Relation"}'),
(15361613,	'dd886',	'dd882',	'dd91',	'no',	'si',	'si',	5,	'dd',	'no',	'[{"dd9":"dd884"}]',	NULL,	NULL,	'{"lg-cat": "Llistat", "lg-deu": "Liste", "lg-ell": "λίστα", "lg-eng": "List", "lg-fra": "Liste", "lg-ita": "Elenco", "lg-spa": "Listado"}'),
(15361614,	'dd478',	'dd782',	'dd479',	'no',	'si',	'si',	1,	'dd',	'no',	NULL,	NULL,	'{"css": {".wrapper_component": {"grid-column": "span 1"}}}',	'{"lg-cat": "Filtre de registres", "lg-deu": "Eintragsfilter", "lg-ell": "Αρχεία φίλτρο", "lg-eng": "Records filter", "lg-fra": "Filtre de registres", "lg-ita": "Filtro dei registri", "lg-spa": "Filtro de registros"}'),
(15361615,	'dd426',	'dd1125',	'dd395',	'no',	'si',	'si',	3,	'dd',	'si',	NULL,	'{
  "name": "altitude"
}',	'{"name": "altitude"}',	'{"lg-cat": "Altitud", "lg-deu": "Höhe", "lg-ell": "υψόμετρο", "lg-eng": "Altitude", "lg-fra": "Altitude", "lg-ita": "Altitudine", "lg-spa": "Altitud"}'),
(15361616,	'dd444',	'dd342',	'dd395',	'no',	'si',	'si',	2,	'dd',	'si',	NULL,	'{
  "name": "mover"
}',	'{"name": "mover"}',	'{"lg-cat": "Moure", "lg-deu": "Bewegen", "lg-eng": "Move", "lg-fra": "Déplacer", "lg-ita": "Muovere", "lg-spa": "Mover"}'),
(15361617,	'dd140',	'dd90',	'dd91',	'no',	'si',	'si',	3,	'dd',	'si',	'[{"dd9":"dd127"}]',	'',	NULL,	'{"lg-cat": "Llistat", "lg-deu": "Liste", "lg-eng": "List", "lg-fra": "Liste", "lg-ita": "Elenco", "lg-spa": "Listado"}'),
(15361618,	'dd387',	'dd390',	'dd395',	'no',	'si',	'si',	9,	'dd',	'si',	'',	'{"name":"salir"}',	'{"name": "salir"}',	'{"lg-cat": "Eixir", "lg-deu": "Verlassen", "lg-ell": "έξοδος", "lg-eng": "Quit", "lg-fra": "Sortir", "lg-ita": "Uscire", "lg-nep": "छोड्नुहोस्", "lg-spa": "Salir"}'),
(15361619,	'dd437',	'dd439',	'dd395',	'no',	'si',	'si',	1,	'dd',	'si',	NULL,	'{
  "name": "ruta_carpeta_ficheros"
}',	'{"name": "ruta_carpeta_ficheros"}',	'{"lg-deu": "Ordnerpfad: Zu importierende Dateien", "lg-eng": "Files to import path", "lg-fra": "Chemin d''accès au dossier des fichiers à importer", "lg-ita": "Percorso della cartella files a importare", "lg-spa": "Ruta de carpeta ficheros a importar"}'),
(15361620,	'dd367',	'dd366',	'dd9',	'no',	'si',	'si',	2,	'dd',	'si',	NULL,	NULL,	'{"css": {".wrapper_component": {"grid-column": "span 5"}}}',	'{"lg-cat": "Estat Civil", "lg-deu": "Zivilstand", "lg-ell": "οικογενειακή κατάσταση", "lg-eng": "Civil status", "lg-fra": "État civil", "lg-ita": "Stato civile", "lg-spa": "Estado civil"}'),
(15361621,	'dd412',	'dd409',	'dd635',	'no',	'si',	'si',	3,	'dd',	'no',	NULL,	NULL,	'{"css": {".wrapper_component": {"grid-column": "span 2"}}}',	'{"lg-cat": "Any de fundació", "lg-deu": "Gründungsjahr", "lg-ell": "έτος ίδρυσης", "lg-eng": "Foundation year", "lg-fra": "Année de fondation", "lg-ita": "Anno di fondazione", "lg-spa": "Año de fundación"}'),
(15361622,	'dd89',	'dd427',	'dd206',	'no',	'si',	'si',	8,	'dd',	'no',	'',	'',	NULL,	'{"lg-cat": "relacionat", "lg-deu": "Verwandt", "lg-ell": "σχετίζεται με", "lg-eng": "Related", "lg-fra": "En rapport", "lg-ita": "Collegato", "lg-nep": "सम्बन्धित", "lg-spa": "Relacionado"}'),
(15361623,	'dd379',	'dd372',	'dd183',	'no',	'si',	'si',	4,	'dd',	'no',	NULL,	NULL,	NULL,	'{"lg-cat": "Esborrar", "lg-deu": "Löschen", "lg-ell": "διαγράψετε", "lg-eng": "Delete", "lg-fra": "Supprimer", "lg-ita": "Cancellare", "lg-spa": "Borrar"}'),
(15361624,	'dd380',	'dd372',	'dd247',	'no',	'si',	'si',	2,	'dd',	'no',	NULL,	NULL,	NULL,	'{"lg-cat": "Projecte", "lg-deu": "Projekt", "lg-ell": "Έργο", "lg-eng": "Project", "lg-fra": "Projet", "lg-ita": "Progetto", "lg-spa": "Proyecto"}'),
(15361625,	'dd404',	'dd381',	'dd177',	'no',	'si',	'si',	3,	'dd',	'no',	NULL,	NULL,	NULL,	'{"lg-cat": "Nou", "lg-deu": "Neu", "lg-ell": "νέος", "lg-eng": "New", "lg-fra": "Nouveau", "lg-ita": "Nuovo", "lg-spa": "Nuevo"}'),
(15361626,	'dd405',	'dd381',	'dd183',	'no',	'si',	'si',	4,	'dd',	'no',	NULL,	NULL,	NULL,	'{"lg-cat": "Esborrar", "lg-deu": "Löschen", "lg-ell": "διαγράψετε", "lg-eng": "Delete", "lg-fra": "Supprimer", "lg-ita": "Cancellare", "lg-spa": "Borrar"}'),
(15361627,	'dd228',	'dd203',	'dd177',	'no',	'si',	'si',	4,	'dd',	'no',	NULL,	'',	NULL,	'{"lg-cat": "Nou", "lg-deu": "Neu", "lg-eng": "New", "lg-fra": "Nouveau", "lg-ita": "Nuovo", "lg-spa": "Nuevo"}'),
(15361628,	'dd1310',	'dd1308',	'dd247',	'no',	'si',	'si',	2,	'dd',	'no',	'',	'',	NULL,	'{"lg-cat": "Projecte", "lg-deu": "Projekt", "lg-ell": "Έργο", "lg-eng": "Project", "lg-fra": "Projet", "lg-ita": "Progetto", "lg-spa": "Proyecto"}'),
(15361629,	'dd38',	'dd33',	'dd9',	'no',	'si',	'si',	2,	'dd',	'si',	'[{"dd6":"oh1"}]',	'',	NULL,	'{"lg-deu": "Name", "lg-ell": "όνομα", "lg-eng": "Name", "lg-fra": "Prénom", "lg-ita": "Nome", "lg-spa": "Nombre"}'),
(15361630,	'dd92',	'dd182',	'dd43',	'no',	'si',	'si',	2,	'dd',	'no',	'',	'',	NULL,	'{"lg-cat": "Valor %", "lg-deu": "Wert %", "lg-ell": "Αξία %", "lg-eng": "Value %", "lg-fra": "Valeur %", "lg-ita": "Valore %", "lg-spa": "Valor %"}'),
(15361631,	'dd23',	'dd21',	'dd438',	'no',	'si',	'si',	3,	'dd',	'no',	'',	'',	NULL,	'{"lg-cat": "Layout", "lg-deu": "Layout", "lg-ell": "επιφάνεια εργασίας", "lg-eng": "Layout", "lg-fra": "Mise en page", "lg-ita": "Impaginazione", "lg-spa": "Maquetación"}'),
(15361632,	'dd1046',	'dd1125',	'dd395',	'no',	'si',	'si',	7,	'dd',	'si',	'null',	'{"name":"longitud"}',	'{"name": "longitude"}',	'{"lg-deu": "Geografische Länge", "lg-ell": "μήκος", "lg-eng": "Longitude", "lg-fra": "Longitude ", "lg-ita": "Longitudine", "lg-spa": "Longitud"}'),
(15361633,	'dd834',	'dd833',	'dd8',	'no',	'si',	'si',	1,	'dd',	'si',	'',	'',	NULL,	'{"lg-cat": "Valor de la llista", "lg-deu": "Wert aus der Liste", "lg-eng": "Diffusion", "lg-fra": "Valeur de la liste", "lg-ita": "Valore della lista", "lg-spa": "Valor de la lista"}'),
(15361634,	'dd1709',	'dd147',	'dd395',	'no',	'si',	'si',	1,	'dd',	'si',	'',	'{
  "name": "tiempo"
}',	'{"name": "tiempo"}',	'{"lg-cat": "Temps", "lg-deu": "Zeit", "lg-ell": "φορά", "lg-eng": "Time", "lg-fra": "Temps", "lg-ita": "Tempo", "lg-nep": "समय", "lg-spa": "Tiempo"}'),
(15361635,	'dd1093',	'dd63',	'dd1029',	'no',	'si',	'si',	7,	'dd',	'si',	'[{"dd9":"dd551"}]',	'',	NULL,	'{"lg-cat": "Data", "lg-deu": "Datum, Angabe", "lg-eng": "Data", "lg-fra": "donnée", "lg-spa": "dato"}'),
(15361636,	'dd488',	'dd539',	'dd395',	'no',	'si',	'si',	16,	'dd',	'si',	NULL,	'{
  "name": "info_fichero"
}',	'{"name": "info_fichero"}',	'{"lg-cat": "Informació del fitxer", "lg-deu": "Dateiinformation", "lg-ell": "πληροφορίες αρχείου", "lg-eng": "File information", "lg-fra": "Informations des fichiers", "lg-ita": "Informazione del file", "lg-spa": "Información del fichero"}'),
(15361637,	'dd427',	'dd193',	'dd303',	'no',	'si',	'si',	6,	'dd',	'no',	NULL,	NULL,	NULL,	'{"lg-deu": "Typen von Beziehungen", "lg-eng": "Relationship types", "lg-fra": "Types de relations", "lg-ita": "tipi di relazione", "lg-spa": "Tipos de relación"}'),
(15361638,	'dd1021',	'dd391',	'dd395',	'no',	'si',	'si',	59,	'dd',	'si',	'',	'{"name":"datos"}',	'{"name": "data"}',	'{"lg-ara": "بيانات", "lg-cat": "dades", "lg-deu": "Daten, Angaben", "lg-ell": "δεδομένα", "lg-eng": "data", "lg-fra": "données", "lg-ita": "dati", "lg-nep": "डाटा", "lg-spa": "datos"}'),
(15361639,	'dd439',	'dd342',	'dd395',	'no',	'si',	'si',	14,	'dd',	'si',	NULL,	'{
  "name": "tool_import_dedalo_csv"
}',	'{"name": "tool_import_dedalo_csv"}',	'{"lg-deu": "Dédalo csv importieren", "lg-eng": "Import Dédalo csv", "lg-fra": "Importer Daedalus csv", "lg-ita": "Importare Dedalo csv", "lg-spa": "Importar Dédalo csv"}'),
(15361640,	'dd741',	'dd391',	'dd395',	'no',	'si',	'si',	28,	'dd',	'si',	'',	'{"name":"error_al_subir_el_archivo"}',	'{"name": "error_on_upload_file"}',	'{"lg-cat": "Error al pujar el fitxer!", "lg-deu": "Fehler beim Hochladen der Datei", "lg-ell": "Σφάλμα μεταφόρτωσης αρχείου", "lg-eng": "Error on upload file", "lg-fra": "Erreur de téléchargement de fichier", "lg-ita": "Errore nel caricare l''archivio", "lg-nep": "फाइल अपलोड गर्दा त्रुटि भयो", "lg-spa": "Error al subir el archivo"}'),
(15361641,	'dd748',	'dd391',	'dd395',	'no',	'si',	'si',	33,	'dd',	'si',	'',	'{"name":"carga_de_archivo_completada"}',	'{"name": "carga_de_archivo_completada"}',	'{"lg-cat": "Càrrega d''arxiu completada", "lg-deu": "Hochladen der Datei abgeschlossen", "lg-ell": "Upload αρχείου ολοκληρώθηκε", "lg-eng": "Upload complete", "lg-fra": "Téléchargement de fichier terminé", "lg-ita": "Caricamento dell''archivio completato", "lg-nep": "अपलोड पूरा भयो", "lg-spa": "Carga de archivo completada"}'),
(15361642,	'dd754',	'dd391',	'dd395',	'no',	'si',	'si',	35,	'dd',	'si',	'',	'{"name":"accion"}',	'{"name": "accion"}',	'{"lg-cat": "Acció", "lg-deu": "Aktion", "lg-ell": "δράση", "lg-eng": "Action", "lg-fra": "Action", "lg-ita": "Azione", "lg-spa": "Acción"}'),
(15361643,	'dd737',	'dd391',	'dd395',	'no',	'si',	'si',	27,	'dd',	'si',	'',	'{"name":"extension_no_valida"}',	'{"name": "invalid_extension"}',	'{"lg-cat": "Extensió no vàlida", "lg-deu": "Ungültige Erweiterung", "lg-ell": "Μη έγκυρη Επέκταση", "lg-eng": "Invalid extension", "lg-fra": "Extension non valide", "lg-ita": "Estensione non valida", "lg-nep": "अवैध विस्तार", "lg-spa": "Extensión no válida"}'),
(15361644,	'dd694',	'dd692',	'dd395',	'no',	'si',	'si',	5,	'dd',	'si',	'',	'{"name":"edicion"}',	'{"name": "edicion"}',	'{"lg-cat": "Edició", "lg-deu": "Auflage", "lg-ell": "έκδοση", "lg-eng": "Edit", "lg-fra": "Édition ", "lg-ita": "Modifica", "lg-nep": "सम्पादन गर्नुहोस्", "lg-spa": "Edición"}'),
(15361645,	'dd696',	'dd692',	'dd395',	'no',	'si',	'si',	7,	'dd',	'si',	'',	'{"name":"entrada"}',	'{"name": "entrada"}',	'{"lg-cat": "Entrada", "lg-deu": "Login", "lg-ell": "εγγραφή", "lg-eng": "Login", "lg-fra": "Entrée", "lg-ita": "Entrata", "lg-nep": "लग - इन", "lg-spa": "Entrada"}'),
(15361646,	'dd693',	'dd692',	'dd395',	'no',	'si',	'si',	4,	'dd',	'si',	'',	'{"name":"listado"}',	'{"name": "list"}',	'{"lg-cat": "Llistat", "lg-deu": "Liste", "lg-ell": "λίστα", "lg-eng": "List", "lg-fra": "Liste", "lg-ita": "Elenco", "lg-nep": "सूची", "lg-spa": "Listado"}'),
(15361647,	'dd1314',	'dd1313',	'dd8',	'no',	'si',	'si',	1,	'dd',	'no',	'',	NULL,	'{"css": {".content_data": {"grid-template-columns": "repeat(10, 1fr)"}}}',	'{"lg-cat": "Valor de la llista", "lg-deu": "Wert aus der Liste", "lg-eng": "List value", "lg-fra": "Valeur de la liste", "lg-ita": "Valore della lista", "lg-spa": "Valor de la lista"}'),
(15361648,	'dd642',	'dd637',	'dd9',	'no',	'si',	'si',	4,	'dd',	'no',	NULL,	'{"css":{".wrap_component":{"mixin":[".vertical"],"style":{"width":"15%"}}}}',	NULL,	'{"lg-cat": "Section tipo", "lg-deu": "Sektionstyp", "lg-eng": "Section tipo", "lg-fra": "Type de section", "lg-ita": "Tipo sezione", "lg-spa": "Section tipo"}'),
(15361649,	'dd299',	'dd137',	'dd6',	'no',	'si',	'si',	26,	'dd',	'no',	'[{"dd626":"dd963"}]',	NULL,	NULL,	'{"lg-cat": "Públic/privat", "lg-deu": "öffentlich/privat", "lg-eng": "Public/private", "lg-fra": "Public/privé", "lg-ita": "Pubblico/privato", "lg-spa": "Publico/privado"}'),
(15361650,	'dd1311',	'dd1309',	'dd9',	'no',	'si',	'si',	2,	'dd',	'si',	'',	NULL,	'{"css": {".wrapper_component": {"grid-column": "span 5"}}}',	'{"lg-cat": "Línia d''investigació", "lg-deu": "Forschungslinie", "lg-ell": "έρευνα Γραμμή", "lg-eng": "Research line", "lg-fra": "Ligne de recherche", "lg-ita": "Linea d&#039;indagine", "lg-spa": "Línea de investigación"}'),
(15361651,	'dd927',	'dd922',	'dd177',	'no',	'si',	'si',	3,	'dd',	'no',	'',	'',	NULL,	'{"lg-cat": "Nova categoria laboral / Càrrec", "lg-deu": "Neue Berufsgruppe / Titel", "lg-ell": "νέος", "lg-eng": "New Labor Category / Title", "lg-fra": "Nouveau Catégorie d''emploi / Poste", "lg-ita": "Nuova Categoria Lavorativa / Responsabile", "lg-spa": "Nueva Categoría Laboral / Cargo"}'),
(15361652,	'dd370',	'dd365',	'dd183',	'no',	'si',	'si',	4,	'dd',	'no',	NULL,	NULL,	NULL,	'{"lg-cat": "Esborrar", "lg-deu": "Löschen", "lg-ell": "διαγράψετε", "lg-eng": "Delete", "lg-fra": "Supprimer", "lg-ita": "Cancellare", "lg-spa": "Borrar"}'),
(15361653,	'dd377',	'dd372',	'dd91',	'no',	'si',	'si',	5,	'dd',	'no',	'[{"dd9":"dd374"},{"dd9":"dd375"},{"dd635":"dd376"}]',	NULL,	NULL,	'{"lg-cat": "Llistat", "lg-deu": "Liste", "lg-ell": "λίστα", "lg-eng": "List", "lg-fra": "Liste", "lg-ita": "Elenco", "lg-spa": "Listado"}'),
(15361654,	'dd396',	'dd381',	'dd91',	'no',	'si',	'si',	5,	'dd',	'si',	'[{"dd9":"dd385"},{"dd9":"dd393"},{"dd635":"dd394"}]',	NULL,	NULL,	'{"lg-cat": "Llistat", "lg-deu": "Liste", "lg-ell": "λίστα", "lg-eng": "List", "lg-fra": "Liste", "lg-ita": "Elenco", "lg-spa": "Listado"}'),
(15361655,	'dd414',	'dd408',	'dd177',	'no',	'si',	'si',	3,	'dd',	'no',	NULL,	NULL,	NULL,	'{"lg-cat": "Nou", "lg-deu": "Neu", "lg-ell": "νέος", "lg-eng": "New", "lg-fra": "Nouveau", "lg-ita": "Nuovo", "lg-spa": "Nuevo"}'),
(15361656,	'dd413',	'dd408',	'dd91',	'no',	'si',	'si',	5,	'dd',	'no',	'[{"dd9":"dd411"},{"dd635":"dd412"}]',	NULL,	NULL,	'{"lg-cat": "Llistat", "lg-deu": "Liste", "lg-ell": "λίστα", "lg-eng": "List", "lg-fra": "Liste", "lg-ita": "Elenco", "lg-spa": "Listado"}'),
(15361657,	'dd61',	'dd21',	'dd9',	'no',	'si',	'si',	1,	'dd',	'no',	'',	'',	NULL,	'{"lg-cat": "Secció", "lg-deu": "Sektion", "lg-ell": "τμήμα", "lg-eng": "Section", "lg-fra": "Section", "lg-ita": "Sezione", "lg-spa": "Sección"}'),
(15361658,	'dd41',	'dd30',	'dd91',	'no',	'si',	'si',	2,	'dd',	'no',	'[{"dd9":"dd38"},{"dd9":"dd67"},{"dd438":"dd39"}]',	'',	NULL,	'{"lg-deu": "Liste", "lg-ell": "λίστα", "lg-eng": "List", "lg-fra": "Liste", "lg-ita": "Elenco", "lg-spa": "Listado"}'),
(15361659,	'dd1073',	'dd63',	'dd1029',	'no',	'si',	'si',	4,	'dd',	'si',	'[{"dd634":"dd546"}]',	'',	NULL,	'{"lg-cat": "A on", "lg-deu": "Wo", "lg-eng": "Where", "lg-fra": "Où ", "lg-spa": "Dónde"}'),
(15361660,	'dd583',	'dd1553',	'dd395',	'no',	'si',	'si',	6,	'dd',	'si',	'',	'{"name":"traduccion_automatica"}',	'{"name": "automatic_translation"}',	'{"lg-cat": "Traducció automàtica", "lg-deu": "Automatische Übersetzung", "lg-ell": "αυτόματη μετάφραση", "lg-eng": "Automatic translation", "lg-fra": "Traduction automatique", "lg-ita": "Traduzione automatica", "lg-spa": "Traducción automática"}'),
(15361661,	'dd1325',	'dd73',	'dd8',	'no',	'si',	'si',	1,	'dd',	'no',	NULL,	NULL,	'{"css": {".content_data": {"grid-template-columns": "repeat(10, 10%)"}}}',	'{"lg-deu": "Information", "lg-eng": "Information", "lg-fra": "Information", "lg-spa": "Información"}'),
(15361662,	'dd586',	'dd1553',	'dd395',	'no',	'si',	'si',	7,	'dd',	'si',	'',	'{
  "name": "copiar_a_destino"
}',	'{"name": "copiar_a_destino"}',	'{"lg-cat": "Copiar a destí", "lg-deu": "Ins Ziel kopieren", "lg-ell": "Αντιγραφή στον προορισμό", "lg-eng": "Copy to target", "lg-fra": "Copier vers la destination", "lg-ita": "Copiare nella destinazione", "lg-spa": "Copiar a destino"}'),
(15361663,	'dd356',	'dd242',	'dd4',	'no',	'si',	'si',	2,	'dd',	'si',	'',	'',	NULL,	'{"lg-cat": "Natural", "lg-deu": "Natürlich", "lg-eng": "Natural", "lg-eus": "Natural", "lg-fra": "Naturel", "lg-ita": "Naturale", "lg-spa": "Natural"}'),
(15361664,	'dd349',	'dd355',	'dd4',	'no',	'si',	'si',	1,	'dd',	'si',	'',	'',	NULL,	'{"lg-cat": "Material", "lg-deu": "Material", "lg-eng": "Material", "lg-eus": "Materiala", "lg-fra": "Matériel", "lg-ita": "Materiale", "lg-nep": "सामग्री", "lg-spa": "Material"}'),
(15361665,	'dd1114',	'dd390',	'dd395',	'no',	'si',	'si',	2,	'dd',	'si',	'',	'{"name":"ver_ficha_existente"}',	'{"name": "ver_ficha_existente"}',	'{"lg-cat": "Veure fitxa existent", "lg-deu": "Existierende Eintrag ansehen", "lg-ell": "Δείτε τα υπάρχοντα ρεκόρ", "lg-eng": "View existing record", "lg-fra": "Voir le fichier existant", "lg-ita": "Guarda scheda esistente", "lg-nep": "अवस्थित रेकर्ड हेर्नुहोस्", "lg-spa": "Ver ficha existente"}'),
(15361666,	'dd837',	'dd833',	'dd91',	'no',	'si',	'si',	3,	'dd',	'si',	'[{"dd9":"dd835"}]',	NULL,	NULL,	'{"lg-cat": "Llistat de registres", "lg-deu": "Liste der Einträge", "lg-eng": "List", "lg-fra": "Liste des enregistrements", "lg-ita": "Elenco dei registri", "lg-spa": "Listado de registros"}'),
(15361667,	'dd1120',	'dd1117',	'dd91',	'no',	'si',	'si',	5,	'dd',	'si',	'[{"dd9":"dd1119"}]',	'',	NULL,	'{"lg-cat": "Llistat de tipologies recursos", "lg-deu": "Liste der Typologien Ressourcen", "lg-eng": "List of types of resources", "lg-fra": "Liste des typologies de ressources", "lg-ita": "Elenco delle tipologie risorsa", "lg-spa": "Listado de tipologías recursos"}'),
(15361668,	'dd1710',	'dd1125',	'dd395',	'no',	'si',	'si',	2,	'dd',	'si',	'',	'{"name":"geolocalizacion"}',	'{"name": "geolocalizacion"}',	'{"lg-cat": "Geolocalització", "lg-deu": "Geolokalisation", "lg-ell": "γεωεντοπισμός", "lg-eng": "Geolocation", "lg-fra": "Géolocalisation ", "lg-ita": "Geolocalizzazione", "lg-spa": "Geolocalización"}'),
(15361669,	'dd990',	'dd985',	'dd177',	'no',	'si',	'si',	3,	'dd',	'no',	'',	'',	NULL,	'{"lg-cat": "Nou estàndard de color audiovisual", "lg-deu": "Neuer AV-Farbstandard", "lg-eng": "New audiovisual color standard", "lg-fra": "Nouvelle norme de couleur AV", "lg-ita": "Nuovo Standard del Colore Audiovisivo", "lg-spa": "Nuevo estándar de color audiovisual"}'),
(15361670,	'dd785',	'dd383',	'dd392',	'no',	'si',	'si',	6,	'dd',	'si',	'',	'',	NULL,	'{"lg-cat": "Eines", "lg-deu": "Werkzeuge", "lg-eng": "Tools", "lg-fra": "Outils", "lg-ita": "Strumenti", "lg-spa": "Tools"}'),
(15361671,	'dd618',	'dd391',	'dd395',	'no',	'si',	'si',	74,	'dd',	'si',	'',	'{"name":"si"}',	'{"name": "yes"}',	'{"lg-cat": "si", "lg-deu": "Ja", "lg-ell": "αν", "lg-eng": "yes", "lg-fra": "Oui", "lg-ita": "si", "lg-nep": "हो", "lg-spa": "si"}'),
(15361672,	'dd619',	'dd391',	'dd395',	'no',	'si',	'si',	75,	'dd',	'si',	'',	'{"name":"no"}',	'{"name": "no"}',	'{"lg-cat": "no", "lg-deu": "Nein", "lg-ell": "όχι", "lg-eng": "no", "lg-fra": "non", "lg-ita": "No", "lg-nep": "छैन", "lg-spa": "no"}'),
(15361673,	'dd804',	'dd391',	'dd395',	'no',	'si',	'si',	50,	'dd',	'si',	'',	'{"name":"modo"}',	'{"name": "modo"}',	'{"lg-cat": "mode", "lg-deu": "Modus", "lg-ell": "τρόπος", "lg-eng": "mode", "lg-fra": "mode", "lg-ita": "modo", "lg-nep": "मोड", "lg-spa": "modo"}'),
(15361674,	'dd695',	'dd692',	'dd395',	'no',	'si',	'si',	6,	'dd',	'si',	'',	'{"name":"nuevo"}',	'{"name": "new"}',	'{"lg-cat": "Nou", "lg-deu": "Neu", "lg-ell": "νέος", "lg-eng": "New", "lg-fra": "Nouveau", "lg-ita": "Nuovo", "lg-nep": "नयाँ", "lg-spa": "Nuevo"}'),
(15361675,	'dd742',	'dd389',	'dd395',	'no',	'si',	'si',	15,	'dd',	'si',	'',	'{"name":"seleccione_un_fichero"}',	'{"name": "select_a_file"}',	'{"lg-cat": "Seleccione un fitxer", "lg-deu": "Wählen Sie eine Datei", "lg-ell": "Επιλέξτε ένα αρχείο", "lg-eng": "You must select a file", "lg-fra": "Sélectionner un fichier", "lg-ita": "Seleziona un file", "lg-nep": "तपाईंले फाइल चयन गर्नुपर्छ", "lg-spa": "Seleccione un fichero"}'),
(15361676,	'dd1047',	'dd1125',	'dd395',	'no',	'si',	'si',	1,	'dd',	'si',	'null',	'{"name":"latitud"}',	'{"name": "latitude"}',	'{"lg-deu": "Geografische Breite", "lg-ell": "γεωγραφικό πλάτος", "lg-eng": "Latitude", "lg-fra": "Latitude", "lg-ita": "Latitudine", "lg-spa": "Latitud"}'),
(15361677,	'dd925',	'dd922',	'dd91',	'no',	'si',	'si',	5,	'dd',	'no',	'[{"dd9":"dd924"}]',	NULL,	NULL,	'{"lg-cat": "Llistat de categoria laboral / Càrrec", "lg-deu": "Liste der Einträge", "lg-ell": "λίστα", "lg-eng": "List", "lg-fra": "Liste des enregistrements", "lg-ita": "Elenco dei registri", "lg-spa": "Listado de registros"}'),
(15361678,	'dd947',	'dd942',	'dd177',	'no',	'si',	'si',	3,	'dd',	'si',	'',	'',	NULL,	'{"lg-cat": "Nou Tipus d''associació / grup", "lg-deu": "Neue Art von Gesellschaft / Gruppe", "lg-ell": "νέος", "lg-eng": "New Type of association / group", "lg-fra": "Nouveau type d''association / groupe", "lg-ita": "Nuovo tipo di associazione / gruppo", "lg-spa": "Nuevo tipo de asociación / grupo"}'),
(15361679,	'dd901',	'dd898',	'dd91',	'no',	'si',	'si',	5,	'dd',	'si',	'[{"dd9":"dd900"}]',	NULL,	NULL,	'{"lg-cat": "Llistat de llocs de captació", "lg-deu": "Liste der Einträge", "lg-ell": "λίστα", "lg-eng": "List", "lg-fra": "Liste des enregistrements", "lg-ita": "Elenco dei registri", "lg-spa": "Listado de registros"}'),
(15361680,	'dd923',	'dd922',	'dd8',	'no',	'si',	'si',	1,	'dd',	'no',	'',	NULL,	'{"css": {".content_data": {"grid-template-columns": "repeat(10, 1fr)"}}}',	'{"lg-cat": "Valor de la llista", "lg-deu": "Wert aus der Liste", "lg-ell": "αναγνώριση", "lg-eng": "Labor Category / Title", "lg-fra": "Valeur de la liste", "lg-ita": "Valore della lista", "lg-spa": "Valor de la lista"}'),
(15361681,	'dd321',	'dd349',	'dd4',	'no',	'si',	'si',	1,	'dd',	'si',	'',	'',	NULL,	'{"lg-cat": "Patrimoni Immoble", "lg-deu": "Immobiles Kulturerbe", "lg-eng": "Immovable heritage", "lg-eus": "Oondare Jabetza", "lg-fra": "Patrimoine immobilier", "lg-ita": "Patrimonio Immobile", "lg-spa": "Patrimonio Inmueble"}'),
(15361682,	'dd1236',	'dd1229',	'null',	'si',	'si',	'si',	7,	'dd',	'si',	'',	'',	NULL,	'{"lg-spa": "field_year"}'),
(15361683,	'dd328',	'dd906',	'dd395',	'no',	'si',	'si',	7,	'dd',	'si',	'null',	'{"name":"new_fluid_page"}',	'{"name": "new_fluid_page"}',	'{"lg-cat": "Nova pàgina fluïda", "lg-deu": "Neue Seite (flüssiges Layout)", "lg-ell": "Νέα σελίδα ρευστό", "lg-eng": "New fluid page", "lg-fra": "Nouvelle page fluide", "lg-ita": "Nuova pagina regolare", "lg-spa": "Nueva página fluida"}'),
(15361684,	'dd570',	'dd568',	'dd9',	'no',	'si',	'si',	1,	'dd',	'si',	'',	'',	NULL,	'{"lg-cat": "Estat Cinta", "lg-deu": "Zustand des Bandes", "lg-eng": "Tape Status", "lg-fra": "État de la bande", "lg-ita": "Stato Nastro", "lg-spa": "Estado Cinta"}'),
(15361685,	'dd1712',	'dd1125',	'dd395',	'no',	'si',	'si',	4,	'dd',	'si',	'',	'{"name":"georeferenciacion_en_formato"}',	'{"name": "georeferenciacion_en_formato"}',	'{"lg-cat": "Georeferenciació en format Longitud,Latitud ex. 39.46264,-0.37615", "lg-deu": "Georeferenzierung im Format Geografische Länge, Geografische Breite, z.B. 39.46264,-0.37615", "lg-ell": "Γεωαναφορά σε μορφή μήκος, γεωγραφικό πλάτος ex. 39.46264, -0.37615", "lg-eng": "Geocoding in format longitude,latitude, ex. 39.46264,-0.37615", "lg-fra": "Géoréférencement au format Longitude,Latitude ex. 39.46264,-0.37615", "lg-ita": "Georeferenziazione in formato Longitudine, Latitudine ex. 39.46264, -0.37615", "lg-spa": "Georeferenciación en formato Longitud,Latitud ex. 39.46264,-0.37615"}'),
(15361686,	'dd320',	'dd356',	'dd4',	'no',	'si',	'si',	1,	'dd',	'si',	'',	NULL,	NULL,	'{"lg-cat": "Patrimoni Natural", "lg-deu": "Naturerbe", "lg-eng": "Natural heritage", "lg-eus": "Ondare naturala", "lg-fra": "Patrimoine naturel", "lg-ita": "Patrimonio Naturale", "lg-spa": "Patrimonio Natural"}'),
(15361687,	'dd812',	'dd811',	'dd9',	'no',	'si',	'si',	2,	'dd',	'si',	'',	'',	NULL,	'{"lg-cat": "Tipologia bibliogràfica", "lg-deu": "Bibliographische Typologie", "lg-eng": "Bibliographic typology", "lg-fra": "Typologie bibliographique", "lg-ita": "Tipologia bibliografica", "lg-spa": "Tipologia bibliográfica"}'),
(15361688,	'dd28',	'dd20',	'dd183',	'no',	'si',	'si',	5,	'dd',	'no',	'',	'',	NULL,	'{"lg-cat": "Esborrar maquetació", "lg-deu": "Layout löschen", "lg-ell": "σαφής διάταξη", "lg-eng": "Delete layout", "lg-fra": "Disposition claire", "lg-ita": "Cancellare impaginazione", "lg-spa": "Borrar maquetación"}'),
(15361689,	'dd978',	'dd977',	'dd9',	'no',	'si',	'si',	1,	'dd',	'no',	'',	'',	NULL,	'{"lg-cat": "Relació d''aspecte", "lg-deu": "Bildformat", "lg-eng": "Aspect ratio", "lg-fra": "Rapport d''aspect", "lg-ita": "Relazione dell&#039; aspetto", "lg-spa": "Relación de aspecto"}'),
(15361690,	'dd838',	'dd833',	'dd177',	'no',	'si',	'si',	4,	'dd',	'si',	'',	'',	NULL,	'{"lg-cat": "Nou estat de difusió", "lg-deu": "Neuer Zustand der Verbreitung", "lg-eng": "New state of Diffusion", "lg-fra": "Nouveau statut de diffusion", "lg-ita": "Nuovo stato di diffusione", "lg-spa": "Nuevo estado de difusión"}'),
(15361691,	'dd862',	'dd861',	'dd8',	'no',	'si',	'si',	1,	'dd',	'si',	'',	'',	NULL,	'{"lg-cat": "Valor de la llista", "lg-deu": "Wert aus der Liste", "lg-eng": "Gender", "lg-fra": "Valeur de la liste", "lg-ita": "Valore della lista", "lg-spa": "Valor de la lista"}'),
(15361692,	'dd114',	'dd390',	'dd395',	'no',	'si',	'si',	5,	'dd',	'si',	'',	'{"name":"cancelar_la_carga"}',	'{"name": "cancelar_la_carga"}',	'{"lg-cat": "Cancel · lar la càrrega", "lg-deu": "Hochladen abbrechen", "lg-ell": "Ακύρωση μεταφόρτωσης", "lg-eng": "Cancel upload", "lg-fra": "Annuler le prélèvement", "lg-ita": "Cancellare il caricamento", "lg-spa": "Cancelar la carga"}'),
(15361693,	'dd190',	'dd64',	'dd8',	'no',	'si',	'si',	1,	'dd',	'si',	'',	'',	NULL,	'{"lg-cat": "Valor de la llista", "lg-deu": "Wert aus der Liste", "lg-ell": "Τιμή λίστας", "lg-eng": "List value", "lg-fra": "Valeur de la liste", "lg-ita": "Valore della lista", "lg-nep": "सूची मूल्य", "lg-spa": "Valor de la lista"}'),
(15361694,	'dd402',	'dd389',	'dd395',	'no',	'si',	'si',	11,	'dd',	'si',	'',	'{"name":"contenido_no_autorizado"}',	'{"name": "contenido_no_autorizado"}',	'{"lg-cat": "No està autoritzat a veure aquest contingut", "lg-deu": "Sie sind nicht autorisiert, diesen Inhalt anzusehen.", "lg-ell": "Δεν έχετε δικαίωμα να δείτε αυτό το περιεχόμενο", "lg-eng": "You are not authorized to view this content", "lg-fra": "Vous n''êtes pas autorisé à voir ce contenu", "lg-ita": "Non è autorizzato per vedere questo contenuto", "lg-nep": "तपाईं यो सामग्री हेर्न अधिकृत हुनुहुन्न", "lg-spa": "Usted no está autorizado a ver este contenido"}'),
(15361695,	'dd743',	'dd389',	'dd395',	'no',	'si',	'si',	16,	'dd',	'si',	'',	'{"name":"abandonando_esta_pagina"}',	'{"name": "abandonando_esta_pagina"}',	'{"lg-cat": "Abandonant aquesta pàgina vostè perdrà les dades no salvats", "lg-deu": "Beim Verlassen dieser Seite gehen ungespeicherte Daten verloren.", "lg-ell": "Φεύγοντας από αυτή τη σελίδα θα χάσετε τα δεδομένα που δεν έχετε αποθηκεύσει", "lg-eng": "Leaving this page you will lose unsaved data", "lg-fra": "En quittant cette page, vous perdrez les données non sauvegardées", "lg-ita": "Abandonando questa pagina perderai i dati che non hai salvato", "lg-nep": "यो पृष्ठ छोड्दा तपाईंले बचत नगरिएको डाटा गुमाउनु हुनेछ", "lg-spa": "Abandonando esta página perderá los datos que no haya salvado"}'),
(15361696,	'dd588',	'dd391',	'dd395',	'no',	'si',	'si',	69,	'dd',	'si',	'',	'{"name":"total_parrafos"}',	'{"name": "total_parrafos"}',	'{"lg-cat": "Total paràgrafs", "lg-deu": "Total Paragraphen", "lg-ell": "Σύνολο των παραγράφων", "lg-eng": "Total paragraphs", "lg-fra": "Total des paragraphes", "lg-ita": "Totale paragrafi", "lg-nep": "कुल अनुच्छेदहरू", "lg-spa": "Total párrafos"}'),
(15361697,	'dd589',	'dd391',	'dd395',	'no',	'si',	'si',	68,	'dd',	'si',	'',	'{"name":"solo_nuevas"}',	'{"name": "solo_nuevas"}',	'{"lg-cat": "Només noves", "lg-deu": "Nur Neue", "lg-ell": "μόνο νέα", "lg-eng": "New only", "lg-fra": "Nouveau seulement", "lg-ita": "Solo nuove", "lg-nep": "नयाँ मात्र", "lg-spa": "Sólo nuevas"}'),
(15361698,	'dd110',	'dd540',	'dd395',	'no',	'si',	'si',	5,	'dd',	'si',	'',	'{
  "name": "contenido_actual"
}',	'{"name": "contenido_actual"}',	'{"lg-cat": "Contingut actual", "lg-deu": "aktueller Inhalt", "lg-ell": "περιεχόμενα", "lg-eng": "Actual content", "lg-fra": "Contenu actuel", "lg-ita": "Contenuto attuale", "lg-nep": "वास्तविक सामग्री", "lg-spa": "Contenido actual"}'),
(15361699,	'dd902',	'dd898',	'dd247',	'no',	'si',	'si',	2,	'dd',	'no',	'',	'',	NULL,	'{"lg-cat": "Projecte", "lg-deu": "Projekt", "lg-ell": "Έργο", "lg-eng": "Project", "lg-fra": "Projet", "lg-ita": "Progetto", "lg-spa": "Proyecto"}'),
(15361700,	'dd68',	'dd207',	'dd4',	'no',	'si',	'si',	6,	'dd',	'no',	'',	'',	'null',	'{"lg-cat": "Llistes de valors", "lg-deu": "Wertelisten", "lg-ell": "Λίστες αξία", "lg-eng": "List of values", "lg-fra": "Listes de valeurs mobilières", "lg-ita": "Liste dei valori", "lg-nep": "मानहरूको सूची", "lg-spa": "Listas de valores"}'),
(15361701,	'dd219',	'dd539',	'dd395',	'no',	'si',	'si',	8,	'dd',	'si',	'',	'{
  "name": "nombre_automatico"
}',	'{"name": "nombre_automatico"}',	'{"lg-cat": "Nom automàtic", "lg-deu": "Automatischer Name", "lg-ell": "αυτόματη Όνομα", "lg-eng": "Automatic Name", "lg-fra": "Nom automatique", "lg-ita": "Nome automatico", "lg-spa": "Nombre automático"}'),
(15361702,	'dd221',	'dd539',	'dd395',	'no',	'si',	'si',	9,	'dd',	'si',	'',	'{
  "name": "formato_incorrecto"
}',	'{"name": "formato_incorrecto"}',	'{"lg-cat": "Format incorrecte", "lg-deu": "Falsches Format", "lg-ell": "δύσμορφος", "lg-eng": "Wrong format", "lg-fra": "Format incorrect", "lg-ita": "Formato sbagliato", "lg-spa": "Formato incorrecto"}'),
(15361703,	'dd724',	'dd391',	'dd395',	'no',	'si',	'si',	16,	'dd',	'si',	'',	'{"name":"calidad"}',	'{"name": "calidad"}',	'{"lg-cat": "Qualitat", "lg-deu": "Qualität", "lg-ell": "ποιότητα", "lg-eng": "Quality", "lg-fra": "Qualité", "lg-ita": "Qualità", "lg-spa": "Calidad"}'),
(15361704,	'dd21',	'dd20',	'dd8',	'no',	'si',	'si',	1,	'dd',	'no',	'',	NULL,	NULL,	'{"lg-cat": "Layout", "lg-deu": "Layout", "lg-ell": "σχέδιο", "lg-eng": "Layout", "lg-fra": "Mise en page", "lg-ita": "Impaginazione", "lg-spa": "Maquetación"}'),
(15361705,	'dd988',	'dd985',	'dd91',	'no',	'si',	'si',	4,	'dd',	'si',	'[{"dd9":"dd987"}]',	'',	NULL,	'{"lg-cat": "Llistat de registres", "lg-deu": "Liste der Einträge", "lg-eng": "Record listing", "lg-fra": "Liste des enregistrements", "lg-ita": "Elenco dei registri", "lg-spa": "Listado de registros"}'),
(15361706,	'dd179',	'dd128',	'dd177',	'no',	'si',	'si',	6,	'dd',	'si',	'',	'',	NULL,	'{"lg-cat": "Nou usuari", "lg-deu": "Neuer Benutzer", "lg-ell": "νέος χρήστης", "lg-eng": "New user", "lg-fra": "Nouvel utilisateur", "lg-ita": "Nuovo utente", "lg-spa": "Nuevo usuario"}'),
(15361707,	'dd210',	'dd209',	'dd9',	'no',	'si',	'si',	1,	'dd',	'si',	'',	'',	NULL,	'{"lg-cat": "Tipologia d''activitat", "lg-deu": "Typologie der Aktivität", "lg-eng": "Type of activities", "lg-fra": "Typologie de l''activité", "lg-ita": "Tipologia di attività", "lg-spa": "Tipología de actividad"}'),
(15361708,	'dd987',	'dd986',	'dd9',	'no',	'si',	'si',	1,	'dd',	'no',	'',	'',	NULL,	'{"lg-cat": "Estàndard del Color Audivosiual", "lg-deu": "Farbstandard Audioviduelle Medien", "lg-eng": "Auditory Color Standard", "lg-fra": "Standard de couleurs pour l''audiovisuel", "lg-ita": "Standard del Colore Audiovisivo", "lg-spa": "Estándar del Color Audivosiual"}'),
(15361709,	'dd981',	'dd976',	'dd183',	'no',	'si',	'si',	5,	'dd',	'si',	'',	'',	NULL,	'{"lg-cat": "Esborrar relació d''aspecte", "lg-deu": "Bildformat löschen", "lg-eng": "Clear aspect ratio", "lg-fra": "Supprimer le rapport d''aspect", "lg-ita": "Cancellare relazione dell&#039; aspetto", "lg-spa": "Borrar relación de aspecto"}'),
(15361710,	'dd961',	'dd957',	'dd177',	'no',	'si',	'si',	4,	'dd',	'si',	'',	'',	NULL,	'{"lg-cat": "Nou Format de l''original AV", "lg-deu": "Neues Format des AV-Originals", "lg-eng": "New Original AV Format", "lg-fra": "Nouveau format AV original", "lg-ita": "Nuovo Formato dell&#039; originale AV", "lg-spa": "Nuevo Formato del original AV"}'),
(15361711,	'dd1057',	'dd1028',	'null',	'si',	'si',	'si',	3,	'dd',	'no',	'',	'',	NULL,	'{"lg-spa": "stats_line"}'),
(15361712,	'dd983',	'dd976',	'dd247',	'no',	'si',	'si',	2,	'dd',	'no',	'',	'',	NULL,	'{"lg-cat": "Projecte", "lg-deu": "Projekt", "lg-eng": "Filter", "lg-fra": "Projet", "lg-ita": "Progetto", "lg-spa": "Proyecto"}'),
(15361713,	'dd966',	'dd957',	'dd183',	'no',	'si',	'si',	5,	'dd',	'si',	'',	'',	NULL,	'{"lg-cat": "Esborrar Format de l''original AV", "lg-deu": "Originalformat AV löschen", "lg-eng": "Clear AV Original Format", "lg-fra": "Supprimer le format original de l''AV", "lg-ita": "Cancellare Formato dell&#039; originale AV", "lg-spa": "Borrar Formato del original AV"}'),
(15361714,	'dd995',	'dd875',	'dd177',	'no',	'si',	'si',	4,	'dd',	'no',	'',	'',	NULL,	'{"lg-cat": "Nova qualitat de la cinta original", "lg-deu": "Neue Qualität des Originalbandes", "lg-eng": "New quality of the original tape", "lg-fra": "Nouvelle qualité de la bande originale", "lg-ita": "Nuova qualità del nastro originale", "lg-spa": "Nueva Calidad de la cinta original"}'),
(15361715,	'dd989',	'dd985',	'dd247',	'no',	'si',	'si',	2,	'dd',	'no',	'',	'',	NULL,	'{"lg-cat": "Projecte", "lg-deu": "Projekt", "lg-eng": "Filter", "lg-fra": "Projet", "lg-ita": "Progetto", "lg-spa": "Proyecto"}'),
(15361716,	'dd991',	'dd985',	'dd183',	'no',	'si',	'si',	5,	'dd',	'si',	'',	'',	NULL,	'{"lg-cat": "Esborrar estàndard de color audiovisual", "lg-deu": "Farbstandard Audiovisuelle Medien löschen", "lg-eng": "Clear audiovisual color standard", "lg-fra": "Supprimer la norme de couleur audiovisuelle", "lg-ita": "Cancellare Standard del Colore Audiovisivo", "lg-spa": "Borrar estándar de color audiovisual"}'),
(15361717,	'dd924',	'dd923',	'dd9',	'no',	'si',	'si',	2,	'dd',	'si',	'',	NULL,	'{"css": {".wrapper_component": {"grid-column": "span 5"}}}',	'{"lg-cat": "Categoria laboral / Càrrec", "lg-deu": "Berufsgruppe / Titel", "lg-ell": "Κατηγορία εργασίας / Τίτλος", "lg-eng": "Labor Category / Title", "lg-fra": "Catégorie d''emploi / poste", "lg-ita": "Categoria Lavorativa / Responsabile", "lg-spa": "Categoria Laboral / Cargo"}'),
(15361718,	'dd473',	'dd391',	'dd395',	'no',	'si',	'si',	72,	'dd',	'si',	'',	'{"name":"relaciones"}',	'{"name": "relations"}',	'{"lg-ara": "علاقات", "lg-cat": "Relacions", "lg-deu": "Beziehungen", "lg-ell": "σχέσεων", "lg-eng": "Relations", "lg-fra": "Relations", "lg-ita": "Relazioni", "lg-nep": "सम्बन्धहरू", "lg-spa": "Relaciones"}'),
(15361719,	'dd725',	'dd391',	'dd395',	'no',	'si',	'si',	17,	'dd',	'si',	'',	'{"name":"fichero"}',	'{"name": "fichero"}',	'{"lg-cat": "Fitxer", "lg-deu": "Datei", "lg-ell": "αρχείο", "lg-eng": "File", "lg-fra": "Fichier", "lg-ita": "File", "lg-nep": "फाइल", "lg-spa": "Fichero"}'),
(15361720,	'dd727',	'dd391',	'dd395',	'no',	'si',	'si',	19,	'dd',	'si',	'',	'{"name":"descargar"}',	'{"name": "download"}',	'{"lg-cat": "Descarregar", "lg-deu": "Herunterladen", "lg-ell": "κατεβάσετε", "lg-eng": "Download", "lg-fra": "Télécharger", "lg-ita": "Descrizione", "lg-nep": "डाउनलोड गर्नुहोस्", "lg-spa": "Descargar"}'),
(15361721,	'dd218',	'dd391',	'dd395',	'no',	'si',	'si',	11,	'dd',	'si',	'',	'{"name":"registros_visualizados"}',	'{"name": "registros_visualizados"}',	'{"lg-cat": "Registres visualitzats", "lg-deu": "Visualisierte Einträge", "lg-ell": "εμφανίζονται τα αρχεία", "lg-eng": "Records being browsed", "lg-fra": "Enregistrements visualisés", "lg-ita": "Registri visualizzati", "lg-nep": "रेकर्डहरू ब्राउज गरिँदै", "lg-spa": "Registros visualizados"}'),
(15361722,	'dd728',	'dd391',	'dd395',	'no',	'si',	'si',	20,	'dd',	'si',	'',	'{"name":"subir"}',	'{"name": "upload"}',	'{"lg-cat": "Pujar fitxer", "lg-deu": "Datei hochladen", "lg-ell": "upload αρχείου", "lg-eng": "Upload", "lg-fra": "Télécharger le fichier", "lg-ita": "Caricare file", "lg-spa": "Subir fichero"}'),
(15361723,	'dd729',	'dd391',	'dd395',	'no',	'si',	'si',	21,	'dd',	'si',	'',	'{"name":"borrar"}',	'{"name": "delete"}',	'{"lg-cat": "Esborrar", "lg-deu": "Löschen", "lg-ell": "διαγράψετε", "lg-eng": "Delete", "lg-fra": "Supprimer", "lg-ita": "Cancellare", "lg-nep": "मेटाउन", "lg-spa": "Borrar"}'),
(15361724,	'dd734',	'dd391',	'dd395',	'no',	'si',	'si',	24,	'dd',	'si',	'',	'{"name":"procesando"}',	'{"name": "processing"}',	'{"lg-cat": "Processant", "lg-deu": "Wird verarbeitet", "lg-ell": "επεξεργασία", "lg-eng": "Processing", "lg-fra": "Traitement", "lg-ita": "Processando", "lg-spa": "Procesando"}'),
(15361725,	'dd855',	'dd391',	'dd395',	'no',	'si',	'si',	54,	'dd',	'si',	'',	'{
  "name": "ir_al_listado"
}',	'{"name": "ir_al_listado"}',	'{"lg-cat": "Anar a llistat", "lg-deu": "Gehe zur Liste", "lg-ell": "Πηγαίνετε στη λίστα", "lg-eng": "Go to list", "lg-fra": "Aller à la liste", "lg-ita": "Andare all''elenco", "lg-nep": "सूचीमा जानुहोस्", "lg-spa": "Ir al listado"}'),
(15361726,	'dd474',	'dd391',	'dd395',	'no',	'si',	'si',	71,	'dd',	'si',	'',	'{"name":"heramientas"}',	'{"name": "heramientas"}',	'{"lg-cat": "Eines", "lg-deu": "Werkzeuge", "lg-ell": "εργαλεία", "lg-eng": "Tools", "lg-fra": "Outils", "lg-ita": "Strumenti", "lg-nep": "उपकरणहरू", "lg-spa": "Herramientas"}'),
(15361727,	'dd171',	'dd391',	'dd395',	'no',	'si',	'si',	8,	'dd',	'si',	'',	'{"name":"donde"}',	'{"name": "donde"}',	'{"lg-cat": "A on", "lg-deu": "Wo", "lg-ell": "όπου", "lg-eng": "Where", "lg-fra": "Où ", "lg-ita": "Dove", "lg-nep": "कहाँ", "lg-spa": "Dónde"}'),
(15361728,	'dd654',	'dd637',	'dd11',	'no',	'si',	'si',	7,	'dd',	'no',	'[{"dd6":"dd128"},{"dd9":"dd132"}]',	'{"css":{".wrap_component":{"mixin":[".vertical"],"style":{"width":"55%"}}}}',	NULL,	'{"lg-cat": "Usuari", "lg-deu": "Benutzername", "lg-eng": "User", "lg-fra": "Utilisateur", "lg-ita": "Utente", "lg-spa": "Usuario"}'),
(15361729,	'dd959',	'dd958',	'dd9',	'no',	'si',	'si',	1,	'dd',	'no',	'',	'',	NULL,	'{"lg-cat": "Format de l''original AV", "lg-deu": "Originalformat AV", "lg-eng": "Original format AV", "lg-fra": "Format original AV", "lg-ita": "Formato dell&#039; originale AV", "lg-spa": "Formato del original AV"}'),
(15361730,	'dd880',	'dd875',	'dd183',	'no',	'si',	'si',	3,	'dd',	'si',	'',	'',	NULL,	'{"lg-cat": "Esborrar qualitat de la cinta original", "lg-deu": "Qualität des Originalbandes löschen", "lg-eng": "Erase original tape quality", "lg-fra": "Supprimer la qualité de la bande originale", "lg-ita": "Cancellare qualità del nastro originale", "lg-spa": "Borrar calidad de la cinta original"}'),
(15361731,	'dd887',	'dd882',	'dd183',	'no',	'si',	'si',	4,	'dd',	'si',	'',	'',	NULL,	'{"lg-cat": "Esborrar", "lg-deu": "Löschen", "lg-ell": "διαγράψετε", "lg-eng": "Delete Profession", "lg-fra": "Supprimer", "lg-ita": "Cancellare", "lg-spa": "Borrar"}'),
(15361732,	'dd928',	'dd922',	'dd183',	'no',	'si',	'si',	4,	'dd',	'si',	'',	'',	NULL,	'{"lg-cat": "Esborrar categoria laboral / Càrrec", "lg-deu": "Berufsgruppe / Titel löschen", "lg-ell": "διαγράψετε", "lg-eng": "Delete Labor Category / Title", "lg-fra": "Supprimer la catégorie d''emploi / le poste", "lg-ita": "Cancellare Categoria Lavorativa / Responsabile", "lg-spa": "Borrar Categoría Laboral / Cargo"}'),
(15361733,	'dd957',	'dd137',	'dd6',	'no',	'si',	'si',	17,	'dd',	'no',	'[{"dd626":"dd963"}]',	'',	NULL,	'{"lg-cat": "Format de l''original AV", "lg-deu": "Originalformat AV", "lg-eng": "Original format AV", "lg-fra": "Format original AV", "lg-ita": "Formato dell&#039; originale AV", "lg-spa": "Formato del original AV"}'),
(15361734,	'dd875',	'dd137',	'dd6',	'no',	'si',	'si',	19,	'dd',	'si',	'[{"dd626":"dd963"}]',	'',	NULL,	'{"lg-cat": "Qualitat de la cinta original", "lg-deu": "Qualität des Originalbandes", "lg-eng": "Original tape quality", "lg-fra": "Qualité de la bande originale", "lg-ita": "Qualità del nastro originale", "lg-spa": "Calidad de la cinta original"}'),
(15361735,	'dd567',	'dd137',	'dd6',	'no',	'si',	'si',	21,	'dd',	'no',	'[{"dd626":"dd963"}]',	'',	NULL,	'{"lg-cat": "Estat Cinta", "lg-deu": "Zustand des Bandes", "lg-eng": "Tape Status", "lg-fra": "État de la bande", "lg-ita": "Stato Nastro", "lg-spa": "Estado Cinta"}'),
(15361736,	'dd889',	'dd137',	'dd6',	'no',	'si',	'si',	15,	'dd',	'no',	'[{"dd626":"dd963"}]',	'',	NULL,	'{"lg-cat": "Qualitat del contingut", "lg-deu": "Qualität des Inhaltes", "lg-eng": "Quality of content", "lg-fra": "Qualité du contenu", "lg-ita": "Qualità del contenuto", "lg-spa": "Calidad del contenido"}'),
(15361737,	'dd279',	'dd276',	'dd395',	'no',	'si',	'si',	3,	'dd',	'si',	NULL,	'{"name":"etiqueta_revisar"}',	'{"name": "label_to_review"}',	'{"lg-cat": "A revisar", "lg-deu": "Durch das Revidieren", "lg-ell": "από επανεξέταση", "lg-eng": "To review", "lg-fra": "A examiner", "lg-ita": "Per controllare", "lg-nep": "समीक्षा गर्न", "lg-spa": "Por revisar"}'),
(15361738,	'dd835',	'dd834',	'dd9',	'no',	'si',	'si',	1,	'dd',	'si',	'',	'',	NULL,	'{"lg-cat": "Sí / No / Restringit", "lg-deu": "ja/nein/eingeschränkt", "lg-eng": "yes/no/restricted", "lg-fra": "oui/non/restreint", "lg-ita": "si/no/limitato", "lg-spa": "si/no/restringido"}'),
(15361739,	'dd277',	'dd276',	'dd395',	'no',	'si',	'si',	1,	'dd',	'si',	NULL,	'{"name":"etiqueta_normal"}',	'{"name": "label_normal"}',	'{"lg-cat": "Normal", "lg-deu": "Normal", "lg-ell": "κανονικόςNormal", "lg-eng": "Normal", "lg-fra": "Normal", "lg-ita": "Normale", "lg-nep": "सामान्य", "lg-spa": "Normal"}'),
(15361740,	'dd475',	'dd469',	'dd247',	'no',	'si',	'si',	2,	'dd',	'no',	NULL,	NULL,	NULL,	'{"lg-deu": "Projekt", "lg-eng": "Filter", "lg-fra": "Projet", "lg-ita": "Progetto", "lg-spa": "Proyecto"}'),
(15361741,	'dd964',	'dd1313',	'dd177',	'no',	'si',	'si',	3,	'dd',	'no',	'',	'',	NULL,	'{"lg-cat": "Nou", "lg-deu": "Neu", "lg-eng": "New", "lg-fra": "Nouveau", "lg-ita": "Nuovo", "lg-spa": "Nuevo"}'),
(15361742,	'dd25',	'dd20',	'dd91',	'no',	'si',	'si',	2,	'dd',	'no',	'[{"dd9":"dd29"},{"dd9":"dd61"},{"dd438":"dd23"}]',	'',	NULL,	'{"lg-cat": "Llista", "lg-deu": "Liste", "lg-ell": "λίστα", "lg-eng": "List", "lg-fra": "Lista", "lg-ita": "Elenco", "lg-spa": "Lista"}'),
(15361743,	'dd765',	'dd391',	'dd395',	'no',	'si',	'si',	43,	'dd',	'si',	'',	'{"name":"indexaciones"}',	'{"name": "indexings"}',	'{"lg-ara": "الفهارس", "lg-cat": "indexacions", "lg-deu": "Indexierungen", "lg-ell": "τιμαριθμικές αναπροσαρμογές", "lg-eng": "indexings", "lg-fra": "Indexations", "lg-ita": "Indicizzazioni", "lg-nep": "अनुक्रमणिका", "lg-spa": "indexaciones"}'),
(15361744,	'dd220',	'dd537',	'dd395',	'no',	'si',	'si',	4,	'dd',	'si',	'',	'{
  "name": "tamano_archivo"
}',	'{"name": "tamano_archivo"}',	'{"lg-cat": "Pes de l''arxiu", "lg-deu": "Dateigrösse", "lg-ell": "Μέγεθος αρχείου", "lg-eng": "File Size", "lg-fra": "Taille de l''archive", "lg-ita": "Grandezza dell''archivio", "lg-spa": "Tamaño del archivo"}'),
(15361745,	'dd315',	'dd389',	'dd395',	'no',	'si',	'si',	22,	'dd',	'si',	NULL,	'{"name":"componente_en_uso"}',	'{"name": "component_in_use"}',	'{"lg-cat": "Atenció: L''usuari %s està usant aquest camp. Espère al fet que l''usuari acabi l''edició.", "lg-deu": "Achtung: Benutzer %s verwendet dieses Feld. Bitte warten Sie, bis er/sie die Bearbeitung beendet hat.", "lg-ell": "Προσοχή: Ο χρήστης %s χρησιμοποιεί αυτό το πεδίο. Παρακαλώ περιμένετε να ολοκληρώσετε την επεξεργασία.", "lg-eng": "Warning: User %s is using this field. Please, wait for the user to finish editing.", "lg-fra": "Attention : L''utilisateur %s utilise ce champ. Veuillez attendre qu''il ait terminé son travail d''édition.", "lg-ita": "Attenzione: l''utente sta usando questo campo. Per favore, aspetta che termina la modifica.", "lg-nep": "चेतावनी: प्रयोगकर्ता %s ले यो क्षेत्र प्रयोग गरिरहेको छ। कृपया, प्रयोगकर्ताले सम्पादन समाप्त गर्नको लागि पर्खनुहोस्।", "lg-spa": "Atención: El usuario %s está usando este campo. Por favor, espere a que termine la edición."}'),
(15361746,	'dd209',	'dd208',	'dd8',	'no',	'si',	'si',	1,	'dd',	'si',	'',	'',	NULL,	'{"lg-cat": "Valor de la llista", "lg-deu": "Wert aus der Liste", "lg-eng": "Type of activities", "lg-fra": "Valeur de la liste", "lg-ita": "Valore della lista", "lg-spa": "Valor de la lista"}'),
(15361747,	'dd1118',	'dd1117',	'dd8',	'no',	'si',	'si',	1,	'dd',	'si',	'',	'',	NULL,	'{"lg-cat": "Valor de la llista", "lg-deu": "Wert aus der Liste", "lg-eng": "List value", "lg-fra": "Valeur de la liste", "lg-ita": "Valore della lista", "lg-spa": "Valor de la lista"}'),
(15361748,	'dd894',	'dd889',	'dd177',	'no',	'si',	'si',	4,	'dd',	'si',	'',	'',	NULL,	'{"lg-cat": "Nova qualitat", "lg-deu": "Neue Qualtität", "lg-eng": "New Quality", "lg-fra": "Nouvelle qualité", "lg-ita": "Nuova qualità", "lg-spa": "Nueva calidad"}'),
(15361749,	'dd876',	'dd879',	'dd9',	'no',	'si',	'si',	2,	'dd',	'no',	'',	'',	NULL,	'{"lg-cat": "Qualitat de la cinta original", "lg-deu": "Qualität des Originalbandes", "lg-eng": "Original tape quality", "lg-fra": "Qualité de la bande originale", "lg-ita": "Qualità del nastro originale", "lg-spa": "Calidad de la cinta original"}'),
(15361750,	'dd1063',	'dd42',	'dd247',	'no',	'si',	'si',	3,	'dd',	'no',	'null',	'',	NULL,	'{"lg-cat": "Projecte", "lg-deu": "Projekt", "lg-ell": "Έργο", "lg-eng": "Project", "lg-fra": "Projet", "lg-ita": "Progetto", "lg-spa": "Proyecto"}'),
(15361751,	'dd1020',	'dd1052',	'dd6',	'no',	'si',	'si',	3,	'dd',	'no',	'[{"dd626":"dd963"}]',	'',	NULL,	'{"lg-cat": "Tipus de server", "lg-deu": "Typ des Dienstes", "lg-ell": "τύπος Υπηρεσία", "lg-eng": "Service type", "lg-fra": "Type de service", "lg-ita": "Tipo di servizio", "lg-spa": "Tipo de servicio"}'),
(15361752,	'dd495',	'dd276',	'dd395',	'no',	'si',	'si',	7,	'dd',	'si',	'',	'{
  "name": "eliminar_etiqueta"
}',	'{"name": "eliminar_etiqueta"}',	'{"lg-cat": "Eliminar etiqueta?", "lg-deu": "Label löschen?", "lg-ell": "Διαγραφή ετικέτας;", "lg-eng": "Delete label?", "lg-fra": "Supprimer l''étiquette ?", "lg-ita": "Eliminare etichetta", "lg-nep": "लेबल मेट्ने हो?", "lg-spa": "¿Eliminar etiqueta?"}'),
(15361753,	'dd1212',	'dd1209',	'dd1041',	'no',	'si',	'si',	1,	'dd',	'si',	'[{"dd722":"dd732"}]',	'',	NULL,	'{"lg-deu": "Posterframe", "lg-eng": "Posterframe", "lg-fra": "Cadre de l''affiche", "lg-spa": "Posterframe"}'),
(15361754,	'dd856',	'dd391',	'dd395',	'no',	'si',	'si',	55,	'dd',	'si',	'',	'{"name":"modelos"}',	'{"name": "modelos"}',	'{"lg-cat": "models", "lg-deu": "Modelle", "lg-ell": "μοντέλα", "lg-eng": "models", "lg-fra": "modèles", "lg-ita": "Modelli", "lg-nep": "मोडेलहरू", "lg-spa": "modelos"}'),
(15361755,	'dd858',	'dd391',	'dd395',	'no',	'si',	'si',	57,	'dd',	'si',	'',	'{"name":"terminos"}',	'{"name": "terms"}',	'{"lg-cat": "Termes", "lg-deu": "Begriffe", "lg-ell": "ονόματα", "lg-eng": "Terms", "lg-fra": "Conditions d''utilisation", "lg-ita": "Termini", "lg-nep": "सर्तहरू", "lg-spa": "Términos"}'),
(15361756,	'dd398',	'dd391',	'dd395',	'no',	'si',	'si',	12,	'dd',	'si',	'',	'{"name":"secciones"}',	'{"name": "sections"}',	'{"lg-cat": "seccions", "lg-deu": "Sektionen", "lg-ell": "τμήματα", "lg-eng": "sections", "lg-fra": "Sections", "lg-ita": "sezioni", "lg-nep": "खण्डहरू", "lg-spa": "secciones"}'),
(15361757,	'dd881',	'dd391',	'dd395',	'no',	'si',	'si',	58,	'dd',	'si',	'',	'{"name":"idioma"}',	'{"name": "language"}',	'{"lg-cat": "llengua", "lg-deu": "Sprache", "lg-ell": "γλώσσα", "lg-eng": "Language", "lg-fra": "Langue", "lg-ita": "Lingua", "lg-nep": "भाषा", "lg-spa": "idioma"}'),
(15361758,	'dd94',	'dd391',	'dd395',	'no',	'si',	'si',	2,	'dd',	'si',	'',	'{"name":"por_usuario"}',	'{"name": "by_user"}',	'{"lg-cat": "per usuari", "lg-deu": "Durch den Benutzer", "lg-ell": "χρήστη", "lg-eng": "by user", "lg-fra": "par utilisateur", "lg-ita": "per utente", "lg-nep": "प्रयोगकर्ता द्वारा", "lg-spa": "por usuario"}'),
(15361759,	'dd280',	'dd276',	'dd395',	'no',	'si',	'si',	4,	'dd',	'si',	NULL,	'{
  "name": "etiqueta_salvar_texto"
}',	'{"name": "etiqueta_salvar_texto"}',	'{"lg-cat": "i guarde el text", "lg-deu": "und Text speichern", "lg-ell": "και να αποθηκεύσετε το κείμενο", "lg-eng": "and saved text", "lg-fra": "et sauvegarder le texte", "lg-ita": "e salva il testo", "lg-spa": "y guarde el texto"}'),
(15361760,	'dd293',	'dd292',	'dd8',	'no',	'si',	'si',	1,	'dd',	'no',	NULL,	'',	NULL,	'{"lg-cat": "Tipologia de nombre normalitzat", "lg-deu": "Typologie der Standardnummer", "lg-eng": "Type of standard number", "lg-fra": "Typologie de numéro standard", "lg-ita": "Tipologia di numero normalizzato", "lg-spa": "Tipología de número normalizado"}'),
(15361761,	'dd296',	'dd293',	'dd9',	'no',	'si',	'si',	1,	'dd',	'no',	NULL,	'',	NULL,	'{"lg-cat": "Tipologia de nombre normalitzat", "lg-deu": "Typologie der Standardnummer", "lg-eng": "Type of standard number", "lg-fra": "Typologie de numéro standard", "lg-ita": "Tipologia di numero normalizzato", "lg-spa": "Tipología de número normalizado"}'),
(15361762,	'dd297',	'dd292',	'dd177',	'no',	'si',	'si',	4,	'dd',	'no',	NULL,	'',	NULL,	'{"lg-cat": "Nova tipologia", "lg-deu": "Neue Standardnummer-Typologie", "lg-eng": "New tipology", "lg-fra": "Nouvelle typologie des numéros standards", "lg-ita": "Nuova Tipologia di numero normalizzato", "lg-spa": "Nueva tipología de número normalizado"}'),
(15361763,	'dd916',	'dd911',	'dd177',	'no',	'si',	'si',	4,	'dd',	'no',	'',	'',	NULL,	'{"lg-cat": "Nova tipologia", "lg-deu": "Neue Typologie", "lg-eng": "New typology", "lg-fra": "Nouvelle typologie", "lg-ita": "Nuova tipologia", "lg-spa": "Nueva tipología"}'),
(15361764,	'dd348',	'dd45',	'dd18',	'no',	'si',	'si',	1,	'dd',	'si',	NULL,	NULL,	NULL,	'{"lg-cat": "Publicació a la web", "lg-eng": "Web publication", "lg-spa": "Publicación en la web"}'),
(15361765,	'dd1216',	'dd1209',	'dd1041',	'no',	'si',	'si',	4,	'dd',	'si',	'[{"dd11":"dd969"}]',	'',	NULL,	'{"lg-deu": "Format", "lg-eng": "Format", "lg-fra": "Format", "lg-spa": "Formato"}'),
(15361766,	'dd300',	'dd299',	'dd8',	'no',	'si',	'si',	1,	'dd',	'si',	NULL,	NULL,	NULL,	'{"lg-cat": "Identificació", "lg-deu": "Identifizierung", "lg-eng": "Identification", "lg-fra": "Identification", "lg-ita": "Identificazione", "lg-spa": "Identificación"}'),
(15361767,	'dd304',	'dd300',	'dd9',	'no',	'si',	'si',	1,	'dd',	'si',	NULL,	NULL,	NULL,	'{"lg-cat": "Tipus d''entitat", "lg-deu": "Typ der Einheit", "lg-eng": "Entity tipology", "lg-fra": "Type d''organisme", "lg-ita": "Tipo d&#039; entità", "lg-spa": "Tipo de entidad"}'),
(15361768,	'dd306',	'dd299',	'dd91',	'no',	'si',	'si',	3,	'dd',	'no',	'[{"dd9":"dd304"}]',	NULL,	NULL,	'{"lg-cat": "Llistat", "lg-deu": "Liste", "lg-eng": "List", "lg-fra": "Listé", "lg-ita": "Elenco", "lg-spa": "Llistado"}'),
(15361769,	'dd281',	'dd276',	'dd395',	'no',	'si',	'si',	5,	'dd',	'si',	NULL,	'{
  "name": "etiquetas_perdidas"
}',	'{"name": "etiquetas_perdidas"}',	'{"lg-cat": "Etiquetes perdudes", "lg-deu": "Verlorene Labels", "lg-ell": "έχασε ετικέτες", "lg-eng": "Missing tags", "lg-fra": "Libellés perdus", "lg-ita": "Etichette perse", "lg-nep": "ट्यागहरू छुटेका छन्", "lg-spa": "Etiquetas perdidas"}'),
(15361770,	'dd113',	'dd390',	'dd395',	'no',	'si',	'si',	4,	'dd',	'si',	'',	'{"name":"comenzar_la_carga"}',	'{"name": "comenzar_la_carga"}',	'{"lg-cat": "Començar la càrrega", "lg-deu": "Hochladen starten", "lg-ell": "Ξεκινήστε τη φόρτωση", "lg-eng": "Start upload", "lg-fra": "Commencer le téléchargement", "lg-ita": "Iniziare il caricamento", "lg-spa": "Comenzar la carga"}'),
(15361771,	'dd1136',	'dd1132',	'dd91',	'no',	'si',	'si',	5,	'dd',	'si',	'[{"dd9":"dd1135"}]',	'',	NULL,	'{"lg-cat": "Llistat", "lg-deu": "Liste", "lg-ell": "λίστα", "lg-eng": "List", "lg-fra": "Liste", "lg-ita": "Elenco", "lg-spa": "List"}'),
(15361772,	'dd310',	'dd309',	'dd9',	'no',	'si',	'si',	1,	'dd',	'si',	NULL,	NULL,	NULL,	'{"lg-cat": "Espai de color", "lg-deu": "Farbbereich", "lg-eng": "Color space", "lg-fra": "Espace couleur", "lg-ita": "Spazio del Colore", "lg-spa": "Espacio de color"}'),
(15361773,	'dd312',	'dd307',	'dd91',	'no',	'si',	'si',	3,	'dd',	'no',	'[{"dd9":"dd310"}]',	NULL,	NULL,	'{"lg-cat": "LListat", "lg-deu": "Liste", "lg-eng": "List", "lg-fra": "Liste", "lg-ita": "Elenco", "lg-spa": "Listado"}'),
(15361774,	'dd99',	'dd90',	'dd8',	'no',	'si',	'si',	1,	'dd',	'no',	'',	'',	NULL,	'{"lg-cat": "Procés", "lg-deu": "Prozess", "lg-eng": "Process", "lg-fra": "Processus", "lg-ita": "Processo", "lg-spa": "Proceso"}'),
(15361775,	'dd256',	'dd229',	'dd225',	'no',	'si',	'si',	2,	'dd',	'no',	'[{"dd225":"dd133"}]',	'',	NULL,	'{"lg-cat": "Contrasenya", "lg-deu": "Passwort", "lg-ell": "κωδικό πρόσβασης", "lg-eng": "Password", "lg-fra": "Mot de passe", "lg-ita": "Password", "lg-nep": "पासवर्ड", "lg-spa": "Contraseña"}'),
(15361776,	'dd843',	'dd839',	'dd91',	'no',	'si',	'si',	3,	'dd',	'si',	'[{"dd9":"dd841"}]',	'',	NULL,	'{"lg-cat": "Llistat", "lg-deu": "Liste", "lg-eng": "List", "lg-fra": "Liste", "lg-ita": "Elenco", "lg-spa": "Listado"}'),
(15361777,	'dd893',	'dd889',	'dd91',	'no',	'si',	'si',	3,	'dd',	'no',	'[{"dd9":"dd891"}]',	'',	NULL,	'{"lg-cat": "Llistat de registres", "lg-deu": "Liste der Einträge", "lg-eng": "List", "lg-fra": "Liste des enregistrements", "lg-ita": "Elenco dei registri", "lg-spa": "Listado de registros"}'),
(15361778,	'dd1122',	'dd1117',	'dd177',	'no',	'si',	'si',	3,	'dd',	'si',	'',	'',	NULL,	'{"lg-cat": "Nova tipologia recurs", "lg-deu": "Neue Typologie Ressource", "lg-eng": "New resource typology", "lg-fra": "Nouvelle typologie des ressources", "lg-ita": "Nuova tipologia risorsa", "lg-spa": "Nueva tipología recurso"}'),
(15361779,	'dd1123',	'dd1117',	'dd183',	'no',	'si',	'si',	4,	'dd',	'si',	'',	'',	NULL,	'{"lg-cat": "Esborrar tipologia recurs", "lg-deu": "Typologie Ressource löschen", "lg-eng": "Delete resource type", "lg-fra": "Supprimer le type de ressource", "lg-ita": "Cancellare tipologia risorsa", "lg-spa": "Borrar tipología recurso"}'),
(15361780,	'dd191',	'dd64',	'dd91',	'no',	'si',	'si',	3,	'dd',	'no',	'[{"dd9":"dd62"}]',	NULL,	NULL,	'{"lg-cat": "Llistat de registres", "lg-deu": "Liste der Einträge", "lg-eng": "Record listing", "lg-fra": "Liste des enregistrements", "lg-ita": "Elenco dei registri", "lg-spa": "Listado de registros"}'),
(15361781,	'dd259',	'dd229',	'dd262',	'no',	'si',	'si',	4,	'dd',	'si',	'',	'',	NULL,	'{"lg-cat": "Accedir", "lg-deu": "Eintreten", "lg-ell": "εισάγετε", "lg-eng": "Enter", "lg-fra": "Entrer ", "lg-ita": "Entrata", "lg-nep": "प्रविष्ट गर्नुहोस्", "lg-spa": "Entrar"}'),
(15361782,	'dd240',	'dd136',	'dd9',	'no',	'si',	'si',	1,	'dd',	'si',	'',	'',	NULL,	'{"lg-cat": "Esdeveniment", "lg-deu": "Ereignis", "lg-eng": "Event", "lg-fra": "Évenement ", "lg-ita": "Evento", "lg-spa": "Evento"}'),
(15361783,	'dd314',	'dd516',	'dd177',	'no',	'si',	'si',	4,	'dd',	'no',	NULL,	'',	'null',	'{"lg-cat": "Nou", "lg-deu": "Neu", "lg-eng": "New", "lg-fra": "Nouveau", "lg-ita": "Nuovo", "lg-spa": "Nuevo"}'),
(15361784,	'dd951',	'dd939',	'dd247',	'no',	'si',	'si',	4,	'dd',	'no',	NULL,	'{
  "css": {
    ".wrap_component": {
      "mixin": [
        ".vertical"
      ],
      "style": {
        "width": "50%"
      }
    }
  }
}',	'{"css": {".wrap_component": {"mixin": [".vertical"], "style": {"width": "50%"}}}}',	'{"lg-deu": "Projekt", "lg-eng": "Project", "lg-fra": "Projet", "lg-ita": "Progetto", "lg-spa": "Proyecto"}'),
(15361785,	'dd758',	'dd391',	'dd395',	'no',	'si',	'si',	39,	'dd',	'si',	'',	'{"name":"visualizar"}',	'{"name": "visualizar"}',	'{"lg-cat": "Visualitzarlizar", "lg-deu": "Visualisieren", "lg-ell": "φαντάζομαι", "lg-eng": "View", "lg-fra": "Affichage", "lg-ita": "Visualizzare", "lg-nep": "हेर्नुहोस्", "lg-spa": "Visualizar"}'),
(15361786,	'dd760',	'dd391',	'dd395',	'no',	'si',	'si',	41,	'dd',	'si',	'',	'{"name":"imagen"}',	'{"name": "imagen"}',	'{"lg-cat": "imatge", "lg-deu": "Bild", "lg-ell": "εικόνα", "lg-eng": "image", "lg-fra": "Image", "lg-ita": "Immagine", "lg-spa": "imagen"}'),
(15361787,	'dd778',	'dd391',	'dd395',	'no',	'si',	'si',	47,	'dd',	'si',	'',	'{"name":"ficha"}',	'{"name": "ficha"}',	'{"lg-cat": "fitxa", "lg-deu": "Eintrag", "lg-ell": "αρχείο", "lg-eng": "record", "lg-fra": "fiche", "lg-ita": "scheda", "lg-nep": "रेकर्ड", "lg-spa": "ficha"}'),
(15361788,	'dd779',	'dd391',	'dd395',	'no',	'si',	'si',	48,	'dd',	'si',	'',	'{"name":"estado"}',	'{"name": "state"}',	'{"lg-cat": "estat", "lg-deu": "Zustand", "lg-ell": "κατάσταση", "lg-eng": "state", "lg-fra": "État ", "lg-ita": "Stato", "lg-nep": "राज्य", "lg-spa": "estado"}'),
(15361789,	'dd1022',	'dd391',	'dd395',	'no',	'si',	'si',	60,	'dd',	'si',	'',	'{"name":"guardado"}',	'{"name": "saved"}',	'{"lg-cat": "guardat", "lg-deu": "gespeichert", "lg-ell": "επιφυλακτικός", "lg-eng": "saved", "lg-fra": "sauvegardé", "lg-ita": "Salvato", "lg-nep": "बचत गरियो", "lg-spa": "guardado"}'),
(15361790,	'dd756',	'dd391',	'dd395',	'no',	'si',	'si',	37,	'dd',	'si',	'',	'{"name":"abrir"}',	'{"name": "open"}',	'{"lg-cat": "Obrir", "lg-deu": "Öffnen", "lg-ell": "ανοιχτό", "lg-eng": "Open", "lg-fra": "Ouvrir", "lg-ita": "Aprire", "lg-nep": "खोल्नुहोस्", "lg-spa": "Abrir"}'),
(15361791,	'dd1080',	'dd692',	'dd395',	'no',	'si',	'si',	12,	'dd',	'si',	'',	'{"name":"descarga"}',	'{"name": "descarga"}',	'{"lg-cat": "Descàrrega", "lg-deu": "Download", "lg-ell": "εκκένωση", "lg-eng": "Download", "lg-fra": "Télécharger", "lg-ita": "Scaricamento", "lg-nep": "डाउनलोड गर्नुहोस्", "lg-spa": "Descarga"}'),
(15361792,	'dd1081',	'dd692',	'dd395',	'no',	'si',	'si',	13,	'dd',	'si',	'',	'{"name":"nueva version"}',	'{"name": "nueva version"}',	'{"lg-cat": "Nova versió", "lg-deu": "Neue Version", "lg-ell": "ξανακάνω", "lg-eng": "New version", "lg-fra": "Nouvelle version", "lg-ita": "Nuova versione", "lg-nep": "नयाँ संस्करण", "lg-spa": "Nueva versión"}'),
(15361793,	'dd323',	'dd355',	'dd4',	'no',	'si',	'si',	2,	'dd',	'si',	'',	'',	NULL,	'{"lg-cat": "Immaterial", "lg-deu": "Immateriell", "lg-ell": "επουσιώδης", "lg-eng": "Inmaterial", "lg-eus": "Inmateriala", "lg-fra": "Immatériel", "lg-ita": "Immateriale", "lg-nep": "सामग्री", "lg-spa": "Inmaterial"}'),
(15361794,	'dd322',	'dd349',	'dd4',	'no',	'si',	'si',	2,	'dd',	'si',	'',	NULL,	NULL,	'{"lg-cat": "Patrimoni Moble", "lg-deu": "Mobiles Kulturerbe", "lg-eng": "Moveable Heritage", "lg-eus": "Higigarrien ondarea", "lg-fra": "Patrimoine mobilier", "lg-ita": "Patrimonio Mobile", "lg-spa": "Patrimonio Mueble"}'),
(15361795,	'dd254',	'dd128',	'dd183',	'no',	'si',	'si',	7,	'dd',	'si',	'',	'',	NULL,	'{"lg-cat": "Eliminar usuari", "lg-deu": "Benutzer/innen löschen", "lg-ell": "διαγραφή χρηστών", "lg-eng": "Delete user", "lg-fra": "Supprimer les utilisateurs", "lg-ita": "cancellare utenti", "lg-spa": "Borrar usuarios"}'),
(15361796,	'dd205',	'dd203',	'dd8',	'no',	'si',	'si',	1,	'dd',	'no',	NULL,	'',	NULL,	'{"lg-cat": "Procés", "lg-deu": "Prozess", "lg-eng": "Process", "lg-fra": "Processus", "lg-ita": "Processo", "lg-spa": "Proceso"}'),
(15361797,	'dd873',	'dd389',	'dd395',	'no',	'si',	'si',	17,	'dd',	'si',	'',	'{
  "name": "value_already_exists"
}',	'{"name": "value_already_exists"}',	'{"lg-cat": "El valor ja existeix", "lg-deu": "Dieser Wert existiert bereits.", "lg-ell": "Η τιμή υπάρχει ήδη", "lg-eng": "Value already exists", "lg-fra": "La valeur existe déjà", "lg-ita": "Il valore esiste già", "lg-nep": "मान पहिले नै अवस्थित छ", "lg-spa": "El valor ya existe"}'),
(15361798,	'dd49',	'dd30',	'dd247',	'no',	'si',	'no',	3,	'dd',	'no',	'',	'',	NULL,	'{"lg-cat": "Projecte", "lg-deu": "Projekt", "lg-ell": "Έργο", "lg-eng": "Project", "lg-fra": "Projet", "lg-ita": "Progetto", "lg-spa": "Proyecto"}'),
(15361799,	'dd86',	'dd276',	'dd395',	'no',	'si',	'si',	6,	'dd',	'no',	'',	'{
  "name": "borrara_la_etiqueta_seleccionada"
}',	'{"name": "borrara_la_etiqueta_seleccionada"}',	'{"lg-cat": "Esborrarà l''etiqueta seleccionada en tots els idiomes així com totes les relacions i indexacions associades a ella", "lg-deu": "Löscht das ausgwählte Label und alle Sprachen sowie alle damit verbundenen Beziehungen und Indexierungen", "lg-ell": "Θα διαγράψετε την επιλεγμένη ετικέτα σε όλες τις γλώσσες και όλες τις σχέσεις και την ευρετηρίαση που συνδέονται με αυτό", "lg-eng": "It will delete the selected tag in all languages and all the relationships and indexing associated with it", "lg-fra": "Supprime la balise sélectionnée dans toutes les langues ainsi que toutes les relations et l''indexation qui lui sont associées.", "lg-ita": "Cancellare l''etichetta selezionata in tutte le lingue così come tutte le relazioni e indicizzazioni associate ad essa", "lg-spa": "Borrará la etiqueta seleccionada en todos los idiomas así como todas la relaciones e indexaciones asociadas a ella"}'),
(15361800,	'dd648',	'dd637',	'dd57',	'no',	'si',	'si',	10,	'dd',	'no',	'[{"dd6":"dd64"},{"dd9":"dd62"}]',	'{"dato_default":{"section_id":"2","section_tipo":"dd64"},"css":{".wrap_component":{"mixin":[".vertical"],"style":{"width":"15%"}}}}',	'{"dato_default": {"section_id": "2", "section_tipo": "dd64"}}',	'{"lg-cat": "Salvar arguments", "lg-deu": "Argumente speichern", "lg-ell": "Αποθήκευση παραδειγμάτων", "lg-eng": "Save arguments", "lg-fra": "Sauvegarder les arguments", "lg-ita": "Salvare argomenti", "lg-spa": "Salvar argumentos"}'),
(15361801,	'dd331',	'dd319',	'dd395',	'no',	'si',	'si',	4,	'dd',	'si',	NULL,	'{"name":"play_pause_tecla"}',	'{"name": "play_pause_key"}',	'{"lg-cat": "Play/pause tecla", "lg-deu": "Play / Pause Taste", "lg-ell": "Play κουμπί / παύσης", "lg-eng": "Play/pause key", "lg-fra": "Touche de lecture/pause", "lg-ita": "Play / pause tastiera", "lg-spa": "Play/pause tecla"}'),
(15361802,	'dd794',	'dd319',	'dd395',	'no',	'si',	'si',	2,	'dd',	'si',	'',	'{
  "name": "tool_transcription"
}',	'{"name": "tool_transcription"}',	'{"lg-cat": "Transcripció", "lg-deu": "Transkription", "lg-ell": "μεταγραφή", "lg-eng": "Transcription", "lg-fra": "Transciption", "lg-ita": "Trascrizione", "lg-nep": "ट्रान्सक्रिप्शन", "lg-spa": "Transcripción"}'),
(15361803,	'dd39',	'dd33',	'dd438',	'no',	'si',	'si',	3,	'dd',	'no',	'',	'',	NULL,	'{"lg-cat": "Maquetació", "lg-deu": "Layout", "lg-ell": "επιφάνεια εργασίας", "lg-eng": "Layout", "lg-fra": "Mise en page", "lg-ita": "Impaginazione", "lg-spa": "Maquetación"}'),
(15361804,	'dd273',	'dd276',	'dd395',	'no',	'si',	'si',	8,	'dd',	'si',	NULL,	'{"name":"etiquetas_index_borradas"}',	'{"name": "index_tags_deleted"}',	'{"lg-cat": "etiquetes d''index esborrades van ser creades al començament del text.", "lg-deu": "Gelöschte Index Tags wurden am Anfang des Textes erstellt.", "lg-ell": "διαγράφεται ετικέτες ευρετηρίαση δημιουργήθηκαν στην αρχή του κειμένου.", "lg-eng": "deleted index tags was created at beginning of text.", "lg-fra": "des libellés d''index supprimés ont été créés au début du texte.", "lg-ita": "Etichette di indicizzazione cancellate furono create all''inizio del testo.", "lg-spa": "etiquetas de indexación borradas fueron creadas al comienzo del texto."}'),
(15361805,	'dd274',	'dd276',	'dd395',	'no',	'si',	'si',	9,	'dd',	'si',	NULL,	'{"name":"etiquetas_index_fijadas"}',	'{"name": "index_tags_fixed"}',	'{"lg-cat": "etiquetes d''indexación trencades van ser fixades.", "lg-deu": "Kaputte Index Tags wurden repariert.", "lg-ell": "σπασμένα σελιδοδείκτες ήταν τοποθετημένα.", "lg-eng": "broken index tags was fixed.", "lg-fra": "les libellés d''indexation cassées ont été réparées.", "lg-ita": "Etichette di indicizzazione rotte furono sistemate.", "lg-spa": "etiquetas de indexación rotas fueron arregladas."}'),
(15361806,	'dd275',	'dd276',	'dd395',	'no',	'si',	'si',	10,	'dd',	'si',	NULL,	'{"name":"etiquetas_revisar"}',	'{"name": "review_tags"}',	'{"lg-cat": "Si us plau revise la posició de les etiquetes blaus (esborrades accidentalment)", "lg-deu": "Bitte kontrollieren Sie die Position der blauen Labels (aus Versehen gelöscht)", "lg-ell": "Παρακαλώ ελέγξτε τη θέση των μπλε ετικέτες (διαγραφεί κατά λάθος)", "lg-eng": "Please review position of blue tags (accidentally deleted)", "lg-fra": "Veuillez vérifier la position des libellés bleus (supprimés accidentellement).", "lg-ita": "Per favore controlla la posizione delle etichette blu (cancellate accidentalmente)", "lg-nep": "कृपया नीलो ट्यागहरूको स्थिति समीक्षा गर्नुहोस् (संयोगवश मेटाइयो)", "lg-spa": "Por favor revise la posición de las etiquetas azules (borradas accidentalmente)"}'),
(15361807,	'dd1211',	'dd1209',	'dd1041',	'no',	'si',	'si',	2,	'dd',	'si',	'[{"dd9":"dd1115"}]',	'',	NULL,	'{"lg-deu": "Code", "lg-eng": "Code", "lg-fra": "Code", "lg-spa": "Código"}'),
(15361808,	'dd774',	'dd1718',	'dd149',	'no',	'si',	'si',	2,	'dd',	'no',	'',	'',	NULL,	'{"lg-cat": "Permisos", "lg-deu": "Bewilligungen", "lg-ell": "δικαιώματα", "lg-eng": "Permissions", "lg-fra": "Permis", "lg-ita": "Permessi", "lg-spa": "Permisos"}'),
(15361809,	'dd361',	'dd391',	'dd395',	'no',	'si',	'si',	86,	'dd',	'si',	'',	'{
  "name": "pagina_de"
}',	'{"name": "pagina_de"}',	'{"lg-cat": "Pàgina X de Y.", "lg-deu": "Seite X von Y.", "lg-ell": "Σελίδα X του Υ", "lg-eng": "Page X of Y", "lg-fra": "Page X de Y.", "lg-ita": "Pagina X di Y", "lg-spa": "Página X de Y."}'),
(15361810,	'dd1035',	'dd391',	'dd395',	'no',	'si',	'si',	62,	'dd',	'si',	'',	'{"name":"para_crear_un_fragmento"}',	'{"name": "para_crear_un_fragmento"}',	'{"lg-cat": "Per crear un nou fragment, simplement seleccioneu un fragment de text i premeu «Nou fragment» baix", "lg-deu": "Um einen neuen Auszug zu erstellen, wählen Sie eine Textstelle an und klicken Sie unten auf ''Neuer Auszug''.", "lg-ell": "Για να δημιουργήσετε ένα νέο απόσπασμα, απλά επιλέξτε ένα τμήμα του κειμένου και πατήστε το κουμπί Νέο κομμάτι παρακάτω", "lg-eng": "To create a new fragment, simply select a text portion and click on the new button below", "lg-fra": "Pour créer un nouveau fragment, il suffit de sélectionner une partie du texte et de cliquer sur ''Nouveau fragment'' ci-dessous.", "lg-ita": "Per creare un nuovo frammento, semplicemente seleziona una parte del testo e clicca Nuovo frammento in basso", "lg-nep": "नयाँ टुक्रा सिर्जना गर्न, केवल पाठ भाग चयन गर्नुहोस् र तलको नयाँ बटनमा क्लिक गर्नुहोस्", "lg-spa": "Para crear un nuevo fragmento, simplemente seleccione una parte del texto y pulse «Nuevo fragmento» abajo"}'),
(15361811,	'dd1094',	'dd692',	'dd395',	'no',	'si',	'si',	15,	'dd',	'si',	'',	'{"name":"carga_completada"}',	'{"name": "carga_completada"}',	'{"lg-cat": "Càrrega completada", "lg-deu": "Hochladen abgeschlossen", "lg-ell": "φόρτισης τελικού", "lg-eng": "Upload complete", "lg-fra": "Téléchargement complet", "lg-ita": "Caricamento completato", "lg-nep": "अपलोड पूरा भयो", "lg-spa": "Carga completada"}'),
(15361812,	'dd1091',	'dd692',	'dd395',	'no',	'si',	'si',	16,	'dd',	'si',	'',	'{"name":"recuperar_component"}',	'{"name": "recuperar_component"}',	'{"lg-cat": "Recuperar component", "lg-deu": "Komponente wiederherstellen", "lg-ell": "χάνεται συστατικό", "lg-eng": "Recover component", "lg-fra": "Récupérer le composant", "lg-ita": "Recuperare componente", "lg-nep": "कम्पोनेन्ट रिकभर गर्नुहोस्", "lg-spa": "Recuperar componente"}'),
(15361813,	'dd62',	'dd190',	'dd9',	'no',	'si',	'si',	1,	'dd',	'si',	'',	'',	'null',	'{"lg-cat": "Valor", "lg-deu": "Wert", "lg-ell": "Αξία", "lg-eng": "Value", "lg-fra": "Valeur", "lg-ita": "Valore", "lg-nep": "मूल्य", "lg-spa": "Valor"}'),
(15361814,	'dd31',	'dd19',	'null',	'si',	'si',	'si',	2,	'dd',	'si',	'',	'',	NULL,	'{"lg-spa": "diffusion_head"}'),
(15361815,	'dd1065',	'dd1324',	'dd1129',	'no',	'si',	'si',	2,	'dd',	'no',	'[{"dd580":"dd999"}]',	NULL,	NULL,	'{"lg-deu": "Ausgeschlossene", "lg-eng": "Exclude", "lg-fra": "Exclus ", "lg-spa": "Excluidos"}'),
(15361816,	'dd531',	'dd529',	'dd9',	'no',	'si',	'si',	2,	'dd',	'si',	NULL,	NULL,	'{"css": {".wrapper_component": {"grid-column": "span 5"}}}',	'{"lg-cat": "Tipus de mesura", "lg-deu": "Typ des Masses", "lg-eng": "Type of measure", "lg-fra": "Type de mesure", "lg-ita": "Tipo di misura", "lg-spa": "Tipo de medida"}'),
(15361817,	'dd15',	'dd7',	'dd1743',	'no',	'si',	'si',	1,	'dd',	'no',	'',	'{
  "diffusion": {
    "class_name": "diffusion_index_ts"
  }
}',	'{"diffusion": {"class_name": "diffusion_index_ts"}}',	'{"lg-deu": "Indexierungen im Thesaurus", "lg-spa": "Indexaciones en el tesauro"}'),
(15361818,	'dd1079',	'dd391',	'dd395',	'no',	'si',	'si',	65,	'dd',	'si',	'',	'{"name":"informacion"}',	'{"name": "informacion"}',	'{"lg-cat": "Informació", "lg-deu": "Information", "lg-ell": "πληροφορίες", "lg-eng": "Information", "lg-fra": "Information", "lg-ita": "Informazione", "lg-nep": "जानकारी", "lg-spa": "Información"}'),
(15361819,	'dd1126',	'dd391',	'dd395',	'no',	'si',	'si',	66,	'dd',	'si',	'',	'{"name":"extensiones_soportadas"}',	'{"name": "extensiones_soportadas"}',	'{"lg-cat": "Extensions suportades", "lg-deu": "Unterstützte Erweiterungen", "lg-ell": "υποστηριζόμενων επεκτάσεων", "lg-eng": "Supported extensions", "lg-fra": "Extensions supportées", "lg-ita": "Estende", "lg-nep": "समर्थित विस्तारहरू", "lg-spa": "Extensiones soportadas"}'),
(15361820,	'dd1077',	'dd391',	'dd395',	'no',	'si',	'si',	63,	'dd',	'si',	'',	'{"name":"duracion"}',	'{"name": "duracion"}',	'{"lg-cat": "Duració", "lg-deu": "Dauer", "lg-ell": "διάρκεια", "lg-eng": "Duration", "lg-fra": "Durée ", "lg-ita": "Durata", "lg-nep": "अवधि", "lg-spa": "Duración"}'),
(15361821,	'dd1097',	'dd692',	'dd395',	'no',	'si',	'si',	3,	'dd',	'si',	'',	'{"name":"actividad_horaria"}',	'{"name": "actividad_horaria"}',	'{"lg-cat": "Activitat horària", "lg-deu": "Stündliche Aktivität", "lg-ell": "δραστηριότητας του χρόνου", "lg-eng": "Activity time", "lg-fra": "Temps d''activité", "lg-ita": "Attività oraria", "lg-nep": "गतिविधि समय", "lg-spa": "Actividad horaria"}'),
(15361822,	'dd1095',	'dd692',	'dd395',	'no',	'si',	'si',	1,	'dd',	'si',	'',	'{"name":"eliminar_archivo"}',	'{"name": "eliminar_archivo"}',	'{"lg-cat": "Eliminar arxiu", "lg-deu": "Datei löschen", "lg-ell": "διαγραφή του αρχείου", "lg-eng": "Delete File", "lg-fra": "Eliminé des archives ", "lg-ita": "Eliminare archivio", "lg-nep": "फाइल मेटाउनुहोस्", "lg-spa": "Eliminar archivo"}'),
(15361823,	'dd229',	'dd193',	'dd230',	'no',	'si',	'si',	4,	'dd',	'no',	'',	'',	NULL,	'{"lg-cat": "Inici de sessió", "lg-deu": "Sitzung beginnen", "lg-eng": "Login", "lg-fra": "Connexion", "lg-ita": "Inizio della sessione", "lg-spa": "Inicio de sesión"}'),
(15361824,	'dd898',	'rsc481',	'dd6',	'no',	'si',	'si',	7,	'dd',	'no',	'[{"dd626":"dd22"}]',	NULL,	'{"color": "#be6f82"}',	'{"lg-cat": "Lloc de captació", "lg-deu": "Ort der Erfassung", "lg-ell": "τόπος απορροής", "lg-eng": "Place of capture", "lg-fra": "Zone de chalandise", "lg-ita": "Luogo di raccolta", "lg-spa": "Lugar de captación"}'),
(15361825,	'dd496',	'dd906',	'dd395',	'no',	'si',	'si',	1,	'dd',	'si',	'',	'{"name":"print"}',	'{"name": "print"}',	'{"lg-cat": "Imprimir", "lg-deu": "Drucken", "lg-ell": "Εκτύπωση", "lg-eng": "Print", "lg-fra": "Imprimer", "lg-ita": "Stampare", "lg-spa": "Imprimir"}'),
(15361826,	'dd224',	'dd203',	'dd247',	'no',	'si',	'si',	2,	'dd',	'no',	NULL,	'',	NULL,	'{"lg-cat": "Projecte", "lg-deu": "Projekt", "lg-eng": "Filter", "lg-fra": "Projet", "lg-ita": "Progetto", "lg-spa": "Proyecto"}'),
(15361827,	'dd160',	'dd118',	'dd395',	'no',	'si',	'si',	6,	'dd',	'si',	'null',	'{"name":"todos"}',	'{"name": "all"}',	'{"lg-cat": "Tots", "lg-deu": "Alle", "lg-ell": "όλα", "lg-eng": "All", "lg-fra": "Tous", "lg-ita": "Tutti", "lg-spa": "Todos"}'),
(15361828,	'dd1134',	'dd1132',	'dd247',	'no',	'si',	'si',	2,	'dd',	'no',	'',	'',	NULL,	'{"lg-cat": "Projecte", "lg-deu": "Projekt", "lg-ell": "Έργο", "lg-eng": "Project", "lg-fra": "Projet", "lg-ita": "Progetto", "lg-spa": "Proyecto"}'),
(15361829,	'dd1665',	'rsc275',	'dd1231',	'no',	'si',	'si',	9,	'dd',	'si',	'[{"dd442":"rsc1368"}]',	'{"process_dato":"diffusion_sql::resolve_component_value","process_dato_arguments":{"component_method":"get_dato"}}',	NULL,	'{"lg-spa": "references"}'),
(15361830,	'dd1000',	'dd1052',	'dd6',	'no',	'si',	'si',	1,	'dd',	'no',	'[{"dd626":"dd963"}]',	'',	NULL,	'{"lg-cat": "Entats Dédalo", "lg-deu": "Dédalo Einheiten", "lg-ell": "Οργανισμοί Dédalo", "lg-eng": "Dédalo Entities", "lg-fra": "Entités Dédalo", "lg-ita": "Entità Dedalo", "lg-spa": "Entidades Dédalo"}'),
(15361831,	'dd107',	'dd118',	'dd395',	'no',	'si',	'si',	2,	'dd',	'no',	'null',	'{"name":"tool_replace_component_data"}',	'{"name": "tool_replace_component_data"}',	'{"lg-cat": "Substitueix dades del camp", "lg-deu": "Felddaten ersetzen", "lg-ell": "Αντικαταστήστε τα δεδομένα πεδίου", "lg-eng": "Replace field data", "lg-fra": "Remplacer les données de terrain", "lg-ita": "Sostituire dati del campo", "lg-spa": "Reemplazar datos del campo"}'),
(15361832,	'dd483',	'dd118',	'dd395',	'no',	'si',	'si',	7,	'dd',	'si',	'null',	'{"name":"vacio"}',	'{"name": "vacio"}',	'{"lg-cat": "buit", "lg-deu": "Leer", "lg-ell": "κενό", "lg-eng": "blank", "lg-fra": "Vide", "lg-ita": "Vuoto", "lg-spa": "vacío"}'),
(15361833,	'dd316',	'dd342',	'dd395',	'no',	'si',	'si',	8,	'dd',	'si',	NULL,	'{
  "name": "desbloquear_todos_los_componentes"
}',	'{"name": "desbloquear_todos_los_componentes"}',	'{"lg-cat": "Desbloquejar tots els components", "lg-deu": "Alle Komponenten deblockieren", "lg-eng": "Unlock all components", "lg-fra": "Déverrouiller tous les composants", "lg-ita": "Sbloccare tutti i componenti", "lg-spa": "Desbloquear todos los componentes"}'),
(15361834,	'dd980',	'dd976',	'dd177',	'no',	'si',	'si',	4,	'dd',	'no',	'',	'',	NULL,	'{"lg-cat": "Nova relació d''aspecte", "lg-deu": "Neues Bildformat", "lg-eng": "New aspect ratio", "lg-fra": "Nouveau ratio d''aspect", "lg-ita": "Nuova relazione dell&#039;aspetto", "lg-spa": "Nueva relación de aspecto"}'),
(15361835,	'dd226',	'dd203',	'dd91',	'no',	'si',	'si',	3,	'dd',	'no',	'[{"dd9":"dd223"}]',	'',	NULL,	'{"lg-cat": "Llistat", "lg-deu": "Liste", "lg-eng": "List", "lg-fra": "Liste", "lg-ita": "Elenco", "lg-spa": "Listado"}'),
(15361836,	'dd122',	'dd906',	'dd395',	'no',	'si',	'si',	12,	'dd',	'si',	NULL,	'{
  "name": "processing_wait"
}',	'{"name": "processing_wait"}',	'{"lg-cat": "Processant ... si us plau espereu", "lg-deu": "Wird verarbeitet… bitte warten", "lg-ell": "Επεξεργασία... παρακαλώ περιμένετε", "lg-eng": "Processing... please wait", "lg-fra": "Traitement... veuillez patienter", "lg-ita": "Processando... per favore attenda", "lg-spa": "Procesando... por favor espere"}'),
(15361837,	'dd213',	'dd208',	'dd177',	'no',	'si',	'si',	3,	'dd',	'si',	'',	'',	NULL,	'{"lg-cat": "Nova Tipologia d''activitats", "lg-deu": "Neue Aktivitäten-Typologie", "lg-eng": "New Type of activities", "lg-fra": "Nouvelle typologie d''activité", "lg-ita": "Nuova Tipologia di attività", "lg-spa": "Nueva Tipología de actividades"}'),
(15361838,	'dd344',	'dd906',	'dd395',	'no',	'si',	'si',	8,	'dd',	'si',	'null',	'{"name":"new_page"}',	'{"name": "new_page"}',	'{"lg-cat": "Nova pàgina", "lg-deu": "Neue Seite", "lg-ell": "νέα σελίδα", "lg-eng": "New page", "lg-fra": "Nouvelle page", "lg-ita": "Nuova pagina", "lg-spa": "Nueva página"}'),
(15361839,	'dd384',	'dd906',	'dd395',	'no',	'si',	'si',	2,	'dd',	'no',	'null',	'{"name":"edit_template"}',	'{"name": "edit_template"}',	'{"lg-cat": "Editar plantilla", "lg-deu": "Vorlage bearbeiten", "lg-ell": "Επεξεργασία προτύπου", "lg-eng": "Edit template", "lg-fra": "Modifier le modèle", "lg-ita": "Modificare modella", "lg-spa": "Editar plantilla"}'),
(15361840,	'dd214',	'dd516',	'dd183',	'no',	'si',	'si',	5,	'dd',	'no',	'',	'',	NULL,	'{"lg-cat": "Esborrar", "lg-deu": "Löschen", "lg-eng": "Delete", "lg-fra": "Supprimer", "lg-ita": "Cancellare", "lg-spa": "Borrar"}'),
(15361841,	'dd860',	'dd372',	'dd58',	'no',	'si',	'si',	6,	'dd',	'no',	'[{"dd9":"dd374"},{"dd9":"dd375"}]',	NULL,	NULL,	'{"lg-cat": "llistat relacions", "lg-deu": "Liste Beziehungen", "lg-eng": "Relation list", "lg-fra": "Liste de relations", "lg-ita": "Elenco relazioni", "lg-spa": "Listado Relaciones"}'),
(15361842,	'dd472',	'dd906',	'dd395',	'no',	'si',	'si',	6,	'dd',	'si',	'null',	'{"name":"new_fixed_page"}',	'{"name": "new_fixed_page"}',	'{"lg-cat": "Nova pàgina fixa", "lg-deu": "Neue Seite (starres Layout)", "lg-ell": "Σταθερή νέα σελίδα", "lg-eng": "New fixed page", "lg-fra": "Nouvelle page fixe", "lg-ita": "Nuova pagina stabilita", "lg-spa": "Nueva página fija"}'),
(15361843,	'dd159',	'dd147',	'dd395',	'no',	'si',	'si',	5,	'dd',	'si',	NULL,	'{
  "name": "validado"
}',	'{"name": "validado"}',	'{"lg-cat": "Validat", "lg-deu": "Validiert", "lg-ell": "επικυρωμένες", "lg-eng": "Validated", "lg-fra": "Validé", "lg-ita": "Convalidato", "lg-nep": "प्रमाणीकरण गरियो", "lg-spa": "Validado"}'),
(15361844,	'dd1312',	'dd1308',	'dd91',	'no',	'si',	'si',	5,	'dd',	'no',	'[{"dd9":"dd1311"}]',	'',	NULL,	'{"lg-cat": "Llistat", "lg-deu": "Liste", "lg-ell": "λίστα", "lg-eng": "List", "lg-fra": "Liste", "lg-ita": "Elenco", "lg-spa": "Listado"}'),
(15361845,	'dd263',	'dd147',	'dd395',	'no',	'si',	'si',	7,	'dd',	'si',	NULL,	'{"name":"ir_al_perfil"}',	'{"name": "ir_al_perfil"}',	'{"lg-cat": "Ir al perfil", "lg-deu": "Gehe zum Profil", "lg-ell": "Πηγαίνετε στο προφίλ", "lg-eng": "Go to profile", "lg-fra": "Aller au profil", "lg-ita": "Andare al profilo", "lg-nep": "प्रोफाइलमा जानुहोस्", "lg-spa": "Ir al perfil"}'),
(15361846,	'dd287',	'dd906',	'dd395',	'no',	'si',	'si',	4,	'dd',	'no',	'null',	'{"name":"save_template"}',	'{"name": "save_template"}',	'{"lg-cat": "Salvar plantilla", "lg-deu": "Vorlage speichern", "lg-ell": "πρότυπο αποθηκεύετε", "lg-eng": "Save template", "lg-fra": "Sauvegarder le modèle", "lg-ita": "Salvare modello", "lg-spa": "Salvar plantilla"}'),
(15361847,	'dd119',	'dd118',	'dd395',	'no',	'si',	'si',	1,	'dd',	'no',	'null',	'{"name":"tool_do_replace"}',	'{"name": "tool_do_replace"}',	'{"lg-cat": "Reemplaçar continguts", "lg-deu": "Inhalte ersetzen", "lg-ell": "αντικαταστήσει περιεχόμενο", "lg-eng": "Replace values", "lg-fra": "Remplacer les contenus ", "lg-ita": "Sostituire contenuti", "lg-nep": "मानहरू बदल्नुहोस्", "lg-spa": "Reemplazar contenidos"}'),
(15361848,	'dd461',	'dd460',	'dd8',	'no',	'si',	'si',	1,	'dd',	'no',	NULL,	NULL,	NULL,	'{"lg-cat": "Identificació", "lg-deu": "Identifizierung", "lg-eng": "Identify", "lg-fra": "Identification", "lg-ita": "Identificazione", "lg-spa": "Identificación"}'),
(15361849,	'dd123',	'dd906',	'dd395',	'no',	'si',	'si',	13,	'dd',	'si',	NULL,	'{"name":"view_pdf"}',	'{"name": "view_pdf"}',	'{"lg-cat": "Veure / descarregar PDF", "lg-deu": "PDF ansehen / löschen", "lg-ell": "Προβολή / λήψη αρχείου PDF", "lg-eng": "View / download PDF", "lg-fra": "Visualiser / télécharger le PDF", "lg-ita": "Guarda / scarica PDF", "lg-spa": "Ver / descargar PDF"}'),
(15361850,	'dd232',	'dd391',	'dd395',	'no',	'si',	'si',	76,	'dd',	'si',	NULL,	'{"name":"editar_registro"}',	'{"name": "editar_registro"}',	'{"lg-cat": "Editar registre", "lg-deu": "Eintrag bearbeiten", "lg-ell": "Επεξεργασία ρεκόρ", "lg-eng": "Edit record", "lg-fra": "Modifier l''enregistrement", "lg-ita": "Modificare registro", "lg-nep": "रेकर्ड सम्पादन गर्नुहोस्", "lg-spa": "Editar registro"}'),
(15361851,	'dd106',	'dd126',	'dd9',	'no',	'si',	'si',	1,	'dd',	'si',	'null',	'{"css":{".wrap_component":{"mixin":[".width_25",".vertical"],"style":{}},".label":{"style":{}},".content_data":{"style":{}}}}',	NULL,	'{"lg-cat": "Serie /nombre d''expedient", "lg-deu": "Serie / Aktennummer", "lg-ell": "Σειρά / αριθμός αρχείου", "lg-eng": "Serie / Número de expedient", "lg-fra": "Série / Numéro de dossier", "lg-ita": "Serie / Numero del dossier", "lg-spa": "Serie / Número de expediente"}'),
(15361852,	'dd141',	'dd540',	'dd395',	'no',	'si',	'si',	1,	'dd',	'si',	'',	'{
  "name": "historico"
}',	'{"name": "historico"}',	'{"lg-cat": "Històric", "lg-deu": "Verlauf", "lg-ell": "ιστορικός", "lg-eng": "Historical", "lg-fra": "Historique", "lg-ita": "Storico", "lg-nep": "ऐतिहासिक", "lg-spa": "Histórico"}'),
(15361853,	'dd154',	'dd153',	'dd8',	'no',	'si',	'si',	1,	'dd',	'si',	'',	NULL,	'{"css": {".content_data": {"grid-template-columns": "repeat(10, 1fr)"}}}',	'{"lg-cat": "Informació general", "lg-deu": "Allgemeine Informationen", "lg-ell": "Επισκόπηση", "lg-eng": "General information", "lg-fra": "Information générale", "lg-ita": "Informazione generale", "lg-spa": "Información general"}'),
(15361854,	'dd1049',	'dd390',	'dd395',	'no',	'si',	'si',	8,	'dd',	'si',	'null',	'{"name":"crear_subtitulos"}',	'{"name": "build_subtitles"}',	'{"lg-cat": "Crear subtítols", "lg-deu": "Untertitel erstellen", "lg-ell": "Δημιουργία υπότιτλους", "lg-eng": "Build subtitles", "lg-fra": "Créer des sous-titres ", "lg-ita": "Creare sottotitoli", "lg-spa": "Crear subtítulos"}'),
(15361855,	'dd462',	'dd461',	'dd9',	'no',	'si',	'si',	1,	'dd',	'no',	NULL,	NULL,	NULL,	'{"lg-cat": "Unitat", "lg-deu": "Einheit", "lg-eng": "Unit", "lg-fra": "Unité", "lg-ita": "Unità", "lg-spa": "Unidad"}'),
(15361856,	'dd1082',	'dd537',	'dd395',	'no',	'si',	'si',	9,	'dd',	'si',	'',	'{"name":"archivo_subido_con_exito"}',	'{"name": "file_uploaded_successfully"}',	'{"lg-cat": "Arxiu pujat amb èxit", "lg-deu": "Datei erfolgreich hochgeladen", "lg-ell": "Αρχείο φορτώθηκε με επιτυχία", "lg-eng": "File uploaded successfully", "lg-fra": "Fichier téléchargé avec succès", "lg-ita": "Archivio caricato con ", "lg-spa": "Archivo subido con éxito"}'),
(15361857,	'dd446',	'dd439',	'dd395',	'no',	'si',	'si',	2,	'dd',	'si',	'',	'{
  "name": "ruta_carpeta_ficheros_renombrar"
}',	'{"name": "ruta_carpeta_ficheros_renombrar"}',	'{"lg-deu": "Ordnerpfad: Umzubenennende Dateien", "lg-eng": "Files to rename path", "lg-fra": "Chemin d''accès au dossier des fichiers à renommer", "lg-ita": "Percorso della cartella files a rinominare", "lg-spa": "Ruta de carpeta ficheros a renombrar"}'),
(15361858,	'dd1727',	'dd390',	'dd395',	'no',	'si',	'si',	25,	'dd',	'si',	'',	'{"name":"preview_of_print"}',	'{"name": "preview_of_print"}',	'{"lg-cat": "Previsualització d\\''impresió", "lg-deu": "Vorschau des Imports", "lg-ell": "Προεπισκόπηση εισαγωγής", "lg-eng": "Print preview", "lg-fra": "Aperçu de l''importation", "lg-ita": "Previsualizzazione dell''importazione", "lg-nep": "प्रिन्ट पूर्वावलोकन", "lg-spa": "Previsualización de importación"}'),
(15361859,	'dd1740',	'dd539',	'dd395',	'no',	'si',	'si',	1,	'dd',	'si',	NULL,	'{
  "name": "file_path"
}',	'{"name": "file_path"}',	'{"lg-cat": "Ruta d''arxiu", "lg-deu": "Dateipfad", "lg-ell": "Διαδρομή αρχείου", "lg-eng": "File Path", "lg-fra": "Chemin d''accès au fichier", "lg-ita": "Percorso dell''archivio", "lg-nep": "फाइल पथ", "lg-spa": "Ruta de archivo"}'),
(15361860,	'dd176',	'dd539',	'dd395',	'no',	'si',	'si',	2,	'dd',	'si',	'',	'{
  "name": "nombre_fichero"
}',	'{"name": "nombre_fichero"}',	'{"lg-cat": "Nom del fitxer", "lg-deu": "Dateiname", "lg-ell": "Όνομα αρχείου", "lg-eng": "File name", "lg-fra": "Nom du fichier", "lg-ita": "Nome del file", "lg-spa": "Nombre del fichero"}'),
(15361861,	'dd793',	'dd540',	'dd395',	'no',	'si',	'si',	4,	'dd',	'si',	'',	'{"name":"tool_time_machine"}',	'{"name": "tool_time_machine"}',	'{"lg-ara": "آلة الزمن", "lg-cat": "Màquina del temps", "lg-deu": "Time Machine", "lg-ell": "Μηχανή του χρόνου", "lg-eng": "Time machine", "lg-fra": "Machine à remonter le temps", "lg-ita": "Macchina del tempo", "lg-nep": "समय यन्त्र", "lg-spa": "Máquina del tiempo"}'),
(15361862,	'dd17',	'dd1226',	'null',	'si',	'si',	'si',	2,	'dd',	'si',	'',	NULL,	NULL,	'{"lg-spa": "diffusion_domain"}'),
(15361863,	'dd100',	'dd1',	'dd50',	'no',	'si',	'si',	6,	'dd',	'si',	'null',	NULL,	NULL,	'{"lg-ara": "قاموس", "lg-cat": "Tesaurus", "lg-deu": "Thesaurus", "lg-ell": "θησαυρός λέξεων", "lg-eng": "Thesaurus", "lg-eus": "Tesauroko", "lg-fra": "Thésaurus", "lg-ita": "Thesaurus", "lg-nep": "थिसौरस", "lg-spa": "Tesauro"}'),
(15361864,	'dd180',	'dd153',	'dd177',	'no',	'si',	'si',	5,	'dd',	'si',	'',	'',	NULL,	'{"lg-cat": "Nou projecte", "lg-deu": "Neues Projekt", "lg-ell": "νέο έργο", "lg-eng": "New project", "lg-fra": "Nouveau projet", "lg-ita": "Nuovo progetto", "lg-spa": "Nuevo proyecto"}'),
(15361865,	'dd47',	'dd427',	'dd206',	'no',	'si',	'si',	7,	'dd',	'no',	'',	'',	NULL,	'{"lg-cat": "pare", "lg-deu": "Oberbegriff", "lg-ell": "πατέρας", "lg-eng": "Father", "lg-fra": "Père", "lg-ita": "Padre", "lg-nep": "बुबा", "lg-spa": "Padre"}'),
(15361866,	'dd77',	'dd427',	'dd206',	'no',	'si',	'si',	10,	'dd',	'no',	'',	'',	NULL,	'{"lg-cat": "Ontologia", "lg-deu": "Ontologie", "lg-eng": "Ontology", "lg-fra": "Ontologie", "lg-nep": "ओन्टोलजी", "lg-spa": "Ontología"}'),
(15361867,	'dd358',	'dd342',	'dd395',	'no',	'si',	'si',	6,	'dd',	'si',	NULL,	'{
  "name": "skip_publication_state_check"
}',	'{"name": "skip_publication_state_check"}',	'{"lg-cat": "Ignorar temporalment l''estat de publicació en publicar", "lg-deu": "Publikationsstatus bei der Veröffentlichung temporär ignorieren ", "lg-eng": "Ignore temporarily the publication status when publishing", "lg-fra": "Ignorer temporairement le statut de publication lors de la publication", "lg-ita": "Ignorare temporaneamente lo stato di pubblicazione nel pubblicare", "lg-spa": "Ignorar temporalmente el estado de publicación al publicar"}'),
(15361868,	'dd359',	'dd342',	'dd395',	'no',	'si',	'si',	7,	'dd',	'si',	NULL,	'{"name":"remove_av_temporals"}',	'{"name": "remove_av_temporals"}',	'{"lg-cat": "Esborrar temporals d''àudio / vídeo", "lg-deu": "Temporals von Audio/Video löschen", "lg-eng": "Remove sv temporals", "lg-fra": "Supprimer les fichiers audio/vidéo temporaires", "lg-ita": "Cancellare temporanei di audio/video", "lg-spa": "Borrar temporales de audio/video"}'),
(15361869,	'dd81',	'dd539',	'dd395',	'no',	'si',	'si',	15,	'dd',	'si',	NULL,	'{"name":"crear_imagen_identificativa"}',	'{"name": "create_identify_image"}',	'{"lg-cat": "Crear imatge identificativa", "lg-deu": "Indentifikationsbild erstellen", "lg-ell": "Δημιουργήστε τον εντοπισμό εικόνα", "lg-eng": "Create identifying image", "lg-fra": "Créer une image d''identification", "lg-ita": "Creare immagine identificativa", "lg-spa": "Crear imagen identificativa"}'),
(15361870,	'dd407',	'dd539',	'dd395',	'no',	'si',	'si',	10,	'dd',	'si',	'',	'{
  "name": "imagen_info"
}',	'{"name": "imagen_info"}',	'{"lg-cat": "Imatge info.", "lg-deu": "Bild Info.", "lg-ell": "Πληροφορίες εικόνα.", "lg-eng": "Image info.", "lg-fra": "Image d''information", "lg-ita": "Immagine info.", "lg-spa": "Imagen info."}'),
(15361871,	'dd1220',	'dd539',	'dd395',	'no',	'si',	'si',	13,	'dd',	'si',	'',	'{
  "name": "preview"
}',	'{"name": "preview"}',	'{"lg-cat": "vista previa", "lg-deu": "Vorschau", "lg-ell": "προεπισκόπηση", "lg-eng": "preview", "lg-fra": "Aperçu", "lg-ita": "Anteprima", "lg-spa": "vista previa"}'),
(15361872,	'dd497',	'dd492',	'dd91',	'no',	'si',	'si',	2,	'dd',	'no',	'[{"dd9":"dd494"}]',	NULL,	NULL,	'{"lg-cat": "Llistat", "lg-deu": "Liste", "lg-ell": "λίστα", "lg-eng": "List", "lg-fra": "Liste", "lg-ita": "Elenco", "lg-spa": "Listado"}'),
(15361873,	'dd499',	'dd492',	'dd247',	'no',	'si',	'si',	3,	'dd',	'no',	NULL,	NULL,	NULL,	'{"lg-cat": "Projecte", "lg-deu": "Projekt", "lg-ell": "Έργο", "lg-eng": "Project", "lg-fra": "Projet", "lg-ita": "Progetto", "lg-spa": "Proyecto"}'),
(15361874,	'dd493',	'dd492',	'dd8',	'no',	'si',	'si',	1,	'dd',	'no',	NULL,	NULL,	NULL,	'{"lg-cat": "Identificació", "lg-deu": "Identifizierung", "lg-ell": "αναγνώριση", "lg-eng": "Identification", "lg-fra": "Identification", "lg-ita": "Identificazione", "lg-spa": "Identificación"}'),
(15361875,	'dd504',	'dd501',	'dd91',	'no',	'si',	'si',	2,	'dd',	'no',	'[{"dd9":"dd503"}]',	NULL,	NULL,	'{"lg-cat": "Llistat", "lg-deu": "Liste", "lg-ell": "λίστα", "lg-eng": "List", "lg-fra": "Liste", "lg-ita": "Elenco", "lg-spa": "Listado"}'),
(15361876,	'dd278',	'dd276',	'dd395',	'no',	'si',	'si',	2,	'dd',	'si',	NULL,	'{"name":"etiqueta_borrada"}',	'{"name": "label_deleted"}',	'{"lg-cat": "Esborrada", "lg-deu": "Gelöscht", "lg-ell": "διαγράφεται", "lg-eng": "Deleted", "lg-fra": "Supprimé", "lg-ita": "Cancellata", "lg-nep": "मेटाइयो", "lg-spa": "Borrada"}'),
(15361877,	'dd820',	'dd408',	'dd58',	'no',	'si',	'si',	6,	'dd',	'no',	'[{"dd9":"dd411"}]',	NULL,	NULL,	'{"lg-cat": "Llistat de relaicons", "lg-deu": "Liste Beziehungen", "lg-eng": "Relations list", "lg-fra": "Liste de relations", "lg-ita": "Elenco relazioni", "lg-spa": "Listado relaciones"}'),
(15361878,	'dd1015',	'dd118',	'dd395',	'no',	'si',	'si',	3,	'dd',	'si',	'null',	'{"name":"registros_actualizados"}',	'{"name": "registros_actualizados"}',	'{"lg-cat": "registres actulitzats", "lg-deu": "aktualisierte Einträge", "lg-ell": "επικαιροποιημένα αρχεία", "lg-eng": "updated records", "lg-fra": "Enregistrements mis à jour", "lg-ita": "Registri aggiornati", "lg-spa": "registros actualizados"}'),
(15361879,	'dd454',	'dd449',	'dd395',	'no',	'si',	'si',	7,	'dd',	'si',	NULL,	'{"name":"lines"}',	'{"name": "lines"}',	'{"lg-cat": "Línies", "lg-deu": "Linien", "lg-ell": "γραμμές", "lg-eng": "Lines", "lg-fra": "Lignes", "lg-ita": "Linee", "lg-nep": "रेखाहरू", "lg-spa": "Líneas"}'),
(15361880,	'dd451',	'dd449',	'dd395',	'no',	'si',	'si',	3,	'dd',	'si',	NULL,	'{"name":"indexations"}',	'{"name": "indexations"}',	'{"lg-cat": "Indexacions", "lg-deu": "Indexierungen", "lg-ell": "τιμαριθμικές αναπροσαρμογές", "lg-eng": "Indexations", "lg-fra": "Indexations", "lg-ita": "Indicizzazione", "lg-nep": "अनुक्रमणिकाहरू", "lg-spa": "Indexaciones"}'),
(15361881,	'dd457',	'dd449',	'dd395',	'no',	'si',	'si',	10,	'dd',	'si',	NULL,	'{"name":"entrevista"}',	'{"name": "entrevista"}',	'{"lg-cat": "Entrevista", "lg-deu": "Interview", "lg-ell": "συνέντευξη", "lg-eng": "Interview", "lg-fra": "Entretien", "lg-ita": "Intervista", "lg-nep": "अन्तर्वार्ता", "lg-spa": "Entrevista"}'),
(15361882,	'dd1086',	'dd537',	'dd395',	'no',	'si',	'si',	13,	'dd',	'si',	'',	'{"name":"ningun_archivo_fue_subido"}',	'{"name": "no_file_was_uploaded"}',	'{"lg-cat": "Cap arxiu va ser pujat", "lg-deu": "Es wurde keine Datei hochgeladen", "lg-ell": "Δεν υπάρχει αρχείο φορτώθηκε", "lg-eng": "No file was uploaded", "lg-fra": "Aucun fichier n''a été téléchargé", "lg-ita": "Nessun archivio fu caricato", "lg-spa": "Ningún archivo fue subido"}'),
(15361883,	'dd535',	'dd528',	'dd183',	'no',	'si',	'si',	4,	'dd',	'no',	NULL,	NULL,	NULL,	'{"lg-cat": "Esborrar", "lg-deu": "Löschen", "lg-eng": "Delete", "lg-fra": "Supprimer", "lg-ita": "Cancellare", "lg-spa": "Borrar"}'),
(15361884,	'dd1087',	'dd537',	'dd395',	'no',	'si',	'si',	14,	'dd',	'si',	'',	'{"name":"carpeta_temporal_no_accesible"}',	'{"name": "temp_dir_not_accessible"}',	'{"lg-cat": "Carpeta temporal no accessible", "lg-deu": "Temporärer Ordner nicht zugänglich", "lg-ell": "προσωρινό φάκελο δεν είναι προσβάσιμο", "lg-eng": "Temporary folder not accessible", "lg-fra": "Dossier temporairement non accessible", "lg-ita": "Cartella temporanea non accessibile", "lg-spa": "Carpeta temporal no accesible"}'),
(15361885,	'dd522',	'dd129',	'dd749',	'no',	'si',	'si',	16,	'dd',	'no',	NULL,	'{"css":{".wrap_component":{"mixin":[".vertical"],"style":{}},".content_data > .canvas_edit":{"style":{"height":"150px"}}}}',	'{"css": {".wrapper_component": {"grid-row": "3", "grid-column": "7 / span 4"}}}',	'{"lg-cat": "Fotografia de perfil", "lg-deu": "Profilbild", "lg-ell": "Εικόνα προφίλ", "lg-eng": "Profile picture", "lg-fra": "Photo de profil", "lg-ita": "Foto del profilo", "lg-spa": "Foto de perfil"}'),
(15361886,	'dd1437',	'dd1436',	'dd91',	'no',	'si',	'si',	1,	'dd',	'si',	'[{"dd339":"dd593"},{"dd9":"dd594"},{"dd1017":"dd595"},{"dd580":"dd596"}]',	'',	'null',	'{"lg-deu": "Liste", "lg-eng": "List", "lg-fra": "Liste", "lg-spa": "List"}'),
(15361887,	'dd453',	'dd449',	'dd395',	'no',	'si',	'si',	4,	'dd',	'si',	NULL,	'{"name":"indexations_info"}',	'{"name": "indexations_info"}',	'{"lg-cat": "Index info", "lg-deu": "Index Info", "lg-ell": "δείκτης info", "lg-eng": "Index info", "lg-fra": "Informations sur l''index", "lg-ita": "Indice info", "lg-nep": "अनुक्रमणिका जानकारी", "lg-spa": "Index info"}'),
(15361888,	'dd388',	'dd389',	'dd395',	'no',	'si',	'si',	8,	'dd',	'si',	'',	'{"name":"error_de_conexion"}',	'{"name": "error_de_conexion"}',	'{"lg-cat": "Error de connexió. Recarregueu la pàgina passats uns segons", "lg-deu": "Verbindungsfehler. Bitte laden Sie die Seite nach einigen Sekunden neu.", "lg-ell": "Σφάλμα σύνδεσης. Επαναφορτίστε την τελευταία σελίδα λίγα δευτερόλεπτα", "lg-eng": "Connection failed. Please reload the page after a few seconds", "lg-fra": "Erreur de connexion. Recharger la page après quelques secondes", "lg-ita": "Errore di connessione. Ricarica la pagina passati alcuni secondi", "lg-nep": "सम्पर्क असफल। कृपया केहि सेकेन्ड पछि पृष्ठ पुन: लोड गर्नुहोस्", "lg-spa": "Error de conexión. Recargue la página pasados unos segundos"}'),
(15361889,	'dd1033',	'dd389',	'dd395',	'no',	'si',	'si',	18,	'dd',	'si',	'',	'{"name":"seleccione_un_idioma_de_destino"}',	'{"name": "seleccione_un_idioma_de_destino"}',	'{"lg-cat": "Seleccione un idioma de destí", "lg-deu": "Wählen Sie eine Zielsprache", "lg-ell": "Επιλέξτε μια γλώσσα-στόχο", "lg-eng": "Please select one target lang", "lg-fra": "Sélectionner une langue de destination", "lg-ita": "Seleziona una lingua di destinazione", "lg-nep": "कृपया एउटा लक्षित भाषा चयन गर्नुहोस्", "lg-spa": "Seleccione un idioma de destino"}'),
(15361890,	'dd1633',	'dd1581',	'dd580',	'no',	'si',	'si',	1,	'dd',	'no',	NULL,	NULL,	'{"css": {".wrapper_component": {"grid-column": "span 10"}, ".wrapper_component >.content_data": {"min-height": "60vh"}}}',	'{"lg-cat": "Configuració per defecte", "lg-deu": "Standardkonfiguration", "lg-ell": "Προεπιλεγμένη διαμόρφωση", "lg-eng": "Default configuration", "lg-fra": "Configuration par défaut", "lg-ita": "Configurazione predefinita", "lg-spa": "Configuración por defecto"}'),
(15361891,	'dd501',	'dd137',	'dd6',	'no',	'si',	'si',	4,	'dd',	'no',	'[{"dd626":"dd963"}]',	NULL,	NULL,	'{"lg-cat": "Estats de les dades - admin", "lg-deu": "Status der Daten – Admin", "lg-ell": "Κατάσταση δεδομένων - διαχειριστής", "lg-eng": "Data status - admin", "lg-fra": "État des données - admin", "lg-ita": "Stato dei dati - admin", "lg-spa": "Estado de los datos - admin"}'),
(15361892,	'dd492',	'dd137',	'dd6',	'no',	'si',	'si',	30,	'dd',	'no',	'[{"dd626":"dd963"}]',	NULL,	NULL,	'{"lg-cat": "Roles de publicació", "lg-deu": "Publikationsrollen", "lg-ell": "Οι ρόλοι των δημοσιεύσεων", "lg-eng": "publications roles", "lg-fra": "Rôles de publication", "lg-ita": "Ruoli delle pubblicazioni", "lg-spa": "Roles de publicaciones"}'),
(15361893,	'dd663',	'dd659',	'dd395',	'no',	'si',	'si',	4,	'dd',	'si',	NULL,	'{"name":"distinto_de"}',	'{"name": "different_from"}',	'{"lg-cat": "Diferent de", "lg-deu": "Anders als", "lg-eng": "Different from", "lg-fra": "Différent de", "lg-ita": "Distinto da", "lg-nep": "भन्दा फरक", "lg-spa": "Distinto de"}'),
(15361894,	'dd782',	'dd128',	'dd8',	'no',	'si',	'si',	2,	'dd',	'no',	'',	NULL,	'{"css": {".content_data": {"grid-template-columns": "1fr"}, ".wrapper_grouper": {"grid-column": "span 10"}}}',	'{"lg-cat": "Filtres", "lg-deu": "Filter", "lg-eng": "Filters", "lg-fra": "Filtres", "lg-ita": "Filtri", "lg-spa": "Filtros"}'),
(15361895,	'dd780',	'dd390',	'dd395',	'no',	'si',	'si',	18,	'dd',	'si',	'',	'{"name":"relacionar_fragmento_seleccionado"}',	'{"name": "relacionar_fragmento_seleccionado"}',	'{"lg-cat": "Relacionar fragment seleccionat", "lg-deu": "Gewählten Auszug verbinden", "lg-ell": "Αφορούν επιλεγμένο κομμάτι", "lg-eng": "Relate selected fragment", "lg-fra": "Relier le fragment sélectionné", "lg-ita": "Collegare frammento selezionato", "lg-nep": "चयन गरिएको टुक्रा जोड्नुहोस्", "lg-spa": "Relacionar fragmento seleccionado"}'),
(15361896,	'dd30',	'dd32',	'dd6',	'no',	'si',	'si',	2,	'dd',	'no',	'[{"dd626":"dd16"}]',	'{
  "info": "Propiedades NO standarizadas. Sólo en puebas",
  "section_config": {
    "list_line": "single"
  }
}',	'{"info": "Propiedades NO standarizadas. Sólo en puebas", "section_config": {"list_line": "single"}}',	'{"lg-cat": "Maquetació", "lg-deu": "Layout", "lg-ell": "επιφάνεια εργασίας", "lg-eng": "Layout", "lg-fra": "Mise en page", "lg-ita": "Impaginazione", "lg-spa": "Maquetación"}'),
(15361897,	'dd151',	'dd427',	'dd206',	'no',	'si',	'si',	1,	'dd',	'no',	'',	'',	NULL,	'{"lg-cat": "Enllaç", "lg-deu": "Link", "lg-ell": "Σύνδεσμος", "lg-eng": "Link", "lg-fra": "Lien ", "lg-ita": "Collegamento", "lg-nep": "लिङ्क", "lg-spa": "Enlace"}'),
(15361898,	'dd1660',	'dd692',	'dd395',	'no',	'si',	'si',	19,	'dd',	'si',	NULL,	'{"name":"proceso_completado"}',	'{"name": "proceso_completado"}',	'{"lg-cat": "Procés completat", "lg-deu": "Prozess abgeschlossen", "lg-ell": "Η διαδικασία ολοκληρώθηκε", "lg-eng": "Process completed", "lg-eus": "Prozesua amaitu da", "lg-fra": "Processus terminé", "lg-ita": "Processo completato", "lg-nep": "प्रक्रिया पूरा भयो", "lg-por": "Processo completo", "lg-spa": "Proceso completado"}'),
(15361899,	'dd1376',	'dd622',	'dd1233',	'no',	'si',	'si',	2,	'dd',	'si',	'[{"dd57":"ww33"}]',	'{"info":"For construct the ENUM value of the field, it need to be changed from the -dato- (without language) to the final -enum- value, dato:enumvalue","data_to_be_used":"dato","enum":{"1":"yes","2":"no"}}',	NULL,	'{"lg-spa": "menu"}'),
(15361900,	'dd364',	'dd154',	'dd530',	'no',	'si',	'si',	9,	'dd',	'no',	'[{"dd6":"rsc106"},{"dd9":"rsc116"}]',	'{"css":{".wrap_component":{"mixin":[".width_50",".vertical",".line_top"],"style":{}},".label":{"style":{}},".content_data":{"style":{}}}}',	'{"css": {".wrapper_component": {"grid-row": "3", "grid-column": "1 / span 5"}}}',	'{"lg-cat": "Entitat a carrec", "lg-deu": "Verantwortliche Einheit", "lg-ell": "Φορέα που είναι αρμόδιος", "lg-eng": "Entity responsible", "lg-fra": "Entité en charge", "lg-ita": "Soggetto incaricato", "lg-spa": "Entidad a cargo"}'),
(15361901,	'dd1289',	'dd1137',	'dd347',	'no',	'si',	'si',	13,	'dd',	'no',	'[{"dd1229":"rsc264"}]',	'{"check_publication_value":false,"global_table_maps_DES":[{"table_tipo":"test19","columns_map":[{"target_column":"full_data","source_columns":["image"],"format":"string","separator":", "},{"target_column":"full_data2","source_columns":["image"]}]}]}',	'{"check_publication_value": false}',	'{"lg-spa": "image"}'),
(15361902,	'dd1342',	'dd137',	'dd6',	'no',	'si',	'si',	33,	'dd',	'no',	'[{"dd626":"dd963"}]',	NULL,	NULL,	'{"lg-deu": "Zielmodelle", "lg-eng": "Target models", "lg-fra": "Modèles de destination", "lg-spa": "Modelos de destino"}'),
(15361903,	'dd1343',	'dd1342',	'dd8',	'no',	'si',	'si',	1,	'dd',	'no',	NULL,	NULL,	NULL,	'{"lg-deu": "Identifizierung", "lg-eng": "Identification", "lg-fra": "Identification", "lg-spa": "identificación"}'),
(15361904,	'dd1368',	'dd147',	'dd395',	'no',	'si',	'si',	28,	'dd',	'si',	'null',	'{"name":"layer"}',	'{"name": "layer"}',	'{"lg-cat": "Capa", "lg-deu": "Ebene", "lg-eng": "Layer", "lg-fra": "Couche", "lg-ita": "Strato", "lg-spa": "Capa"}'),
(15361905,	'dd1412',	'dd1100',	'dd441',	'no',	'si',	'si',	4,	'dd',	'no',	NULL,	'{"thesaurus":{"term":"dd1399","is_descriptor":"dd1445","is_indexable":false,"parent":"dd1410"}}',	'{"thesaurus": {"term": "dd1399", "parent": "dd1410", "is_indexable": false, "is_descriptor": "dd1445"}}',	'{"lg-deu": "Karte der Sektion", "lg-eng": "section map", "lg-fra": "Plan de section", "lg-spa": "Section map"}'),
(15361906,	'dd953',	'dd938',	'dd177',	'no',	'si',	'si',	3,	'dd',	'no',	NULL,	NULL,	NULL,	'{"lg-deu": "Neu", "lg-eng": "New", "lg-fra": "Nouveau", "lg-ita": "Nuovo", "lg-spa": "Nuevo"}'),
(15361907,	'dd325',	'dd319',	'dd395',	'no',	'si',	'si',	1,	'dd',	'si',	NULL,	'{"name":"velocidad_de_reproduccion"}',	'{"name": "play_speed"}',	'{"lg-cat": "Velocitat de reproducció", "lg-deu": "Wiedergabegeschwindigkeit", "lg-ell": "Ταχύτητα αναπαραγωγής", "lg-eng": "Play speed", "lg-fra": "Vitesse de lecture", "lg-ita": "Velocità di riproduzione", "lg-spa": "Velocidad de reproducción"}'),
(15361908,	'dd955',	'dd918',	'dd635',	'no',	'si',	'si',	6,	'dd',	'no',	'null',	NULL,	NULL,	'{"lg-deu": "Datum der Veraltung", "lg-eng": "Deprecation date", "lg-fra": "Date de dépréciation", "lg-spa": "Fecha de deprecación"}'),
(15361909,	'dd1644',	'dd1325',	'dd9',	'no',	'si',	'si',	8,	'dd',	'no',	NULL,	NULL,	'{"css": {".wrapper_component": {"grid-row-start": "2", "grid-column-end": "11", "grid-column-start": "5"}, ".wrapper_component > .content_data99999": {"height": "6rem"}}}',	'{"lg-cat": "Desenvolupador", "lg-deu": "Entwickler", "lg-ell": "Προγραμματιστής", "lg-eng": "Developer", "lg-eus": "Garatzailea", "lg-fra": "Développeur", "lg-ita": "Sviluppatore", "lg-por": "Desenvolvedor", "lg-spa": "Desarollador"}'),
(15361910,	'dd868',	'dd867',	'dd8',	'no',	'si',	'si',	1,	'dd',	'no',	NULL,	NULL,	NULL,	'{"lg-deu": "Allgemeine Informationen", "lg-eng": "General information", "lg-fra": "Information générale", "lg-ita": "Informazione generale", "lg-spa": "Información general"}'),
(15361911,	'dd665',	'dd659',	'dd395',	'no',	'si',	'si',	6,	'dd',	'si',	NULL,	'{"name":"contiene"}',	'{"name": "contains"}',	'{"lg-cat": "Conté", "lg-deu": "Enthält", "lg-ell": "Περιέχει", "lg-eng": "Contains", "lg-fra": "Contenu", "lg-ita": "Contiene", "lg-nep": "समावेश गर्दछ", "lg-spa": "Contiene"}'),
(15361912,	'dd109',	'dd118',	'dd395',	'no',	'si',	'si',	5,	'dd',	'no',	'null',	'{
  "name": "tool_replace_component_data_dialog"
}',	'{"name": "tool_replace_component_data_dialog"}',	'{"lg-cat": "Es reemplaçarà el contingut del camp: %1$s en els %2$s registres trobats actuals, amb el valor: %3$s en l''idioma: %4$s", "lg-deu": "Wird ersetzt: Inhalt des Feldes %1$s der %2$s aktuellen Einträge mit dem Wert %3$s für die Sprache %4$s", "lg-ell": "το περιεχόμενο πεδίο θα πρέπει να αντικατασταθεί ως εξής: %1$s σε o %2$s τρέχουσες εγγραφές με την τιμή: %3$s για τη γλώσσα: %4$s", "lg-eng": "Will be replaced the field content : %1$s in %2$s current records, with the value: %3$s in the current lang: %4$s", "lg-fra": "Le contenu du champ : %1$s dans les enregistrements %2$s actuels sera remplacé par la valeur : %3$s pour la langue : %4$s.", "lg-ita": "Si sostituirà il contenuto del campo: %1$s nei %2$s registri attuali con il valore: %3$s per la lingua: %4$s", "lg-spa": "Se reemplazará el contenido del campo: %1$s en los %2$s registros actuales con el valor: %3$s para el idioma: %4$s"}'),
(15361913,	'dd967',	'dd996',	'dd91',	'no',	'si',	'si',	2,	'dd',	'no',	'[{"dd9":"dd1326"},{"dd580":"dd999"}]',	NULL,	NULL,	'{"lg-deu": "Liste", "lg-eng": "List", "lg-fra": "Liste", "lg-spa": "Listado"}'),
(15361914,	'dd276',	'dd785',	'dd392',	'no',	'si',	'si',	23,	'dd',	'si',	NULL,	'',	NULL,	'{"lg-deu": "Index Tags", "lg-ell": "σελιδοδείκτες", "lg-eng": "Tags indexing", "lg-fra": "Libellés d''indexation", "lg-ita": "Etichette indicizzazione", "lg-spa": "Etiquetas indexación"}'),
(15361915,	'dd666',	'dd659',	'dd395',	'no',	'si',	'si',	7,	'dd',	'si',	NULL,	'{"name":"empieza_con"}',	'{"name": "begins_with"}',	'{"lg-cat": "Comença amb", "lg-deu": "Beginnt mit", "lg-ell": "Ξεκινήστε με", "lg-eng": "Begins with", "lg-fra": "Commence avec", "lg-ita": "Inizia con", "lg-nep": "बाट सुरु हुन्छ", "lg-spa": "Empieza con"}'),
(15361916,	'dd1224',	'dd196',	'dd11',	'no',	'si',	'si',	7,	'dd',	'no',	'[{"dd6":"dd128"},{"dd9":"dd132"},{"dd9":"dd452"},{"dd1747":"dd330"}]',	'',	NULL,	'{"lg-cat": "Primera publicación usuari", "lg-deu": "Erste Publikation Benutzer", "lg-ell": "Δημοσίευση πρώτου χρήστη", "lg-eng": "First publication user", "lg-fra": "Première publication d''un utilisateur", "lg-ita": "Prima pubblicazione utente", "lg-nep": "पहिलो प्रकाशन प्रयोगकर्ता", "lg-spa": "Primera publicación usuario"}'),
(15361917,	'dd629',	'dd623',	'dd91',	'no',	'si',	'si',	2,	'dd',	'no',	'[{"dd9":"dd624"},{"dd9":"dd642"},{"dd11":"dd654"},{"dd57":"dd640"},{"dd57":"dd641"},{"dd57":"dd648"}]',	NULL,	NULL,	'{"lg-deu": "Liste", "lg-eng": "List", "lg-fra": "Liste", "lg-ita": "Elenco", "lg-spa": "List"}'),
(15361918,	'dd1442',	'dd1390',	'dd11',	'no',	'si',	'si',	1,	'dd',	'no',	'[{"dd6":"dd1440"},{"dd9":"dd594"}]',	'{"css":{".wrap_component":{"mixin":[".vertical"],"style":{"width":"15%","height":"112px","background-color":"rgb(133, 210, 166)"}}}}',	'{"css": {".wrapper_component": {"grid-column": "span 1", "background-color": "#85d2a6"}, ".wrapper_component > .label": {"color": "#ffffff"}}}',	'{"lg-deu": "Web element type", "lg-eng": "Web element type", "lg-fra": "Type d''élément web", "lg-spa": "Web element type"}'),
(15361919,	'dd506',	'dd536',	'dd395',	'no',	'si',	'si',	1,	'dd',	'si',	NULL,	'{
  "name": "tool_structuration"
}',	'{"name": "tool_structuration"}',	'{"lg-cat": "Estructuració", "lg-deu": "Strukturierung", "lg-ell": "δόμηση", "lg-eng": "Structuration", "lg-fra": "Structuration de l''entretien", "lg-ita": "Strutturazione", "lg-spa": "Estructuración"}'),
(15361920,	'dd1575',	'dd785',	'dd395',	'no',	'si',	'si',	71,	'dd',	'si',	NULL,	'{"name":"borrar_secciones"}',	'{"name": "borrar_secciones"}',	'{"lg-cat": "Esborrar seccions", "lg-deu": "Sektionen löschen", "lg-ell": "διαγραφή ενοτήτων", "lg-eng": "Delete sections", "lg-fra": "Supprimer des sections", "lg-ita": "Eliminare sezioni", "lg-nep": "खण्डहरू मेटाउनुहोस्", "lg-spa": "Borrar secciones"}'),
(15361921,	'dd922',	'rsc480',	'dd6',	'no',	'si',	'si',	1,	'dd',	'si',	'[{"dd626":"dd22"}]',	NULL,	'{"color": "#e4b387"}',	'{"lg-cat": "Categoria laboral / Càrrec", "lg-deu": "Berufsgruppe / Titel", "lg-ell": "Κατηγορία εργασίας / Τίτλος", "lg-eng": "Labor Category / Title", "lg-fra": "Catégorie d''emploi / poste", "lg-ita": "Categoria Lavorativa / Responsabile", "lg-spa": "Categoría Laboral / Cargo"}'),
(15361922,	'dd671',	'dd659',	'dd395',	'no',	'si',	'si',	12,	'dd',	'si',	NULL,	'{"name":"mayor_o_igual_que"}',	'{"name": "greater_than_or_equal"}',	'{"lg-cat": "Major o igual que", "lg-deu": "Grösser oder gleich", "lg-ell": "Περισσότερο από ή ίσο με", "lg-eng": "Greater than or equal", "lg-fra": "Supérieur ou égal à", "lg-ita": "Maggiore di", "lg-nep": "भन्दा ठूलो वा बराबर", "lg-spa": "Mayor o igual que"}'),
(15361923,	'dd942',	'rsc480',	'dd6',	'no',	'si',	'si',	11,	'dd',	'no',	'[{"dd626":"dd22"}]',	NULL,	'{"color": "#e4b387"}',	'{"lg-cat": "Tipus d''associació / grup", "lg-deu": "Typ der Verbindung / Gruppe", "lg-ell": "Τύπος της ένωσης / ομάδας", "lg-eng": "Type of association / group", "lg-fra": "Type d''association / de groupe", "lg-ita": "Tipo di associazione / gruppo", "lg-spa": "Tipo de asociación / grupo"}'),
(15361924,	'dd1085',	'dd537',	'dd395',	'no',	'si',	'si',	12,	'dd',	'si',	'',	'{"name":"el_archivo_subido_fue_solo_parcialmente_cargado"}',	'{"name": "uploaded_file_was_only_partially_uploaded"}',	'{"lg-cat": "El fitxer carregat va ser només parcialment carregat", "lg-deu": "Die hochgeladene Datei konnte nur partiell geladen werden.", "lg-ell": "Το αρχείο που μεταφορτώθηκε ήταν μόνο μερικώς φορτωμένο", "lg-eng": "The uploaded file was only partially uploaded", "lg-fra": "Le fichier téléchargé n''a été que partiellement téléchargé", "lg-ita": "L''archivio caricato è stato caricato solo parzialmente", "lg-spa": "El archivo subido fue sólo parcialmente cargado"}'),
(15361925,	'dd608',	'dd785',	'dd395',	'no',	'si',	'si',	2,	'dd',	'no',	'null',	'{
  "name": "max"
}',	'{"name": "max"}',	'{"lg-cat": "Màx.", "lg-deu": "Max.", "lg-ell": "Μέγ", "lg-eng": "Max", "lg-fra": "Max", "lg-ita": "Max", "lg-nep": "अधिकतम", "lg-spa": "Máx."}'),
(15361926,	'dd1415',	'dd1100',	'dd177',	'no',	'si',	'si',	7,	'dd',	'no',	NULL,	'',	'null',	'{"lg-deu": "Neu", "lg-eng": "New", "lg-fra": "Nouveau", "lg-spa": "Nuevo"}'),
(15361927,	'dd1522',	'dd1535',	'dd530',	'no',	'si',	'si',	2,	'dd',	'no',	'[{"dd6":"dd128"},{"dd9":"dd132"}]',	NULL,	'{"css": {".wrapper_component": {"grid-column": "span 2"}}}',	'{"lg-deu": "Benutzername", "lg-eng": "User", "lg-fra": "Utilisateur", "lg-spa": "Usuario"}'),
(15361928,	'dd1593',	'dd1592',	'dd429',	'no',	'si',	'si',	1,	'dd',	'no',	'[{"dd352":"dd1594"}]',	'{"css":{".wrap_component":{"style":{"display":"none"}}}}',	'{"css": {".wrap_component": {"mixin": [".vertical"], "style": {"width": "50%", "border-right": "none"}}}, "source": {"records_mode": "list", "request_config": [{"sqo": {"section_tipo": [{"source": "self"}]}, "show": {"ddo_map": [{"tipo": "dd156", "parent": "self", "section_tipo": "self"}], "value_with_parents": true}}]}}',	'{"lg-cat": "Dependent de", "lg-deu": "Abhängig von", "lg-ell": "εξαρτώμενος", "lg-eng": "Dependent of", "lg-fra": "Dépend de", "lg-ita": "Dipendente da", "lg-spa": "Dependiente de"}'),
(15361929,	'dd553',	'dd389',	'dd395',	'no',	'si',	'si',	25,	'dd',	'si',	NULL,	'{
  "name": "sync_last_version"
}',	'{"name": "sync_last_version"}',	'{"lg-cat": "Sincronitzant l''informació amb l''última versió", "lg-deu": "Synchronisiert Information mit der letzten Version", "lg-ell": "Συγχρονισμός πληροφοριών με την τελευταία έκδοση", "lg-eng": "Synchronizing information with the latest version", "lg-fra": "Synchronisation des informations avec la dernière version", "lg-ita": "Sincronizzando l''informazione con l''ultima versione", "lg-nep": "नवीनतम संस्करण संग जानकारी सिंक्रोनाइज गर्दै", "lg-spa": "Sincronizando la información con la última versión"}'),
(15361930,	'dd116',	'dd390',	'dd395',	'no',	'si',	'si',	7,	'dd',	'si',	'',	'{"name":"preview_de_importacion"}',	'{"name": "import_preview"}',	'{"lg-cat": "Previsualització d''importació", "lg-deu": "Vorschau des Imports", "lg-ell": "Προεπισκόπηση εισαγωγής", "lg-eng": "Import preview", "lg-fra": "Importation de l''aperçu", "lg-ita": "Previsualizzazione del l''importazione", "lg-spa": "Previsualización de importación"}'),
(15361931,	'dd330',	'dd129',	'dd1747',	'no',	'si',	'si',	1,	'dd',	'si',	'',	'{"css":{".wrap_component":{"mixin":[".vertical",".inverse"],"style":{"width":"8%","border-bottom-right-radius":"8px"}}}}',	'{"css": {".wrapper_component": {"grid-row": "1", "grid-column": "span 1"}}}',	'{"lg-cat": "Id", "lg-deu": "Id", "lg-ell": "Αναγν", "lg-eng": "Id", "lg-fra": "Id", "lg-ita": "Id", "lg-spa": "Id"}'),
(15361932,	'dd132',	'dd129',	'dd9',	'no',	'si',	'si',	6,	'dd',	'no',	'',	'{"mandatory":true,"unique":{"check":true,"disable_save":true,"server_check":true},"css":{".wrap_component":{"mixin":[".vertical"],"style":{"width":"20%","background-color":"#FFE2AB","border-right":"1px solid #d0d0d0","clear":"left"}}}}',	'{"css": {".wrapper_component": {"grid-column": "span 2", "background-color": "#FFE2AB"}}, "unique": {"check": true, "disable_save": true, "server_check": true}, "mandatory": true}',	'{"lg-cat": "Usuari", "lg-deu": "Benutzername", "lg-ell": "χρήστη", "lg-eng": "Username", "lg-eus": "Erabiltzailea", "lg-fra": "Utilisateur", "lg-ita": "Utente", "lg-spa": "Usuario"}'),
(15361933,	'dd537',	'dd785',	'dd392',	'no',	'si',	'si',	10,	'dd',	'si',	NULL,	NULL,	NULL,	'{"lg-deu": "Import a/v", "lg-eng": "a/v import", "lg-fra": "Importation a/v", "lg-ita": "Importazione a/v", "lg-spa": "Importación a/v"}'),
(15361934,	'dd236',	'dd234',	'dd8',	'no',	'si',	'si',	1,	'dd',	'si',	'',	NULL,	'{"css": {".content_data": {"grid-template-columns": "repeat(10, 1fr)"}}}',	'{"lg-cat": "General", "lg-deu": "Allgemein", "lg-ell": "γενικός", "lg-eng": "General", "lg-fra": "Général", "lg-ita": "Generale", "lg-spa": "General"}'),
(15361935,	'dd1334',	'dd482',	'dd580',	'no',	'si',	'si',	1,	'dd',	'no',	NULL,	'{"css":{".wrap_component":{"mixin":[".vertical"],"style":{"width":"50%","height":"80vh","clear":"left"}}}}',	'{"css": {".wrapper_component": {"grid-column": "span 5"}, ".wrapper_component >.content_data": {"min-height": "60vh"}}}',	'{"lg-deu": "Ontologie", "lg-eng": "Ontology", "lg-fra": "Ontologie", "lg-spa": "Ontologia"}'),
(15361936,	'dd520',	'dd516',	'dd247',	'no',	'si',	'si',	3,	'dd',	'no',	NULL,	NULL,	NULL,	'{"lg-cat": "Projecte", "lg-deu": "Projekt", "lg-ell": "Έργο", "lg-eng": "Project", "lg-fra": "Projet", "lg-ita": "Progetto", "lg-spa": "Proyecto"}'),
(15361937,	'dd1225',	'dd196',	'dd11',	'no',	'si',	'si',	8,	'dd',	'no',	'[{"dd6":"dd128"},{"dd9":"dd132"},{"dd9":"dd452"},{"dd1747":"dd330"}]',	NULL,	NULL,	'{"lg-cat": "Última publicació usuari", "lg-deu": "Letzte Veröffentlichung Benutzer/in", "lg-ell": "Τελευταία δημοσίευση χρήστη", "lg-eng": "Last publication user", "lg-fra": "Dernière publication de l''utilisateur", "lg-ita": "Ultima pubblicazione utente", "lg-nep": "पछिल्लो प्रकाशन प्रयोगकर्ता", "lg-spa": "Última publicación usuario"}'),
(15361938,	'dd510',	'dd536',	'dd395',	'no',	'si',	'si',	5,	'dd',	'si',	NULL,	'{
  "name": "vincular_recurso"
}',	'{"name": "vincular_recurso"}',	'{"lg-cat": "Vincular recurs", "lg-deu": "Ressource verknüpfen", "lg-eng": "Link resource", "lg-fra": "Lien avec une ressource", "lg-ita": "Associare risorsa", "lg-spa": "Vincular recurso"}'),
(15361939,	'dd1248',	'dd391',	'dd395',	'no',	'si',	'si',	85,	'dd',	'no',	NULL,	'{
  "name": "choose_page_between"
}',	'{"name": "choose_page_between"}',	'{"lg-cat": "Trieu la pàgina entre ${page_in} i ${page_out}. Total de pàgines: ${total_pàgina}.", "lg-deu": "Seite wählbar zwischen ${page_in} und ${page_out}. Totale Seiten: ${total_pages}.", "lg-ell": "Η σελίδα επιλέγεται μεταξύ ${page_in} και ${page_out}. Σύνολο σελίδων: ${total_pages}.", "lg-eng": "Choose page between ${page_in} and ${page_out}. Total pages: ${total_pages}.", "lg-fra": "Page sélectionnable entre ${page_in} et ${page_out}. Nombre total de pages : ${total_pages}.", "lg-ita": "Pagina selezionabile tra ${page_in} e ${page_out}. Pagine totali: ${total_pages}.", "lg-spa": "Página seleccionable entre ${page_in} y ${page_out}. Total de páginas: ${total_pages}."}'),
(15361940,	'dd512',	'dd449',	'dd395',	'no',	'si',	'si',	5,	'dd',	'si',	NULL,	'{"name":"structurations"}',	'{"name": "structurations"}',	'{"lg-cat": "Estructuracions", "lg-deu": "Strukturierungen", "lg-eng": "Structurations", "lg-fra": "Structuration de l''entreprise", "lg-ita": "Strutturazioni", "lg-spa": "Estructuraciones"}'),
(15361941,	'dd450',	'dd449',	'dd395',	'no',	'si',	'si',	2,	'dd',	'si',	NULL,	'{"name":"timecodes"}',	'{"name": "timecodes"}',	'{"lg-cat": "Codis de temps", "lg-deu": "Zeitcodes", "lg-ell": "Κωδικός χρόνου", "lg-eng": "Time codes", "lg-fra": "Codes temporels", "lg-ita": "Codici temporali", "lg-nep": "समय कोडहरू", "lg-spa": "Códigos de tiempo"}'),
(15361942,	'dd459',	'dd449',	'dd395',	'no',	'si',	'si',	12,	'dd',	'si',	NULL,	'{"name":"cabecera"}',	'{"name": "head"}',	'{"lg-cat": "Capçalera", "lg-deu": "Kopfzeile", "lg-ell": "κεφάλι", "lg-eng": "Header", "lg-fra": "Entête", "lg-ita": "Intestazione", "lg-spa": "Cabecera"}'),
(15361943,	'dd994',	'dd153',	'dd581',	'no',	'si',	'si',	7,	'dd',	'no',	NULL,	NULL,	NULL,	'{"lg-cat": "Últims canvis", "lg-deu": "Letzte Änderungen", "lg-eng": "Latest changes", "lg-fra": "Dernières modifications", "lg-ita": "Ultime modifiche", "lg-spa": "Últimos cambios"}'),
(15361944,	'dd792',	'dd785',	'dd395',	'no',	'si',	'si',	20,	'dd',	'si',	'',	'{"name":"tool_relation"}',	'{"name": "tool_relation"}',	'{"lg-ara": "علاقات", "lg-cat": "Relacions", "lg-deu": "Beziehungen", "lg-ell": "σχέσεις", "lg-eng": "Relations", "lg-fra": "Relations", "lg-ita": "Relazioni", "lg-nep": "सम्बन्धहरू", "lg-spa": "Relaciones"}'),
(15361945,	'dd129',	'dd128',	'dd8',	'no',	'si',	'si',	1,	'dd',	'si',	'',	NULL,	'{"css": {".content_data": {"grid-template-columns": "repeat(10, 10%)"}}}',	'{"lg-cat": "Informació General", "lg-deu": "Allgemeine Informationen", "lg-ell": "γενικές πληροφορίες", "lg-eng": "General information", "lg-fra": "Information Générale", "lg-ita": "Informazione Generale", "lg-spa": "Información General"}'),
(15361946,	'dd799',	'dd1325',	'dd9',	'no',	'si',	'si',	4,	'dd',	'si',	'',	'{"css":{".wrap_component":{"mixin":[".vertical"],"style":{"width":"30%"}}}}',	'{"css": {".wrapper_component": {"grid-column": "span 4"}}}',	'{"lg-deu": "Label", "lg-eng": "Label", "lg-fra": "Libellé", "lg-spa": "Etiqueta"}'),
(15361947,	'dd285',	'dd785',	'dd395',	'no',	'si',	'si',	25,	'dd',	'si',	NULL,	'{
  "name": "import_bibtex_help"
}',	'{"name": "import_bibtex_help"}',	'{"lg-cat": "Afegeixi el fitxer BibTeX i els corresponents fitxers PDF des del seu disc dur. Un cop carregats, escollir ''Importar fitxers''", "lg-deu": "Fügen Sie die BIBTex-Datei und die zugehörigen PDF-Dateien von Ihrer Festplatte hinzu. Sobald sie geladen sind, wählen Sie ''Dateien importieren''.", "lg-ell": "Προσθέστε το αρχείο BibTeX και τα αντίστοιχα αρχεία PDF από το σκληρό σας δίσκο. Μόλις φορτωθεί, επιλέξτε ''Εισαγωγή αρχείων »", "lg-eng": "Add the BibTeX file and the corresponding PDF files from your hard disk. Once loaded, select ''Import files''", "lg-fra": "Ajoutez le fichier BIBTex et les fichiers PDF correspondants à partir de votre disque dur. Une fois le fichier téléchargé, sélectionnez ''Importer des fichiers''.", "lg-ita": "Aggiungere il file BIBTex e i corrispondenti files PDF dal suo disco duro. Una volta caricati, seleziona Importare files", "lg-spa": "Añada el fichero BIBTex y los correspondientes ficheros PDF desde su disco duro. Una vez cargados, seleccione ''Importar ficheros''"}'),
(15361948,	'dd559',	'dd555',	'dd557',	'no',	'si',	'si',	2,	'dd',	'no',	NULL,	NULL,	NULL,	'{"lg-deu": "Temporal Frame", "lg-eng": "Temporal frame", "lg-fra": "Cadre temporel", "lg-ita": "Quadro temporale", "lg-spa": "Marco temporal"}'),
(15361949,	'dd560',	'dd555',	'dd557',	'no',	'si',	'si',	3,	'dd',	'no',	NULL,	NULL,	NULL,	'{"lg-deu": "Spatial Frame", "lg-eng": "Spatial frame", "lg-fra": "Cadre spatial", "lg-ita": "Quadro spaziale", "lg-spa": "Marco espacial"}'),
(15361950,	'dd575',	'dd562',	'dd247',	'no',	'si',	'si',	3,	'dd',	'no',	NULL,	NULL,	NULL,	'{"lg-cat": "Projecte", "lg-deu": "Projekt", "lg-ell": "Έργο", "lg-eng": "Project", "lg-fra": "Projet", "lg-ita": "Progetto", "lg-spa": "Proyecto"}'),
(15361951,	'dd578',	'dd577',	'dd80',	'no',	'si',	'si',	1,	'dd',	'no',	'[{"dd6":"dd562"},{"dd9":"dd565"}]',	NULL,	NULL,	'{"lg-cat": "Incert", "lg-deu": "Unsicher", "lg-ell": "Αβέβαιη", "lg-eng": "Uncertain", "lg-fra": "Incertitude", "lg-ita": "Incerto", "lg-spa": "Incierto"}'),
(15361952,	'dd555',	'dd193',	'dd556',	'no',	'si',	'si',	7,	'dd',	'no',	NULL,	NULL,	NULL,	'{"lg-deu": "Dataframes", "lg-eng": "dataframes", "lg-fra": "Fiches de données", "lg-ita": "Quadri dei dati", "lg-spa": "Marcos de datos"}'),
(15361953,	'dd558',	'dd555',	'dd557',	'no',	'si',	'si',	1,	'dd',	'si',	NULL,	NULL,	NULL,	'{"lg-cat": "Incertesa", "lg-deu": "Unsicherheit", "lg-ell": "Αβεβαιότητα", "lg-eng": "Uncertainty", "lg-fra": "Incertitude", "lg-ita": "Incertezza", "lg-spa": "Incertidumbre"}'),
(15361954,	'dd933',	'dd918',	'dd10',	'no',	'si',	'si',	9,	'dd',	'si',	NULL,	'{
  "css": {
    ".wrap_component": {
      "mixin": [
        ".vertical"
      ],
      "style": {
        "width": "100%"
      }
    }
  }
}',	'{"css": {".wrap_component": {"mixin": [".vertical"], "style": {"width": "100%"}}}}',	'{"lg-deu": "Anmerkungen zur Version", "lg-eng": "Release notes", "lg-fra": "Note de la version", "lg-ita": "Note della versione", "lg-spa": "Notas de la versión"}'),
(15361955,	'dd360',	'dd785',	'dd395',	'no',	'si',	'si',	35,	'dd',	'si',	NULL,	'{"name":"tool_semantic_nodes"}',	'{"name": "tool_semantic_nodes"}',	'{"lg-cat": "Relacions semàntiques", "lg-deu": "Semantische Beziehungen", "lg-ell": "σημασιολογικές σχέσεις", "lg-eng": "Semantic nodes", "lg-fra": "Relations sémantiques", "lg-ita": "Relazioni semiantiche", "lg-spa": "Relaciones semánticas"}'),
(15361956,	'dd343',	'dd342',	'dd395',	'no',	'si',	'si',	3,	'dd',	'si',	NULL,	'{
  "name": "delete_component_tipo_of_section_tipo"
}',	'{"name": "delete_component_tipo_of_section_tipo"}',	'{"lg-deu": "Ganze Komponente der Sektion löschen", "lg-eng": "Delete all data of the component in section", "lg-fra": "Supprimer tous les composants de la section", "lg-ita": "Cancellare tutto il componente della sezione", "lg-spa": "Borrar todo el componente de la sección"}'),
(15361957,	'dd436',	'dd785',	'dd395',	'no',	'si',	'si',	39,	'dd',	'si',	NULL,	'{
  "name": "leer"
}',	'{"name": "leer"}',	'{"lg-cat": "Llegir", "lg-deu": "Lesen", "lg-ell": "ανάγνωση", "lg-eng": "Read", "lg-fra": "Lire", "lg-ita": "Leggere", "lg-spa": "Leer"}'),
(15361958,	'dd169',	'dd266',	'dd429',	'no',	'si',	'si',	1,	'dd',	'no',	'[{"dd352":"dd24"}]',	'{
  "css": {
    ".wrap_component": {
      "mixin": [
        ".vertical"
      ],
      "style": {
        "width": "25%"
      }
    }
  }
}',	'{"css": {".wrap_component": {"mixin": [".vertical"], "style": {"width": "25%"}}}}',	'{"lg-cat": "Dependent de", "lg-deu": "Abhängig von", "lg-eng": "Dependent of", "lg-fra": "Dépend de", "lg-ita": "Dipendente da", "lg-spa": "Dependiente de"}'),
(15361959,	'dd652',	'dd785',	'dd395',	'no',	'si',	'si',	44,	'dd',	'si',	NULL,	'{"name":"y"}',	'{"name": "and"}',	'{"lg-cat": "i", "lg-deu": "und", "lg-ell": "και", "lg-eng": "and", "lg-fra": "Y", "lg-ita": "e", "lg-nep": "र", "lg-spa": "y"}'),
(15361960,	'dd676',	'dd785',	'dd395',	'no',	'si',	'si',	46,	'dd',	'si',	NULL,	'{
  "name": "tool_ts_print"
}',	'{"name": "tool_ts_print"}',	'{"lg-cat": "Impressió del tesaure", "lg-deu": "Druck des Thesaurus", "lg-ell": "Θησαυρός εκτύπωση", "lg-eng": "Thesaurus print", "lg-fra": "Impression du thésaurus", "lg-ita": "Stampa del thesaurus", "lg-spa": "Impresión del tesauro"}'),
(15361961,	'dd1068',	'dd785',	'dd395',	'no',	'si',	'si',	48,	'dd',	'no',	NULL,	'{
  "name": "cataloging"
}',	'{"name": "cataloging"}',	'{"lg-cat": "Catalogació", "lg-deu": "Katalogisierung", "lg-ell": "Καταλογογράφηση", "lg-eng": "Cataloging", "lg-fra": "Catalogage", "lg-ita": "Catalogazione", "lg-spa": "Catalogación"}'),
(15361962,	'dd1069',	'dd785',	'dd395',	'no',	'si',	'si',	49,	'dd',	'si',	NULL,	'{"name":"preset"}',	'{"name": "preset"}',	'{"lg-cat": "Config", "lg-deu": "Konfig", "lg-ell": "προεπιλογή", "lg-eng": "Preset", "lg-fra": "Configuration", "lg-ita": "Config", "lg-nep": "कन्फिगरेसन", "lg-spa": "Config"}'),
(15361963,	'dd1250',	'dd785',	'dd395',	'no',	'si',	'si',	50,	'dd',	'si',	NULL,	'{
  "name": "tool_sort"
}',	'{"name": "tool_sort"}',	'{"lg-cat": "Eina d&#039;ordenació", "lg-deu": "Sortierwerkzeug", "lg-eng": "Sorting tool", "lg-fra": "Outil de tri", "lg-ita": "Strumento di organizzazione", "lg-spa": "Herramienta de ordenación"}'),
(15361964,	'dd683',	'dd118',	'dd395',	'no',	'si',	'si',	8,	'dd',	'si',	NULL,	'{
  "name": "tool_add_component_data"
}',	'{"name": "tool_add_component_data"}',	'{"lg-cat": "Afegir contingut al camp", "lg-deu": "Inhalt dem Feld hinzufügen", "lg-ell": "Προσθέστε περιεχόμενο στο πεδίο", "lg-eng": "Add content to the field", "lg-fra": "Ajouter du contenu au champ", "lg-ita": "Aggiungere contenuto nel campo", "lg-spa": "Añadir contenido al campo"}'),
(15361965,	'dd1008',	'dd1000',	'dd177',	'no',	'si',	'si',	2,	'dd',	'no',	NULL,	NULL,	NULL,	'{"lg-cat": "Nou", "lg-deu": "Neu", "lg-ell": "Νέα", "lg-eng": "New", "lg-fra": "Nouveau", "lg-ita": "Nuovo", "lg-spa": "Nuevo"}'),
(15361966,	'dd1061',	'dd785',	'dd395',	'no',	'si',	'si',	58,	'dd',	'si',	'null',	'{
  "name": "weight"
}',	'{"name": "weight"}',	'{"lg-cat": "Pes", "lg-deu": "Gewicht", "lg-ell": "Βάρος", "lg-eng": "Weight", "lg-fra": "Poids", "lg-ita": "Peso", "lg-spa": "Peso"}'),
(15361967,	'dd684',	'dd118',	'dd395',	'no',	'si',	'si',	9,	'dd',	'si',	NULL,	'{
  "name": "tool_add_component_data_dialog"
}',	'{"name": "tool_add_component_data_dialog"}',	'{"lg-cat": "S''afegirà o s’eliminarà el contingut al camp: %1$s en els %2$s registres actuals", "lg-deu": "Wird ergänzt oder gelöscht: Inhalt des Feldes %1$s in den %2$s aktuellen Einträgen", "lg-ell": "Το περιεχόμενο θα προστεθεί ή θα καταργηθεί από το πεδίο:%1$ s στις τρέχουσες εγγραφές% 2$s", "lg-eng": "The content will be added or removed from the field:%1$ s in the %2$s current records", "lg-fra": "Le contenu du champ : %1$s sera ajouté ou supprimé dans les %2$s enregistrements actuels.", "lg-ita": "Il contenuto verrà aggiunto o rimosso dal campo:%1$s nei% 2$s registri attuali", "lg-spa": "Se añadirá o eliminará el contenido del campo: %1$s en los %2$s registros actuales"}'),
(15361968,	'dd1182',	'dd1179',	'dd9',	'no',	'si',	'si',	3,	'dd',	'si',	NULL,	'{
  "css": {
    ".wrap_component": {
      "mixin": [
        ".vertical"
      ],
      "style": {
        "width": "15%"
      }
    }
  }
}',	'{"css": {".wrap_component": {"mixin": [".vertical"], "style": {"width": "15%"}}}}',	'{"lg-deu": "Typ", "lg-eng": "Type", "lg-fra": "Type", "lg-ita": "Tipo", "lg-spa": "Tipo"}'),
(15361969,	'dd620',	'dd89',	'dd206',	'no',	'si',	'si',	1,	'dd',	'no',	NULL,	NULL,	NULL,	'{"lg-cat": "Unidireccional", "lg-deu": "Unidirektional", "lg-ell": "Μονοκατευθυντική", "lg-eng": "Unidirectional", "lg-fra": "Unidirectionnel", "lg-ita": "Unidirezionale", "lg-spa": "Unidireccional"}'),
(15361970,	'dd1549',	'dd785',	'dd395',	'no',	'si',	'si',	66,	'dd',	'si',	NULL,	'{
  "name": "tool_cataloging"
}',	'{"name": "tool_cataloging"}',	'{"lg-cat": "Catalogació", "lg-deu": "Katalogisierung", "lg-eng": "Cataloging", "lg-fra": "Catalogage", "lg-spa": "Catalogación"}'),
(15361971,	'dd1551',	'dd785',	'dd395',	'no',	'si',	'si',	68,	'dd',	'si',	NULL,	'{"name":"tool_user_admin"}',	'{"name": "tool_user_admin"}',	'{"lg-cat": "Administració d''usuari", "lg-deu": "Nutzeradministration", "lg-eng": "User administration", "lg-fra": "Administration des utilisateurs", "lg-nep": "प्रयोगकर्ता प्रशासन", "lg-spa": "Administración de usuario"}'),
(15361972,	'dd1651',	'dd785',	'dd395',	'no',	'si',	'si',	75,	'dd',	'si',	'null',	'{"name":"translation"}',	'{"name": "translation"}',	'{"lg-cat": "Traducció", "lg-deu": "Übersetzung", "lg-ell": "Μετάφραση", "lg-fra": "Traduction", "lg-ita": "Traduzione", "lg-nep": "व्यापार", "lg-por": "Tradução", "lg-spa": "Traducción"}'),
(15361973,	'dd1366',	'dd785',	'dd395',	'no',	'si',	'si',	79,	'dd',	'si',	'null',	'{"name":"creating"}',	'{"name": "creating"}',	'{"lg-cat": "Creant", "lg-deu": "Erstellen von", "lg-eng": "Creating", "lg-fra": "Création", "lg-ita": "Creare", "lg-spa": "Creando"}'),
(15361974,	'dd1066',	'dd785',	'dd395',	'no',	'si',	'si',	3,	'dd',	'no',	'',	'{
  "name": "min"
}',	'{"name": "min"}',	'{"lg-cat": "Min", "lg-deu": "Min.", "lg-ell": "Ελάχιστη", "lg-eng": "Mín.", "lg-fra": "Min", "lg-ita": "Min", "lg-nep": "मिनेट।", "lg-spa": "Mín."}'),
(15361975,	'dd852',	'dd785',	'dd395',	'no',	'si',	'si',	5,	'dd',	'si',	'null',	'{
  "name": "tool_layout_print"
}',	'{"name": "tool_layout_print"}',	'{"lg-cat": "Impressió", "lg-deu": "Druck", "lg-ell": "Εκτύπωση", "lg-eng": "Print", "lg-fra": "Imprimer", "lg-ita": "Stampa", "lg-spa": "Impresión"}'),
(15361976,	'dd342',	'dd785',	'dd392',	'no',	'si',	'si',	9,	'dd',	'si',	NULL,	NULL,	NULL,	'{"lg-deu": "Werkzeug Administrator", "lg-eng": "tool_administrator", "lg-fra": "administrateur_outil", "lg-ita": "strumento amministratore", "lg-spa": "tool_administrator"}'),
(15361977,	'dd118',	'dd785',	'dd392',	'no',	'si',	'si',	13,	'dd',	'si',	'null',	'',	NULL,	'{"lg-deu": "Werkzeug Inhalte ersetzen", "lg-ell": "Αντικαταστήστε εργαλείο το περιεχόμενο της ιστοσελίδας", "lg-eng": "Tool port replace content", "lg-fra": "Outil de remplacement du contenu", "lg-ita": "Strumento sostituire contenuti", "lg-spa": "Tool reemplazar contenidos"}'),
(15361978,	'dd1048',	'dd785',	'dd395',	'no',	'si',	'si',	15,	'dd',	'si',	'',	'{
  "name": "tool_import_zotero"
}',	'{"name": "tool_import_zotero"}',	'{"lg-cat": "Importar de Zotero", "lg-deu": "Aus Zotero importieren", "lg-ell": "Εισαγωγής Zotero", "lg-eng": "Import from Zotero", "lg-fra": "Importer de Zotero", "lg-ita": "Importare da Zotero", "lg-spa": "Importar de Zotero"}'),
(15361979,	'dd146',	'dd540',	'dd395',	'no',	'si',	'si',	3,	'dd',	'si',	'',	'{
  "name": "aplicar_y_salvar"
}',	'{"name": "aplicar_y_salvar"}',	'{"lg-cat": "Aplicar i salvar", "lg-deu": "Anwenden und speichern", "lg-ell": "Εφαρμογή και αποθήκευση", "lg-eng": "Apply and save", "lg-fra": "Appliquer et sauvegarder", "lg-ita": "Applicare e salvare", "lg-nep": "लागू गर्नुहोस् र बचत गर्नुहोस्", "lg-spa": "Aplicar y salvar"}'),
(15361980,	'dd941',	'dd785',	'dd395',	'no',	'si',	'si',	16,	'dd',	'si',	'',	'{"name":"import_zotero_help"}',	'{"name": "import_zotero_help"}',	'{"lg-deu": "Fügen Sie die JSON-Datei von Zotero und die zugehörigen PDF-Dateien von Ihrer Festplatte hinzu. Sobald sie geladen sind, wählen Sie ''Dateien importieren''.", "lg-ell": "Zotero Προσθέστε το αρχείο JSON και τα αντίστοιχα αρχεία PDF από το σκληρό σας δίσκο. Μόλις φορτωθεί, επιλέξτε ''Εισαγωγή αρχείων''", "lg-eng": "Add the Zotero JSON file and the corresponding PDF files from your hard drive. Once loaded, select ''Import files''", "lg-fra": "Ajoutez le fichier JSON de Zotero et les fichiers PDF correspondants depuis votre disque dur. Une fois le fichier téléchargé, sélectionnez ''Importer des fichiers''.", "lg-ita": "Aggiungere il file JSON di Zotero e i corrispondenti files PDF dal suo disco duro. Una volta caricati, seleziona Importare files", "lg-spa": "Añada el fichero JSON de Zotero y los correspondientes ficheros PDF desde su disco duro. Una vez cargados, seleccione ''Importar ficheros''"}'),
(15361981,	'dd508',	'dd536',	'dd395',	'no',	'si',	'si',	3,	'dd',	'si',	NULL,	'{
  "name": "mostrar_ocultar_etiquetas"
}',	'{"name": "mostrar_ocultar_etiquetas"}',	'{"lg-cat": "Mostrar/ocultar etiquetes", "lg-deu": "Labels zeigen/verbergen", "lg-ell": "Εμφάνιση / απόκρυψη ετικετών", "lg-eng": "Toggle tags", "lg-fra": "Afficher/masquer les étiquettes", "lg-ita": "Mostrare/nascondere etichette", "lg-spa": "Mostrar/ocultar etiquetas"}'),
(15361982,	'dd178',	'dd785',	'dd395',	'no',	'si',	'si',	21,	'dd',	'si',	'',	'{"name":"fichero_de_zotero_procesado_correctamente"}',	'{"name": "fichero_de_zotero_procesado_correctamente"}',	'{"lg-deu": "BibTex-Datei erfolgreich verarbeitet", "lg-ell": "Αρχείο Zotero σωστή επεξεργασία", "lg-eng": "Zotero file processed successfully", "lg-fra": "Fichier Zotero traité correctement", "lg-ita": "File di Zotero processato correttamente", "lg-spa": "Fichero de Zotero procesado correctamente"}'),
(15361983,	'dd284',	'dd785',	'dd395',	'no',	'si',	'si',	24,	'dd',	'si',	NULL,	'{"name":"fichero_de_bibtex_procesado_correctamente"}',	'{"name": "fichero_de_bibtex_procesado_correctamente"}',	'{"lg-cat": "Fitxer BibTeX processat correctament", "lg-deu": "BibTex-Datei erfolgreich verarbeitet", "lg-ell": "Αρχείο BibTex σωστή επεξεργασία", "lg-eng": "BibTeX file processed successfully", "lg-fra": "Fichier BibTex traité correctement", "lg-ita": "File BibTex processato correttamente", "lg-spa": "Fichero BibTex procesado correctamente"}'),
(15361984,	'dd291',	'dd785',	'dd395',	'no',	'si',	'si',	29,	'dd',	'si',	NULL,	'{"name":"conservar_los_cambios_transcripcion"}',	'{"name": "conservar_los_cambios_transcripcion"}',	'{"lg-cat": "Per conservar els canvis, NO TANQUI AQUESTA FINESTRA. Inicieu sessió en una altra finestra del navegador i, a continuació, torneu a aquesta finestra i guardi el contingut (prement el botó ''Guardar'')", "lg-deu": "Zum Speichern der Änderungen DIESES FENSTER NICHT SCHLIESSEN. Starten Sie die Sitzung in einem anderen Browserfenster, kehren Sie anschliessend zu diesem Fenster zurück und speichern Sie den Inhalt (auf ''Speichern'' klicken).", "lg-ell": "Για να διατηρήσετε τις αλλαγές, δεν κλείσετε αυτό το παράθυρο. Συνδεθείτε με άλλο παράθυρο του browser και στη συνέχεια να επιστρέψει σε αυτό το παράθυρο και να αποθηκεύσετε το περιεχόμενο (πατώντας το κουμπί «Αποθήκευση»)", "lg-eng": "To keep the changes, DO NOT CLOSE THIS WINDOW. Log on to another browser window and then return to this window and save the content (pressing the ''Save'' button)", "lg-fra": "Pour conserver vos modifications, NE FERMEZ PAS CETTE FENÊTRE. Connectez-vous à une autre fenêtre de navigateur, puis revenez à cette fenêtre et enregistrez le contenu (en appuyant sur le bouton ''Enregistrer'').", "lg-ita": "Per conservare i cambiamenti, NON CHIUDERE QUESTA FINESTRA. Inizia una sessione in un''altra finestra del browser e, successivamente, torna in questa finestra e salva il contenuto (cliccando il pulsante Salvare)", "lg-spa": "Para conservar los cambios, NO CIERRE ESTA VENTANA. Inicie sesión en otra ventana del navegador y, a continuación, vuelva a esta ventana y guarde el contenido (presionando el botón ''Guardar'')"}'),
(15361985,	'dd539',	'dd785',	'dd392',	'no',	'si',	'si',	32,	'dd',	'si',	NULL,	NULL,	NULL,	'{"lg-deu": "Bildimport", "lg-eng": "Import images", "lg-fra": "Importation d''images", "lg-ita": "Importazione immagini", "lg-spa": "Importación imágenes"}'),
(15361986,	'dd1643',	'dd785',	'dd395',	'no',	'si',	'si',	74,	'dd',	'si',	NULL,	'{"name":"check_config"}',	'{"name": "check_config"}',	'{"lg-cat": "Comprovar la configuració", "lg-deu": "Überprüfen Sie die Konfiguration", "lg-ell": "ελέγξτε τη διαμόρφωση", "lg-eng": "Check config", "lg-fra": "Vérifier la configuration", "lg-ita": "Controlla la configurazione", "lg-nep": "कन्फिगरेसन जाँच गर्नुहोस्", "lg-por": "Verifique a configuração", "lg-spa": "Comprobar configuración"}'),
(15361987,	'dd334',	'dd785',	'dd395',	'no',	'si',	'si',	34,	'dd',	'si',	NULL,	'{"name":"opciones"}',	'{"name": "opciones"}',	'{"lg-cat": "Opcions", "lg-deu": "Optionen", "lg-ell": "επιλογές", "lg-eng": "Options", "lg-fra": "Options", "lg-ita": "Opzioni", "lg-nep": "विकल्पहरू", "lg-spa": "Opciones"}'),
(15361988,	'dd484',	'dd785',	'dd395',	'no',	'si',	'si',	36,	'dd',	'si',	'',	'{"name":"importar"}',	'{"name": "import"}',	'{"lg-cat": "Importar", "lg-deu": "Importieren", "lg-ell": "ύλη", "lg-eng": "Import", "lg-fra": "Importer", "lg-ita": "Importare", "lg-nep": "आयात गर्नुहोस्", "lg-spa": "Importar"}'),
(15361989,	'dd449',	'dd785',	'dd395',	'no',	'si',	'si',	38,	'dd',	'si',	NULL,	'{"name":"tool_tr_print"}',	'{"name": "tool_tr_print"}',	'{"lg-cat": "Transcripció impressió", "lg-deu": "Transkription Druck", "lg-ell": "εκτύπωση μεταγραφή", "lg-eng": "Transcription print", "lg-fra": "Impression de la transcription", "lg-ita": "Trascrizione stampa", "lg-nep": "ट्रान्सक्रिप्शन प्रिन्ट", "lg-spa": "Transcripción impresión"}'),
(15361990,	'dd649',	'dd785',	'dd395',	'no',	'si',	'si',	41,	'dd',	'si',	NULL,	'{
  "name": "presets_de_busqueda"
}',	'{"name": "presets_de_busqueda"}',	'{"lg-cat": "Configuracions de cerca", "lg-deu": "Suchkonfiguration", "lg-ell": "Προεπιλογές αναζήτησης", "lg-eng": "Search presets", "lg-fra": "Paramètres de recherche", "lg-ita": "Config. di ricerca", "lg-nep": "प्रिसेटहरू खोज्नुहोस्", "lg-spa": "Config. de búsqueda"}'),
(15361991,	'dd1355',	'dd785',	'dd395',	'no',	'si',	'si',	51,	'dd',	'si',	NULL,	'{
  "name": "campos_personalizados"
}',	'{"name": "campos_personalizados"}',	'{"lg-cat": "Camps personalitzats", "lg-deu": "Personalisierte Felder", "lg-ell": "Προσαρμοσμένα πεδία", "lg-eng": "Custom fields", "lg-fra": "Champs personnalisés", "lg-spa": "Campos Personalizados"}'),
(15361992,	'dd1360',	'dd785',	'dd395',	'no',	'si',	'si',	56,	'dd',	'si',	NULL,	'{"name":"desactivar_todas_las_columnas"}',	'{"name": "disable_all_columns"}',	'{"lg-cat": "Desactivar totes les columnes", "lg-deu": "Alle Spalten deaktivieren", "lg-ell": "Απενεργοποιήστε όλες τις στήλες", "lg-eng": "Disable all columns", "lg-fra": "Désactiver toutes les colonnes", "lg-nep": "सबै स्तम्भहरू असक्षम गर्नुहोस्", "lg-spa": "Desactivar todas las columnas"}'),
(15361993,	'dd970',	'dd785',	'dd395',	'no',	'si',	'si',	57,	'dd',	'no',	NULL,	'{
  "name": "registrar_herramientas"
}',	'{"name": "registrar_herramientas"}',	'{"lg-cat": "Registrar eines", "lg-deu": "Werkzeuge registrieren", "lg-ell": "Εργαλεία εγγραφής", "lg-eng": "Register tools", "lg-fra": "Outils d''enregistrement", "lg-ita": "Registrare gli strumenti", "lg-nep": "उपकरण दर्ता गर्नुहोस्", "lg-spa": "Registrar herramientas"}'),
(15361994,	'dd1554',	'dd785',	'dd395',	'no',	'si',	'si',	69,	'dd',	'no',	NULL,	'{
  "name": "digitization"
}',	'{"name": "digitization"}',	'{"lg-cat": "Digitalització", "lg-deu": "Digitalisierung", "lg-eng": "Digitization", "lg-fra": "Digitalisation", "lg-ita": "Digitalizzazione", "lg-nep": "डिजिटलाइजेशन", "lg-spa": "Digitalización"}'),
(15361995,	'dd1591',	'dd785',	'dd395',	'no',	'si',	'si',	72,	'dd',	'no',	NULL,	'{"name":"default_lang_of_file_to_import"}',	'{"name": "default_lang_of_file_to_import"}',	'{"lg-cat": "Idioma per defecte del fitxer a importar. Dades sense idioma especificat seran importades a:", "lg-deu": "Standardsprache der zu importierenden Datei. Daten ohne festgelegte Sprache werden importiert in:", "lg-eng": "Default language of the file to import. Data without specified language will be imported in:", "lg-fra": "Langue par défaut du fichier à importer. Les données dont la langue n''est pas spécifiée seront importées dans cette langue :", "lg-ita": "Lingua predefinita del file da importare. I dati senza la lingua specificata verranno importati in:", "lg-spa": "Idioma por defecto del archivo a importar. Datos sin idioma especificado serán importados en:"}'),
(15361996,	'dd644',	'dd390',	'dd395',	'no',	'si',	'si',	33,	'dd',	'si',	NULL,	'{"name":"cambios"}',	'{"name": "changes"}',	'{"lg-cat": "canvis", "lg-deu": "Änderungen", "lg-ell": "αλλαγές", "lg-eng": "changes", "lg-fra": "Changements", "lg-ita": "Cambi", "lg-nep": "परिवर्तनहरू", "lg-spa": "cambios"}'),
(15361997,	'dd909',	'dd867',	'dd183',	'no',	'si',	'si',	4,	'dd',	'no',	NULL,	NULL,	NULL,	'{"lg-deu": "Löschen", "lg-eng": "Delete", "lg-fra": "Supprimer", "lg-ita": "Cancellare", "lg-spa": "Borrar"}'),
(15361998,	'dd1127',	'dd1101',	'dd1231',	'no',	'si',	'si',	12,	'dd',	'no',	'[{"dd592":"dd807"}]',	NULL,	NULL,	'{"lg-spa": "method"}'),
(15361999,	'dd624',	'dd637',	'dd9',	'no',	'si',	'si',	2,	'dd',	'no',	NULL,	'{"css":{".wrap_component":{"mixin":[".vertical"],"style":{"width":"30%"}}}}',	NULL,	'{"lg-cat": "Nom", "lg-deu": "Name", "lg-eng": "Name", "lg-fra": "Prénom", "lg-ita": "Nome", "lg-spa": "Nombre"}'),
(15362000,	'dd612',	'dd1325',	'dd10',	'no',	'si',	'si',	7,	'dd',	'si',	NULL,	'{"css":{".wrap_component":{"mixin":[".vertical"],"style":{"width":"100%"}}}}',	'{"css": {".wrapper_component": {"grid-row-end": "4", "grid-row-start": "2", "grid-column-end": "5", "grid-column-start": "1"}, ".wrapper_component > .content_data": {"height": "20rem"}}}',	'{"lg-deu": "Beschreibung", "lg-eng": "Description", "lg-fra": "Description", "lg-spa": "Descripción"}'),
(15362001,	'dd1363',	'dd389',	'dd395',	'no',	'si',	'si',	29,	'dd',	'no',	NULL,	'{"name":"error_empty_offset"}',	'{"name": "error_empty_offset"}',	'{"lg-cat": "Error. Valor de tc offset buit", "lg-deu": "Fehler: tc offset Wert ist leer.", "lg-eng": "Ops.. Empty tc offset value", "lg-fra": "Erreur. Valeur d''offset tc vide", "lg-nep": "Ops.. खाली tc अफसेट मान", "lg-spa": "Error. Valor de tc offset vacío"}'),
(15362002,	'dd1014',	'dd1011',	'dd500',	'no',	'si',	'si',	5,	'dd',	'no',	NULL,	'{
  "css": {
    ".wrap_component": {
      "mixin": [
        ".vertical"
      ],
      "style": {
        "width": "90%",
        "margin-left": "10%",
        "padding-bottom": "1em",
        "padding-top": "1em"
      }
    }
  }
}',	'{"css": {".wrap_component": {"mixin": [".vertical"], "style": {"width": "90%", "margin-left": "10%", "padding-top": "1em", "padding-bottom": "1em"}}}}',	'{"lg-cat": "Base URL", "lg-deu": "Base URL", "lg-ell": "βάση URL", "lg-eng": "URL base", "lg-fra": "Base URL", "lg-ita": "base URL", "lg-spa": "Base URL"}'),
(15362003,	'dd672',	'dd659',	'dd395',	'no',	'si',	'si',	13,	'dd',	'si',	NULL,	'{"name":"menor_o_igual_que"}',	'{"name": "less_than_or_equal"}',	'{"lg-cat": "Menor o igual que", "lg-deu": "Kleiner oder gleich", "lg-ell": "Λιγότερο από ή ίσο με", "lg-eng": "Less than or equal to", "lg-fra": "Inférieur ou égal à", "lg-ita": "Minore di", "lg-nep": "भन्दा कम वा बराबर", "lg-spa": "Menor o igual que"}'),
(15362004,	'dd1016',	'dd1011',	'dd11',	'no',	'si',	'si',	4,	'dd',	'no',	'[{"dd6":"dd1000"},{"dd9":"dd1002"},{"dd9":"dd1007"}]',	'{
  "css": {
    ".wrap_component": {
      "mixin": [
        ".vertical"
      ],
      "style": {
        "width": "30.5%"
      }
    }
  }
}',	'{"css": {".wrap_component": {"mixin": [".vertical"], "style": {"width": "30.5%"}}}}',	'{"lg-cat": "Entitat", "lg-deu": "Einheit", "lg-ell": "Οντότητα", "lg-eng": "Entity", "lg-fra": "Entité", "lg-ita": "Entità", "lg-spa": "Entidad"}'),
(15362005,	'dd674',	'dd659',	'dd395',	'no',	'si',	'si',	15,	'dd',	'si',	NULL,	'{"name":"menor_que"}',	'{"name": "less_than"}',	'{"lg-cat": "Menor que", "lg-deu": "Kleiner als", "lg-ell": "Λιγότερο από", "lg-eng": "Less than", "lg-fra": "Moins que", "lg-ita": "Minore di", "lg-nep": "भन्दा कम", "lg-spa": "Menor que"}'),
(15362006,	'dd918',	'dd917',	'dd8',	'no',	'si',	'si',	1,	'dd',	'no',	NULL,	NULL,	NULL,	'{"lg-deu": "Allgemeine Informationen", "lg-eng": "General Information", "lg-fra": "Information générale", "lg-ita": "Informazione generale", "lg-spa": "Información general"}'),
(15362007,	'dd1739',	'dd539',	'dd395',	'no',	'si',	'si',	11,	'dd',	'si',	'',	'{
  "name": "dir_path"
}',	'{"name": "dir_path"}',	'{"lg-cat": "Ruta de directori", "lg-deu": "Ordnerpfad", "lg-ell": "Διαδρομή καταλόγου", "lg-eng": "Directory path", "lg-fra": "Chemin d''accès au répertoire", "lg-ita": "Percorso della cartella", "lg-spa": "Ruta de directorio"}'),
(15362008,	'dd787',	'dd539',	'dd395',	'no',	'si',	'si',	14,	'dd',	'si',	'',	'{
  "name": "tool_image_versions"
}',	'{"name": "tool_image_versions"}',	'{"lg-cat": "Fitxers d''imatge", "lg-deu": "Bilddateien", "lg-ell": "Τα αρχεία εικόνας", "lg-eng": "Image files", "lg-fra": "Fichiers d''images", "lg-ita": "Files di immagine", "lg-spa": "Ficheros de imagen"}'),
(15362009,	'dd713',	'dd659',	'dd395',	'no',	'si',	'si',	16,	'dd',	'si',	NULL,	'{
  "name": "dividir_palabras"
}',	'{"name": "dividir_palabras"}',	'{"lg-cat": "Dividir paraules", "lg-deu": "Worte trennen", "lg-ell": "Διαχωρίστε τις λέξεις", "lg-eng": "Split words", "lg-fra": "Mots fractionnés", "lg-ita": "Dividere parole", "lg-nep": "शब्दहरू विभाजित गर्नुहोस्", "lg-spa": "Dividir palabras"}'),
(15362010,	'dd660',	'dd659',	'dd395',	'no',	'si',	'si',	1,	'dd',	'si',	NULL,	'{"name":"no_vacio"}',	'{"name": "no_empty"}',	'{"lg-cat": "Conté informació", "lg-deu": "Enthält Informationen", "lg-ell": "Περιέχει πληροφορίες", "lg-eng": "It contains information", "lg-fra": "Contient des informations", "lg-ita": "Contiene informazione", "lg-nep": "यसमा जानकारी समावेश छ", "lg-spa": "Contiene información"}'),
(15362011,	'dd664',	'dd659',	'dd395',	'no',	'si',	'si',	5,	'dd',	'si',	NULL,	'{"name":"no_contiene"}',	'{"name": "does_not_contain"}',	'{"lg-cat": "No conté", "lg-deu": "Enthält nicht", "lg-ell": "Δεν περιέχει", "lg-eng": "Does not contain", "lg-fra": "Ne contient pas", "lg-ita": "Non contiene", "lg-nep": "समावेश गर्दैन", "lg-spa": "No contiene"}'),
(15362012,	'dd298',	'dd810',	'dd177',	'no',	'si',	'si',	3,	'dd',	'no',	NULL,	'',	NULL,	'{"lg-cat": "Nova tipologia", "lg-deu": "Neue Typologie", "lg-eng": "New typology", "lg-fra": "Nouvelle typologie", "lg-ita": "Nuova tipologia", "lg-spa": "Nueva tipología"}'),
(15362013,	'dd816',	'dd810',	'dd91',	'no',	'si',	'si',	4,	'dd',	'no',	'[{"dd9":"dd812"}]',	'',	NULL,	'{"lg-cat": "Llistat", "lg-deu": "Liste", "lg-eng": "List", "lg-fra": "Liste", "lg-ita": "Elenco", "lg-spa": "Listado"}'),
(15362014,	'dd784',	'dd154',	'dd1747',	'no',	'si',	'si',	1,	'dd',	'no',	'',	'{"css":{".wrap_component":{"mixin":[".vertical",".inverse"],"style":{"width":"8%","border-bottom-right-radius":"8px"}}}}',	'{"css": {".wrapper_component": {"grid-column": "span 1"}}}',	'{"lg-cat": "Id", "lg-deu": "Id", "lg-ell": "Αναγν", "lg-eng": "Id", "lg-fra": "Id", "lg-ita": "Id", "lg-spa": "Id"}'),
(15362015,	'dd292',	'dd137',	'dd6',	'no',	'si',	'si',	24,	'dd',	'no',	'[{"dd626":"dd963"}]',	'',	NULL,	'{"lg-cat": "Tipologia de nombre normalitzat", "lg-deu": "Typologie der Standardnummer", "lg-eng": "Type of standard number", "lg-fra": "Typologie de numéro standard", "lg-ita": "Tipologia di numero normalizzato", "lg-spa": "Tipología de número normalizado"}'),
(15362016,	'dd65',	'dd391',	'dd395',	'no',	'si',	'si',	78,	'dd',	'si',	NULL,	'{"name":"sitio_en_mantenimiento"}',	'{"name": "site_under_maintenance"}',	'{"lg-cat": "Lloc en manteniment. Disculpeu les molèsties", "lg-deu": "System wird gewartet. Entschuldigen Sie die Unannehmlichkeiten.", "lg-ell": "Συντήρηση του δικτυακού τόπου. Συγγνώμη για την ταλαιπωρία", "lg-eng": "System under maintenance. Sorry for the inconvenience", "lg-fra": "Système en cours de maintenance. Nous sommes désolés pour la gêne occasionnée.", "lg-ita": "Sistema in manutenzione. Ci scusiamo per l''inconveniente", "lg-nep": "मर्मत अन्तर्गत प्रणाली। असुविधाको लागि माफ गर्नुहोस्", "lg-spa": "Sistema en mantenimiento. Disculpe las molestias"}'),
(15362017,	'dd658',	'dd391',	'dd395',	'no',	'si',	'si',	80,	'dd',	'si',	NULL,	'{"name":"go_to_record"}',	'{"name": "go_to_record"}',	'{"lg-cat": "Anar al registre", "lg-deu": "Gehe zum Eintrag", "lg-ell": "πηγαίνετε στην εγγραφή", "lg-eng": "Go to record", "lg-fra": "Aller à l''inscription", "lg-ita": "Andare al registro", "lg-nep": "रेकर्डमा जानुहोस्", "lg-spa": "Ir al registro"}'),
(15362018,	'dd777',	'dd391',	'dd395',	'no',	'si',	'si',	46,	'dd',	'si',	'',	'{
  "name": "tesauro"
}',	'{"name": "tesauro"}',	'{"lg-cat": "tesaure", "lg-deu": "Thesaurus", "lg-ell": "θησαυρός λέξεων", "lg-eng": "thesaurus", "lg-fra": "thésaurus", "lg-ita": "Thesaurus", "lg-nep": "थिसॉरस", "lg-spa": "tesauro"}'),
(15362019,	'dd24',	'dd266',	'dd352',	'no',	'si',	'no',	2,	'dd',	'no',	'null',	'{
  "css": {
    ".wrap_component": {
      "mixin": [
        ".vertical"
      ],
      "style": {
        "width": "25%"
      }
    }
  }
}',	'{"css": {".wrap_component": {"mixin": [".vertical"], "style": {"width": "25%"}}}}',	'{"lg-cat": "Fills", "lg-deu": "Unterbegriffe", "lg-eng": "Children", "lg-fra": "Enfants", "lg-ita": "Figli", "lg-spa": "Hijos"}'),
(15362020,	'dd1023',	'dd390',	'dd395',	'no',	'si',	'si',	34,	'dd',	'si',	NULL,	'{
  "name": "sin_fichero"
}',	'{"name": "sin_fichero"}',	'{"lg-cat": "Sense fitxer", "lg-deu": "Keine Datei", "lg-ell": "δεν υπάρχει αρχείο", "lg-eng": "No file", "lg-fra": "Pas de fichier", "lg-ita": "Senza file", "lg-nep": "कुनै फाइल छैन", "lg-spa": "Sin fichero"}'),
(15362021,	'dd715',	'dd391',	'dd395',	'no',	'si',	'si',	81,	'dd',	'si',	NULL,	'{
  "name": "fail_to_save"
}',	'{"name": "fail_to_save"}',	'{"lg-cat": "Ha fallat el desament!", "lg-deu": "Fehler beim Speichern!", "lg-ell": "Αποτυχία εξοικονόμησης!", "lg-eng": "Fail to save!", "lg-fra": "Défaut de sauvegarde !", "lg-ita": "Errore nel salvare!", "lg-nep": "बचत गर्न असफल!", "lg-spa": "¡Fallo al guardar!"}'),
(15362022,	'dd1367',	'dd785',	'dd395',	'no',	'si',	'si',	80,	'dd',	'no',	'null',	'{"name":"versions"}',	'{"name": "versions"}',	'{"lg-cat": "Versions", "lg-deu": "Versionen", "lg-eng": "Versions", "lg-fra": "Versions", "lg-ita": "Versioni", "lg-spa": "Versiones"}'),
(15362023,	'dd1026',	'dd1020',	'dd8',	'no',	'si',	'si',	1,	'dd',	'no',	NULL,	NULL,	NULL,	'{"lg-cat": "Identificació", "lg-deu": "Identifizierung", "lg-ell": "Ταυτοποίηση", "lg-eng": "Identification", "lg-fra": "Identification", "lg-ita": "Identificazione", "lg-spa": "Identificaicón"}'),
(15362024,	'dd324',	'dd538',	'dd395',	'no',	'si',	'si',	2,	'dd',	'si',	NULL,	'{
  "name": "tool_import_files"
}',	'{"name": "tool_import_files"}',	'{"lg-cat": "Importar fitxers", "lg-deu": "Dateien importieren", "lg-ell": "εισαγωγή αρχείων", "lg-eng": "Import files", "lg-fra": "Importer fichiers", "lg-ita": "Importare files", "lg-spa": "Importar ficheros"}'),
(15362025,	'dd768',	'dd751',	'dd1231',	'no',	'si',	'si',	4,	'dd',	'si',	'[{"dd1018":"rsc37"}]',	NULL,	NULL,	'{"lg-spa": "document"}'),
(15362026,	'dd870',	'dd868',	'dd339',	'no',	'si',	'si',	2,	'dd',	'no',	'[{"dd6":"dd64"},{"dd9":"dd62"}]',	'{
  "css": {
    ".wrap_component": {
      "mixin": [
        ".vertical"
      ],
      "style": {
        "width": "10%"
      }
    },
    ".content_data": {
      "style": {
        "width": "120px"
      }
    }
  }
}',	'{"css": {".content_data": {"style": {"width": "120px"}}, ".wrap_component": {"mixin": [".vertical"], "style": {"width": "10%"}}}}',	'{"lg-deu": "Öffentlich", "lg-eng": "Public", "lg-fra": "Public", "lg-ita": "Pubblico", "lg-spa": "Público"}'),
(15362027,	'dd1030',	'dd1026',	'dd9',	'no',	'si',	'si',	2,	'dd',	'no',	NULL,	'{
  "css": {
    ".wrap_component": {
      "mixin": [
        ".vertical"
      ],
      "style": {
        "width": "25%"
      }
    }
  }
}',	'{"css": {".wrap_component": {"mixin": [".vertical"], "style": {"width": "25%"}}}}',	'{"lg-cat": "Tipus", "lg-deu": "Typ", "lg-ell": "Τύπος", "lg-eng": "Type", "lg-fra": "Type", "lg-ita": "Tipo", "lg-spa": "Tipo"}'),
(15362028,	'dd1655',	'dd391',	'dd395',	'no',	'si',	'si',	101,	'dd',	'si',	NULL,	'{"name":"loading_dedalo_files"}',	'{"name": "loading_dedalo_files"}',	'{"lg-cat": "Carregant fitxers Dédalo", "lg-deu": "Laden von Dédalo-Dateien", "lg-ell": "Φόρτωση αρχείων Dédalo", "lg-eng": "Loading Dédalo files", "lg-fra": "Chargement des fichiers Dédalo", "lg-ita": "Caricamento file Dédalo", "lg-nep": "Dédalo फाइलहरू लोड गर्दै", "lg-por": "Carregando arquivos Dédalo", "lg-spa": "Cargando ficheros de Dédalo"}'),
(15362029,	'dd1032',	'dd1026',	'dd10',	'no',	'si',	'si',	4,	'dd',	'si',	NULL,	'{
  "css": {
    ".wrap_component": {
      "mixin": [
        ".vertical"
      ],
      "style": {
        "width": "50%"
      }
    }
  }
}',	'{"css": {".wrap_component": {"mixin": [".vertical"], "style": {"width": "50%"}}}}',	'{"lg-cat": "Descripció", "lg-deu": "Beschreibung", "lg-ell": "Περιγραφή", "lg-eng": "Description", "lg-fra": "Description", "lg-ita": "Descrizione", "lg-spa": "Descripción"}'),
(15362030,	'dd930',	'dd918',	'dd635',	'no',	'si',	'si',	8,	'dd',	'no',	NULL,	'{
  "css": {
    ".wrap_component": {
      "style": {
        "width": "15%"
      }
    }
  }
}',	'{"css": {".wrap_component": {"style": {"width": "15%"}}}}',	'{"lg-deu": "Datum der Aufhebung", "lg-eng": "Removed date", "lg-fra": "Date de résiliation", "lg-ita": "Data della cancellazione", "lg-spa": "Fecha de baja"}'),
(15362031,	'dd1658',	'dd391',	'dd395',	'no',	'si',	'si',	104,	'dd',	'si',	NULL,	'{"name":"installed"}',	'{"name": "installed"}',	'{"lg-cat": "Instal·lat", "lg-deu": "Eingerichtet", "lg-ell": "Εγκατεστημένο", "lg-eng": "Installed", "lg-fra": "Installé", "lg-ita": "Installato", "lg-nep": "स्थापना गरियो", "lg-por": "Instalado", "lg-spa": "Instalado"}'),
(15362032,	'dd934',	'dd917',	'dd91',	'no',	'si',	'si',	2,	'dd',	'si',	'[{"dd9":"dd921"},{"dd635":"dd929"}]',	NULL,	NULL,	'{"lg-deu": "Versionsliste", "lg-eng": "Versions list", "lg-fra": "Liste des versions", "lg-ita": "Elenco delle versioni", "lg-spa": "Lista de versiones"}'),
(15362033,	'dd195',	'dd117',	'null',	'si',	'si',	'si',	2,	'dd',	'no',	'',	NULL,	NULL,	'{"lg-spa": "area_graph"}'),
(15362034,	'dd948',	'dd939',	'dd339',	'no',	'si',	'si',	2,	'dd',	'no',	'[{"dd6":"dd64"},{"dd9":"dd62"}]',	'{
  "css": {
    ".wrap_component": {
      "mixin": [
        ".vertical"
      ],
      "style": {
        "width": "10%"
      }
    },
    ".content_data": {
      "style": {
        "width": "120px"
      }
    }
  }
}',	'{"css": {".content_data": {"style": {"width": "120px"}}, ".wrap_component": {"mixin": [".vertical"], "style": {"width": "10%"}}}}',	'{"lg-deu": "Öffentlich", "lg-eng": "Public", "lg-fra": "Public", "lg-ita": "Pubblico", "lg-spa": "Público"}'),
(15362035,	'dd1168',	'dd1103',	'dd1233',	'no',	'si',	'si',	4,	'dd',	'no',	'[{"dd57":"dd1195"}]',	'{
  "info": "For construct the ENUM value of the field, it need to be changed from the -dato- (without language) to the final -enum- value, dato:enumvalue",
  "data_to_be_used": "dato",
  "enum": {
    "1": "si",
    "2": "no"
  }
}',	'{"enum": {"1": "si", "2": "no"}, "info": "For construct the ENUM value of the field, it need to be changed from the -dato- (without language) to the final -enum- value, dato:enumvalue", "data_to_be_used": "dato"}',	'{"lg-spa": "deprecated"}'),
(15362036,	'dd921',	'dd918',	'dd9',	'no',	'si',	'si',	3,	'dd',	'no',	NULL,	'{
  "css": {
    ".wrap_component": {
      "mixin": [
        ".vertical"
      ],
      "style": {
        "width": "25%"
      }
    }
  }
}',	'{"css": {".wrap_component": {"mixin": [".vertical"], "style": {"width": "25%"}}}}',	'{"lg-deu": "Version", "lg-eng": "Version", "lg-fra": "Version", "lg-ita": "Versione", "lg-spa": "Versión"}'),
(15362037,	'dd971',	'dd1318',	'dd177',	'no',	'si',	'si',	3,	'dd',	'no',	NULL,	NULL,	NULL,	'{"lg-cat": "Nou", "lg-deu": "Neu", "lg-eng": "New", "lg-fra": "Nouveau", "lg-ita": "Nuovo", "lg-spa": "Nuevo"}'),
(15362038,	'dd158',	'dd153',	'dd91',	'no',	'si',	'si',	6,	'dd',	'si',	'[{"dd9":"dd155"},{"dd9":"dd156"},{"dd9":"dd157"},{"dd530":"dd54"},{"dd592":"dd53"},{"dd530":"dd364"},{"dd339":"dd40"}]',	'',	NULL,	'{"lg-cat": "Llistat de registres", "lg-deu": "Liste der Einträge", "lg-ell": "Κατάλογος αρχείων", "lg-eng": "List of records", "lg-fra": "Liste des enregistrements", "lg-ita": "Lista dei registri", "lg-spa": "Lista de registros"}'),
(15362039,	'dd1166',	'dd1103',	'dd1231',	'no',	'si',	'si',	2,	'dd',	'no',	'[{"dd9":"dd871"}]',	NULL,	NULL,	'{"lg-spa": "name"}'),
(15362040,	'dd1640',	'dd389',	'dd395',	'no',	'si',	'si',	37,	'dd',	'si',	NULL,	'{"name":"no_hay_etiqueta_seleccionada"}',	'{"name": "no_hay_etiqueta_seleccionada"}',	'{"lg-cat": "No hi ha cap etiqueta seleccionada. Si continueu, s''indexarà tot el registre.", "lg-deu": "Kein Tag ausgewählt. Wenn Sie fortfahren, wird der gesamte Datensatz indiziert.", "lg-eng": "No tag selected. If you continue, the entire record will be indexed.", "lg-ita": "Nessun tag selezionato. Se continui, l''intero record verrà indicizzato.", "lg-nep": "कुनै ट्याग चयन गरिएको छैन। यदि तपाईंले जारी राख्नुभयो भने, सम्पूर्ण रेकर्ड अनुक्रमित हुनेछ।", "lg-por": "Nenhuma etiqueta selecionada. Se você continuar, todo o registro será indexado.", "lg-spa": "No hay ninguna etiqueta seleccionada. Si continúa, se indexará todo el registro."}'),
(15362041,	'dd1456',	'dd1455',	'dd8',	'no',	'si',	'si',	1,	'dd',	'no',	NULL,	NULL,	'{"css": {".content_data": {"grid-template-columns": "repeat(10, 1fr)"}}}',	'{"lg-cat": "Identificaió", "lg-deu": "Identifizierung", "lg-eng": "Identification", "lg-fra": "Identification", "lg-spa": "Identificaión"}'),
(15362042,	'dd773',	'dd800',	'dd8',	'no',	'si',	'si',	1,	'dd',	'si',	NULL,	NULL,	'{"css": {".content_data": {"grid-template-columns": "repeat(10, 1fr)"}}}',	'{"lg-deu": "Allgemeine Informationen", "lg-eng": "General information", "lg-fra": "Information générale", "lg-ita": "Informazione generale", "lg-spa": "Información general"}'),
(15362043,	'dd1043',	'dd1020',	'dd91',	'no',	'si',	'si',	2,	'dd',	'no',	'[{"dd9":"dd1030"}]',	NULL,	NULL,	'{"lg-cat": "Llistat", "lg-deu": "Liste", "lg-ell": "Λίστα", "lg-eng": "List", "lg-fra": "Liste", "lg-ita": "Elenco", "lg-spa": "Listado"}'),
(15362044,	'dd939',	'dd938',	'dd8',	'no',	'si',	'si',	1,	'dd',	'no',	NULL,	NULL,	NULL,	'{"lg-deu": "Allgemeine Informationen", "lg-eng": "General information", "lg-fra": "Information générale", "lg-ita": "Informazione generale", "lg-spa": "Informacion general"}'),
(15362045,	'dd1492',	'dd1472',	'dd1232',	'no',	'si',	'si',	19,	'dd',	'si',	'[{"dd9":"dd1475"}]',	'{"process_dato":"diffusion_sql::resolve_jer_dd_data","process_dato_arguments":{"column":"relaciones","resolve_label":false}}',	'{"process_dato": "diffusion_sql::resolve_jer_dd_data", "process_dato_arguments": {"column": "relaciones", "resolve_label": false}}',	'{"lg-spa": "relations"}'),
(15362046,	'dd828',	'dd1631',	'dd9',	'no',	'si',	'si',	4,	'dd',	'no',	NULL,	'{"css":{".wrap_component":{"mixin":[".vertical"],"style":{"width":"50%"}}}}',	'{"css": {".wrap_component": {"mixin": [".vertical"], "style": {"width": "50%"}}}}',	'{"lg-deu": "Unterschrift", "lg-eng": "Signature", "lg-fra": "Signature", "lg-ita": "Firma", "lg-spa": "Signatura"}'),
(15362047,	'dd798',	'dd1631',	'dd11',	'no',	'si',	'si',	3,	'dd',	'no',	'[{"dd6":"dd772"},{"dd9":"dd797"}]',	'{"css":{".wrap_component":{"mixin":[".vertical"],"style":{"width":"30%"}}}}',	'{"css": {".wrap_component": {"mixin": [".vertical"], "style": {"width": "30%"}}}}',	'{"lg-deu": "Erweitert", "lg-eng": "Extends", "lg-fra": "Prolongation", "lg-ita": "Data", "lg-spa": "Extiende"}'),
(15362048,	'dd919',	'dd918',	'dd1747',	'no',	'si',	'si',	1,	'dd',	'no',	NULL,	'{
  "css": {
    ".wrap_component": {
      "mixin": [
        ".vertical",
        ".inverse"
      ],
      "style": {
        "width": "10%",
        "border-bottom-right-radius": "10px"
      }
    }
  }
}',	'{"css": {".wrap_component": {"mixin": [".vertical", ".inverse"], "style": {"width": "10%", "border-bottom-right-radius": "10px"}}}}',	'{"lg-deu": "Id", "lg-eng": "Id", "lg-fra": "Id", "lg-ita": "Id", "lg-spa": "Id"}'),
(15362049,	'dd1185',	'dd1178',	'dd91',	'no',	'si',	'si',	2,	'dd',	'no',	'[{"dd9":"dd1182"},{"dd9":"dd1183"}]',	'{
  "css": {
    ".column_dd1182": {
      "style": {
        "width": "25%"
      }
    },
    ".column_dd1183": {
      "style": {
        "width": "75%"
      }
    }
  }
}',	'{"css": {".column_dd1182": {"style": {"width": "25%"}}, ".column_dd1183": {"style": {"width": "75%"}}}}',	'{"lg-deu": "Liste der Komponententypen", "lg-eng": "Component types list", "lg-fra": "Liste des types de composants", "lg-ita": "Elenco dei tipi di componenti", "lg-spa": "Lista de tipos de componentes"}'),
(15362050,	'dd340',	'dd389',	'dd395',	'no',	'si',	'si',	23,	'dd',	'si',	NULL,	'{"name":"componente_deprecado"}',	'{"name": "component_deprecated"}',	'{"lg-cat": "Camp en procés de desaparició. Aquest camp es fusiona amb: %s", "lg-deu": "Feld im Begriff zu verschwinden. Dieses Feld fusioniert mit: %s", "lg-ell": "Το πεδίο κατά τη διαδικασία της εξαφάνισης. Αυτό το πεδίο συγχωνεύεται με: %s", "lg-eng": "Field in the process of disappearing. This field merges with: %s", "lg-fra": "Champ en voie de disparition. Ce champ est fusionné avec : %s", "lg-ita": "Campo in processo di scomparsa. Questo campo si fonde con: ", "lg-nep": "हराउने प्रक्रियामा क्षेत्र। यो क्षेत्र यससँग मर्ज हुन्छ: %s", "lg-spa": "Campo en proceso de desaparición. Este campo se fusiona con: %s"}'),
(15362051,	'dd541',	'dd389',	'dd395',	'no',	'si',	'si',	24,	'dd',	'si',	NULL,	'{
  "name": "error_source_target_lang"
}',	'{"name": "error_source_target_lang"}',	'{"lg-cat": "Llenguatge d0origen i destino NO poden ser el mateix idioma", "lg-deu": "Ursprungssprache und Zielsprache dürfen nicht identisch sein.", "lg-ell": "Οι λέξεις προέλευσης και στόχου δεν μπορούν να είναι η ίδια γλώσσα", "lg-eng": "Source and target langs can''t be the same language", "lg-fra": "La langue source et la langue cible NE PEUVENT PAS être la même.", "lg-ita": "Linguaggio d''origine e destinazione NON possono avere la stessa lingua", "lg-nep": "स्रोत र लक्ष्य भाषा एउटै भाषा हुन सक्दैन", "lg-spa": "Lenguaje de origen y destino NO pueden tener el mismo idioma"}'),
(15362052,	'dd1099',	'dd1096',	'dd1743',	'no',	'si',	'si',	1,	'dd',	'no',	NULL,	'{"diffusion":{"class_name":"diffusion_mysql"},"publication_schema":{"image":"image","audiovisual":"audiovisual","informant":"informant","images":"image"}}',	NULL,	'{"lg-eng": "Dédalo public web", "lg-spa": "Web pública Dédalo"}'),
(15362053,	'dd1333',	'dd1582',	'dd57',	'no',	'si',	'si',	3,	'dd',	'no',	'[{"dd6":"dd64"},{"dd9":"dd62"}]',	'{"css":{".wrap_component":{"mixin":[".vertical"],"style":{"width":"20%"}}}}',	'{"css": {".wrapper_component": {"grid-column": "span 2"}}}',	'{"lg-deu": "übersetzbar", "lg-eng": "Translatable requirement", "lg-fra": "Traductible", "lg-spa": "Traducible"}'),
(15362054,	'dd201',	'dd196',	'dd635',	'no',	'si',	'si',	4,	'dd',	'no',	'null',	'{
  "date_mode": "date",
  "info": "Component data is stored as date time but managed as date for search"
}',	'{"info": "Component data is stored as date time but managed as date for search", "date_mode": "date"}',	'{"lg-cat": "Data de modificació", "lg-deu": "Modifikationsdatum", "lg-ell": "Η ημερομηνία τροποποιήθηκε", "lg-eng": "Modification date", "lg-fra": "Date de modification", "lg-ita": "Data della modificazione", "lg-nep": "परिमार्जन मिति", "lg-spa": "Fecha de modificación"}'),
(15362055,	'dd806',	'dd1631',	'dd9',	'no',	'si',	'si',	7,	'dd',	'si',	NULL,	'{"multi_value":true,"css":{".wrap_component":{"mixin":[".vertical"],"style":{"width":"80%"}}}}',	'{"css": {".wrap_component": {"mixin": [".vertical"], "style": {"width": "80%"}}}, "multi_value": true}',	'{"lg-deu": "Details der Referenzen", "lg-eng": "References details", "lg-fra": "Détails des références", "lg-ita": "Dettagli dei riferimenti", "lg-spa": "Detalles de las referencias"}'),
(15362056,	'dd1203',	'dd1198',	'dd339',	'no',	'si',	'si',	2,	'dd',	'no',	'[{"dd6":"dd64"},{"dd9":"dd62"}]',	'{
  "css": {
    ".wrap_component": {
      "mixin": [
        ".vertical"
      ],
      "style": {
        "width": "10%"
      }
    },
    ".content_data": {
      "style": {
        "width": "120px"
      }
    }
  }
}',	'{"css": {".content_data": {"style": {"width": "120px"}}, ".wrap_component": {"mixin": [".vertical"], "style": {"width": "10%"}}}}',	'{"lg-deu": "Öffentlich", "lg-eng": "Public", "lg-fra": "Public", "lg-ita": "Pubblico", "lg-spa": "Público"}'),
(15362057,	'dd1308',	'dd1454',	'dd6',	'no',	'si',	'si',	2,	'dd',	'no',	'[{"dd626":"dd22"}]',	'',	'null',	'{"lg-cat": "Línia d''investigació", "lg-deu": "Forschungslinie", "lg-ell": "έρευνα Γραμμή", "lg-eng": "Research line", "lg-fra": "Ligne de recherche", "lg-ita": "Linea d&#039;indagine", "lg-spa": "Línea de investigación"}'),
(15362058,	'dd932',	'dd918',	'dd57',	'no',	'si',	'si',	7,	'dd',	'no',	'[{"dd6":"dd64"},{"dd9":"dd62"}]',	'{
  "css": {
    ".wrap_component": {
      "mixin": [
        ".vertical"
      ],
      "style": {
        "width": "15%"
      }
    }
  }
}',	'{"css": {".wrap_component": {"mixin": [".vertical"], "style": {"width": "15%"}}}}',	'{"lg-deu": "Obsolet", "lg-eng": "Obsolete", "lg-fra": "Obsolète", "lg-spa": "Obsoleta"}'),
(15362059,	'dd897',	'dd868',	'dd10',	'no',	'si',	'si',	7,	'dd',	'si',	NULL,	'{
  "css": {
    ".wrap_component": {
      "mixin": [
        ".vertical"
      ],
      "style": {
        "width": "100%"
      }
    }
  }
}',	'{"css": {".wrap_component": {"mixin": [".vertical"], "style": {"width": "100%"}}}}',	'{"lg-deu": "Beschreibung", "lg-eng": "Description", "lg-fra": "Description", "lg-ita": "Descrizione", "lg-spa": "Descripción"}'),
(15362060,	'dd53',	'dd154',	'dd530',	'no',	'si',	'si',	7,	'dd',	'no',	'[{"dd6":"rsc194"},{"dd9":"rsc85"},{"dd9":"rsc86"}]',	'{"css":{".wrap_component":{"mixin":[".vertical",".line_top"]}}}',	'{"css": {".wrapper_component": {"grid-column": "span 5"}}}',	'{"lg-cat": "Persona responsable del projecte", "lg-deu": "Projektverantwortliche Person", "lg-ell": "Πρόσωπο που είναι υπεύθυνο για το έργο", "lg-eng": "Person responsible for the project", "lg-fra": "Personne responsable du projet", "lg-ita": "Persona responsabile del progetto", "lg-spa": "Persona responsable del proyecto"}'),
(15362061,	'dd174',	'dd137',	'dd6',	'no',	'si',	'si',	5,	'dd',	'no',	'[{"dd626":"dd963"}]',	'',	NULL,	'{"lg-cat": "Estat - usuari", "lg-deu": "Status – Benutzer/in", "lg-eng": "States - user", "lg-fra": "États - utilisateur", "lg-ita": "Stati - utente", "lg-spa": "Estados - usuario"}'),
(15362062,	'dd810',	'dd137',	'dd6',	'no',	'si',	'si',	10,	'dd',	'si',	'[{"dd626":"dd963"}]',	'',	NULL,	'{"lg-cat": "Tipologia de bibliografia", "lg-deu": "Typologie der Bibliographie", "lg-eng": "Typology of bibliography", "lg-fra": "Typologie bibliographique", "lg-ita": "Tipologia di bibliografia", "lg-spa": "Tipología de bibliografía"}'),
(15362063,	'dd197',	'dd196',	'dd11',	'no',	'si',	'si',	3,	'dd',	'no',	'[{"dd6":"dd128"},{"dd9":"dd132"},{"dd9":"dd452"},{"dd1747":"dd330"}]',	'',	NULL,	'{"lg-cat": "Modificat per l&#039;usuari", "lg-deu": "Modifiziert durch den Benutzer", "lg-ell": "Τροποποιήθηκε από το χρήστη", "lg-eng": "Modified by user", "lg-fra": "Modification par utilisateur", "lg-ita": "Modificato per utente", "lg-nep": "प्रयोगकर्ता द्वारा परिमार्जित", "lg-spa": "Modificado por usuario"}'),
(15362064,	'dd1390',	'dd1100',	'dd8',	'no',	'si',	'si',	1,	'dd',	'no',	NULL,	NULL,	'{"css": {".content_data": {"grid-template-columns": "repeat(5, 1fr)"}}}',	'{"lg-deu": "Webprogrammierung", "lg-eng": "Web programming", "lg-fra": "Programmation web", "lg-spa": "Programación de la web"}'),
(15362065,	'dd1372',	'dd486',	'dd580',	'no',	'si',	'si',	1,	'dd',	'no',	NULL,	'{"css":{".wrap_component":{"mixin":[".vertical"],"style":{"width":"50%","height":"80vh"}}}}',	'{"css": {".wrapper_component": {"grid-column": "span 10"}, ".wrapper_component >.content_data": {"min-height": "60vh"}}}',	'{"lg-cat": "Etiquetes", "lg-deu": "Labels", "lg-eng": "Labels", "lg-fra": "Libellés", "lg-spa": "Etiquetas"}'),
(15362066,	'dd1240',	'dd389',	'dd395',	'no',	'si',	'si',	28,	'dd',	'si',	NULL,	'{
  "name": "remove_hidden_data"
}',	'{"name": "remove_hidden_data"}',	'{"lg-cat": "Atenció: En canviar aquest valor, s&#039;eliminarà la informació continguda als camps que s&#039;ocultaran. Voleu continuar?", "lg-deu": "Achtung: Das Verändern dieses Werts führt zum Verlust des Inhalts der Felder, die verborgen werden. Wollen Sie trotzdem fortfahren?", "lg-ell": "Προσοχή: Με την αλλαγή αυτής της τιμής, οι πληροφορίες που περιέχονται στα πεδία που θα κρύβονται θα διαγραφούν. Θέλετε να συνεχίσετε;", "lg-eng": "Attention: By changing this value, all the information contained in the fields that will be hidden will be deleted. Are you sure to continue?", "lg-fra": "Attention : Si vous modifiez cette valeur, les informations contenues dans les champs qui seront masqués seront supprimées. Voulez-vous continuer ?", "lg-ita": "Attenzione: cambiando questo valore, si eliminerà l''informazione contenuta nei campi che saranno nascosti. Si desidera continuare", "lg-nep": "ध्यान दिनुहोस्: यो मान परिवर्तन गरेर, लुकाइने क्षेत्रहरूमा समावेश सबै जानकारी मेटिनेछ। के तपाइँ जारी राख्न निश्चित हुनुहुन्छ?", "lg-spa": "Atención: Al cambiar este valor, se eliminará la información contenida en los campos que serán ocultados. ¿Desea continuar?"}'),
(15362067,	'dd1223',	'dd196',	'dd635',	'no',	'si',	'si',	6,	'dd',	'no',	NULL,	'{
  "date_mode": "date",
  "info": "Component data is stored as date time but managed as date for search"
}',	'{"info": "Component data is stored as date time but managed as date for search", "date_mode": "date"}',	'{"lg-cat": "Ultima publicació", "lg-deu": "Letzte Veröffentlichung", "lg-ell": "Τελευταία δημοσίευση", "lg-eng": "Last publication", "lg-fra": "Dernière publication", "lg-ita": "Ultima pubblicazione", "lg-nep": "पछिल्लो प्रकाशन", "lg-spa": "Última publicación"}'),
(15362068,	'dd641',	'dd637',	'dd57',	'no',	'si',	'si',	9,	'dd',	'no',	'[{"dd6":"dd64"},{"dd9":"dd62"}]',	'{"dato_default":{"section_id":"2","section_tipo":"dd64"},"css":{".wrap_component":{"mixin":[".vertical"],"style":{"width":"15%"}}}}',	'{"dato_default": {"section_id": "2", "section_tipo": "dd64"}}',	'{"lg-cat": "Per defecte", "lg-deu": "Default", "lg-eng": "Default", "lg-fra": "Par défaut", "lg-ita": "Default", "lg-spa": "Default"}'),
(15362069,	'dd40',	'dd154',	'dd339',	'no',	'si',	'si',	2,	'dd',	'no',	'[{"dd6":"dd64"},{"dd9":"dd62"}]',	'{"css":{".wrap_component":{"mixin":[".vertical"],"style":{"width":"10%"}},".content_data":{"style":{"width":"120px"}}}}',	'{"css": {".wrapper_component": {"grid-column": "span 1"}}}',	'{"lg-cat": "Públic", "lg-deu": "Öffentlich", "lg-ell": "Δημόσιο", "lg-eng": "Public", "lg-fra": "Public", "lg-ita": "Pubblico", "lg-spa": "Público"}'),
(15362070,	'dd1181',	'dd1179',	'dd339',	'no',	'si',	'si',	2,	'dd',	'no',	'[{"dd6":"dd64"},{"dd9":"dd62"}]',	'{
  "css": {
    ".wrap_component": {
      "mixin": [
        ".vertical"
      ],
      "style": {
        "width": "10%"
      }
    },
    ".content_data": {
      "style": {
        "width": "120px"
      }
    }
  }
}',	'{"css": {".content_data": {"style": {"width": "120px"}}, ".wrap_component": {"mixin": [".vertical"], "style": {"width": "10%"}}}}',	'{"lg-deu": "Öffentlich", "lg-eng": "Public", "lg-fra": "Public", "lg-ita": "Pubblico", "lg-spa": "Público"}'),
(15362071,	'dd1246',	'dd637',	'dd9',	'no',	'si',	'si',	5,	'dd',	'no',	NULL,	'{"css":{".wrap_component":{"mixin":[".vertical"],"style":{"width":"15%"}}}}',	NULL,	'{"lg-cat": "modo", "lg-deu": "Modus", "lg-eng": "mode", "lg-fra": "mode", "lg-ita": "modo", "lg-spa": "modo"}'),
(15362072,	'dd839',	'dd137',	'dd6',	'no',	'si',	'si',	14,	'dd',	'si',	'[{"dd626":"dd963"}]',	'',	NULL,	'{"lg-cat": "Còpia DVD", "lg-deu": "DVD-Kopie", "lg-eng": "DVD copy", "lg-fra": "Copie DVD ", "lg-ita": "Copia DVD", "lg-spa": "Copia DVD"}'),
(15362073,	'dd687',	'dd427',	'dd206',	'no',	'si',	'si',	2,	'dd',	'no',	NULL,	NULL,	NULL,	'{"lg-deu": "Externer Link", "lg-eng": "External link", "lg-fra": "Lien externe", "lg-ita": "Collegamento esterno", "lg-nep": "बाह्य लिङ्क", "lg-spa": "Enlace externo"}'),
(15362074,	'dd98',	'dd427',	'dd206',	'no',	'si',	'si',	3,	'dd',	'no',	'',	'',	NULL,	'{"lg-cat": "Model", "lg-deu": "Modell", "lg-ell": "Μοντέλο", "lg-eng": "Model", "lg-fra": "Modèle", "lg-ita": "Modello", "lg-nep": "मोडेल", "lg-spa": "Modelo"}'),
(15362075,	'dd985',	'dd137',	'dd6',	'no',	'si',	'si',	22,	'dd',	'no',	'[{"dd626":"dd963"}]',	'',	NULL,	'{"lg-cat": "Estàndard del Color Audiovisual", "lg-deu": "Farbstandard Audioviduelle Medien", "lg-eng": "Audiovisual Color Standard", "lg-fra": "Norme de couleur audiovisuelle", "lg-ita": "Standard del Colore Audiovisivo", "lg-spa": "Estándar del Color Audiovisual"}'),
(15362076,	'dd1260',	'dd1258',	'dd1233',	'no',	'si',	'si',	1,	'dd',	'no',	'[{"dd339":"dd1253"}]',	'{
  "info": "For construct the ENUM value of the field, it need to be changed from the -dato- (without language) to the final -enum- value, dato:enumvalue",
  "data_to_be_used": "dato",
  "enum": {
    "1": "true",
    "2": "false"
  }
}',	'{"enum": {"1": "true", "2": "false"}, "info": "For construct the ENUM value of the field, it need to be changed from the -dato- (without language) to the final -enum- value, dato:enumvalue", "data_to_be_used": "dato"}',	'{"lg-spa": "publication"}'),
(15362077,	'dd872',	'dd868',	'dd11',	'no',	'si',	'si',	4,	'dd',	'no',	'[{"dd6":"dd938"},{"dd9":"dd949"}]',	'{
  "css": {
    ".wrap_component": {
      "mixin": [
        ".vertical"
      ],
      "style": {
        "width": "15%"
      }
    }
  }
}',	'{"css": {".wrap_component": {"mixin": [".vertical"], "style": {"width": "15%"}}}}',	'{"lg-deu": "Typ des Datums", "lg-eng": "Data type", "lg-fra": "Type d''organisme", "lg-ita": "Tipo di dato", "lg-spa": "Tipo de dato"}'),
(15362078,	'dd1292',	'dd882',	'dd58',	'no',	'si',	'si',	6,	'dd',	'no',	'[{"dd9":"dd884"}]',	NULL,	NULL,	'{"lg-cat": "Llistat relacions", "lg-deu": "Liste Beziehungen", "lg-eng": "Relaciones list", "lg-fra": "Liste de relations", "lg-ita": "Elenco relazioni", "lg-spa": "Listado relaciones"}'),
(15362079,	'dd1247',	'dd637',	'dd9',	'no',	'si',	'si',	6,	'dd',	'no',	NULL,	'{"css":{".wrap_component":{"mixin":[".vertical"],"style":{"width":"15%"}}}}',	NULL,	'{"lg-cat": "Visor", "lg-eng": "View", "lg-fra": "Vue", "lg-spa": "view"}'),
(15362080,	'dd90',	'dd137',	'dd6',	'no',	'si',	'si',	25,	'dd',	'no',	'[{"dd626":"dd963"}]',	'',	NULL,	'{"lg-cat": "Processos d''investigació", "lg-deu": "Suchprozesse", "lg-eng": "Investigation process", "lg-fra": "Procédures d''enquête", "lg-ita": "Processi d&#039; indagine", "lg-spa": "Procesos de investigación"}'),
(15362081,	'dd969',	'dd147',	'dd395',	'no',	'si',	'si',	17,	'dd',	'no',	NULL,	'{
  "name": "value_out_of_range"
}',	'{"name": "value_out_of_range"}',	'{"lg-cat": "Valor fora de rang", "lg-deu": "Wert ausserhalb des Bereichs", "lg-eng": "Value out of range", "lg-fra": "Valeur hors intervalle", "lg-ita": "Valore fuori intervallo", "lg-nep": "मूल्य दायरा बाहिर", "lg-spa": "Valor fuera de rango"}'),
(15362082,	'dd717',	'dd147',	'dd395',	'no',	'si',	'si',	15,	'dd',	'si',	NULL,	'{
  "name": "title"
}',	'{"name": "title"}',	'{"lg-cat": "Títol", "lg-deu": "Titel", "lg-ell": "Τίτλος", "lg-eng": "Title", "lg-fra": "Titre", "lg-ita": "Titolo", "lg-nep": "शीर्षक", "lg-spa": "Título"}'),
(15362083,	'dd646',	'dd539',	'dd395',	'no',	'si',	'si',	18,	'dd',	'si',	NULL,	'{"name":"name_to_record_id"}',	'{"name": "name_to_record_id"}',	'{"lg-cat": "Prefix indica ID", "lg-deu": "Präfix zeigt ID an", "lg-ell": "Το πρόθεμα υποδηλώνει ID", "lg-eng": "Prefix indicates id", "lg-fra": "Le préfixe indique l''ID", "lg-ita": "Il prefisso indica l''ID", "lg-spa": "Prefijo indica ID"}'),
(15362084,	'dd1395',	'dd1390',	'dd57',	'no',	'si',	'si',	5,	'dd',	'no',	'[{"dd6":"dd64"},{"dd9":"dd62"}]',	'{
  "dato_default": [
    {
      "section_id": "2",
      "section_tipo": "dd64"
    }
  ],
  "css": {
    ".wrap_component": {
      "mixin": [
        ".vertical"
      ],
      "style": {
        "width": "13%",
        "DES_display": "none"
      }
    }
  }
}',	'null',	'{"lg-deu": "Seite aktiv Menu Link", "lg-eng": "Page active menu link", "lg-fra": "Lien du menu de la page active", "lg-spa": "Página activo menu link"}'),
(15362085,	'dd931',	'dd918',	'dd57',	'no',	'si',	'si',	5,	'dd',	'no',	'[{"dd6":"dd64"},{"dd9":"dd62"}]',	'{
  "css": {
    ".wrap_component": {
      "mixin": [
        ".vertical"
      ],
      "style": {
        "width": "15%"
      }
    }
  }
}',	'{"css": {".wrap_component": {"mixin": [".vertical"], "style": {"width": "15%"}}}}',	'{"lg-deu": "veraltet", "lg-eng": "Deprecated", "lg-fra": "Déclassé", "lg-spa": "Deprecada"}'),
(15362086,	'dd1037',	'dd1011',	'dd11',	'no',	'si',	'si',	3,	'dd',	'no',	'[{"dd6":"dd1020"},{"dd9":"dd1030"}]',	'{
  "css": {
    ".wrap_component": {
      "mixin": [
        ".vertical"
      ],
      "style": {
        "width": "34.5%"
      }
    }
  }
}',	'{"css": {".wrap_component": {"mixin": [".vertical"], "style": {"width": "34.5%"}}}}',	'{"lg-cat": "Tipus de server", "lg-deu": "Typ des Dienstes", "lg-ell": "τύπος Υπηρεσία", "lg-eng": "Service type", "lg-fra": "Type de service", "lg-ita": "Tipo di servizio", "lg-spa": "Tipo de servicio"}'),
(15362087,	'dd1027',	'dd1026',	'dd1747',	'no',	'si',	'si',	1,	'dd',	'si',	NULL,	'{
  "css": {
    ".wrap_component": {
      "mixin": [
        ".vertical",
        ".inverse"
      ],
      "style": {
        "width": "10%",
        "border-bottom-right-radius": "10px"
      }
    }
  }
}',	'{"css": {".wrap_component": {"mixin": [".vertical", ".inverse"], "style": {"width": "10%", "border-bottom-right-radius": "10px"}}}}',	'{"lg-cat": "Id", "lg-deu": "Id", "lg-ell": "Id", "lg-eng": "Id", "lg-fra": "Id", "lg-ita": "Id", "lg-spa": "Id"}'),
(15362088,	'dd108',	'dd1553',	'dd395',	'no',	'si',	'si',	3,	'dd',	'si',	'',	'{
  "name": "idioma_de_destino"
}',	'{"name": "idioma_de_destino"}',	'{"lg-cat": "Llenguatge de destí", "lg-deu": "Zielsprache", "lg-ell": "Γλώσσα-στόχο", "lg-eng": "Target lang", "lg-fra": "Langue de destination", "lg-ita": "lingua di destinazione", "lg-spa": "Idioma de destino"}'),
(15362089,	'dd1359',	'dd785',	'dd395',	'no',	'si',	'si',	55,	'dd',	'si',	NULL,	'{"name":"activar_todas_las_columnas"}',	'{"name": "activate_all_columns"}',	'{"lg-cat": "Activa totes les columnes", "lg-deu": "Alle Spalten aktivieren", "lg-ell": "Ενεργοποιήστε όλες τις στήλες", "lg-eng": "Activate all columns", "lg-fra": "Activer toutes les colonnes", "lg-nep": "सबै स्तम्भहरू सक्रिय गर्नुहोस्", "lg-spa": "Activar todas las columnas"}'),
(15362090,	'dd1309',	'dd1308',	'dd8',	'no',	'si',	'si',	1,	'dd',	'si',	'',	NULL,	'{"css": {".content_data": {"grid-template-columns": "repeat(10, 1fr)"}}}',	'{"lg-cat": "Valor de la llista", "lg-deu": "Wert aus der Liste", "lg-ell": "αναγνώριση", "lg-eng": "Value in the list", "lg-fra": "Valeur de la liste", "lg-ita": "Valore della lista", "lg-spa": "Valor de la lista"}'),
(15362091,	'dd723',	'dd785',	'dd395',	'no',	'si',	'si',	47,	'dd',	'si',	NULL,	'{
  "name": "tool_description"
}',	'{"name": "tool_description"}',	'{"lg-cat": "Eina de descripció", "lg-deu": "Beschreibungswerkzeug", "lg-eng": "Description tool", "lg-fra": "Outil de description", "lg-ita": "Strumento di descrizione", "lg-spa": "Herramienta de descripción"}'),
(15362092,	'dd1005',	'dd1003',	'dd10',	'no',	'si',	'si',	5,	'dd',	'si',	NULL,	'{"css":{".wrap_component":{"mixin":[".vertical",".line_top"],"style":{"width":"50%"}}}}',	'{"css": {".wrapper_component.edit": {"grid-column": "span 10"}}}',	'{"lg-cat": "Descripció", "lg-deu": "Beschreibung", "lg-ell": "Περιγραφή", "lg-eng": "Description", "lg-fra": "Description", "lg-ita": "Descrizione", "lg-spa": "Descripción"}'),
(15362093,	'dd51',	'dd126',	'dd592',	'no',	'si',	'si',	2,	'dd',	'no',	'[{"dd6":"rsc182"},{"dd9":"rsc161"},{"dd635":"rsc163"},{"dd1018":"rsc165"},{"dd10":"rsc166"}]',	'{"css":{".wrap_component":{"mixin":[".width_75",".vertical"],"style":{}},".label":{"style":{}},".content_data":{"style":{}}}}',	NULL,	'{"lg-cat": "Document", "lg-deu": "Dokument", "lg-ell": "έγγραφο", "lg-eng": "Document", "lg-fra": "Document", "lg-ita": "Documento", "lg-spa": "Documento"}'),
(15362094,	'dd156',	'dd154',	'dd9',	'no',	'si',	'si',	4,	'dd',	'si',	'',	'{"css":{".wrap_component":{"mixin":[".width_50",".vertical"],"style":{}},".label":{"style":{}},".content_data":{"style":{}}}}',	'{"css": {".wrapper_component": {"grid-column": "span 5"}, ".wrapper_component .input_value": {"outline": "1px solid #ededed", "font-size": "1.1em", "font-weight": "600"}}}',	'{"lg-cat": "Projecte (nom)", "lg-deu": "Projekt (Name)", "lg-ell": "Του έργου (όνομα)", "lg-eng": "Project (name)", "lg-fra": "Projet (nom)", "lg-ita": "Progetto (nome)", "lg-spa": "Proyecto (nombre)"}'),
(15362095,	'dd199',	'dd196',	'dd635',	'no',	'si',	'si',	2,	'dd',	'no',	'',	'{
  "date_mode": "date",
  "info": "Component data is stored as date time but managed as date for search"
}',	'{"info": "Component data is stored as date time but managed as date for search", "date_mode": "date"}',	'{"lg-cat": "Data de creació", "lg-deu": "Datum der Erstellung", "lg-ell": "Ημερομηνία δημιουργίας", "lg-eng": "Creation date", "lg-fra": "Date de création ", "lg-ita": "Data della creazione", "lg-nep": "बनाएको मिति", "lg-spa": "Fecha de creación"}'),
(15362096,	'dd1195',	'dd868',	'dd57',	'no',	'si',	'si',	5,	'dd',	'no',	'[{"dd6":"dd64"},{"dd9":"dd62"}]',	'{
  "dato_default": [
    {
      "section_id": "2",
      "section_tipo": "dd64"
    }
  ],
  "css": {
    ".wrap_component": {
      "mixin": [
        ".vertical"
      ],
      "style": {
        "width": "10%"
      }
    }
  }
}',	'{"css": {".wrap_component": {"mixin": [".vertical"], "style": {"width": "10%"}}}, "dato_default": [{"section_id": "2", "section_tipo": "dd64"}]}',	'{"lg-deu": "Obsolet", "lg-eng": "Obsolete", "lg-fra": "Obsolète", "lg-ita": "Obsoleto", "lg-spa": "Obsoleto"}'),
(15362097,	'dd1165',	'dd1103',	'dd1233',	'no',	'si',	'si',	1,	'dd',	'no',	'[{"dd339":"dd870"}]',	'{
  "info": "For construct the ENUM value of the field, it need to be changed from the -dato- (without language) to the final -enum- value, dato:enumvalue",
  "data_to_be_used": "dato",
  "enum": {
    "1": "true",
    "2": "false"
  }
}',	'{"enum": {"1": "true", "2": "false"}, "info": "For construct the ENUM value of the field, it need to be changed from the -dato- (without language) to the final -enum- value, dato:enumvalue", "data_to_be_used": "dato"}',	'{"lg-spa": "publication"}'),
(15362098,	'dd807',	'dd1631',	'dd592',	'no',	'si',	'si',	10,	'dd',	'no',	'[{"dd6":"dd821"},{"dd9":"dd826"},{"dd9":"dd828"},{"dd10":"dd845"}]',	'{"elements_list_mode":{"dd826":{"column_width":"25%"},"dd828":{"column_width":"35%"},"dd845":{"column_width":"40%"}},"edit_view":"view_single_line","css":{".wrap_component":{"mixin":[".vertical",".line_top"],"style":{"clear":"left"}},".css_button_generic > span":{"style":{"display":"none"}},".section_id_number":{"style":{"display":"none"}}},"portal_link_open":false}',	'{"css": {".wrap_component": {"mixin": [".vertical", ".line_top"], "style": {"clear": "left"}}, ".section_id_number": {"style": {"display": "none"}}, ".css_button_generic > span": {"style": {"display": "none"}}}, "edit_view": "view_single_line", "portal_link_open": false, "elements_list_mode": {"dd826": {"column_width": "25%"}, "dd828": {"column_width": "35%"}, "dd845": {"column_width": "40%"}}}',	'{"lg-deu": "Methoden", "lg-eng": "Methods", "lg-fra": "Méthodes", "lg-ita": "Metodi", "lg-spa": "Métodos"}'),
(15362099,	'dd601',	'dd600',	'dd1233',	'no',	'si',	'si',	1,	'dd',	'no',	'[{"dd339":"dd593"}]',	'{"info":"For construct the ENUM value of the field, it need to be changed from the -dato- (without language) to the final -enum- value, dato:enumvalue","data_to_be_used":"dato","enum":{"1":"si","2":"no"},"exclude_column":true}',	NULL,	'{"lg-spa": "publication"}'),
(15362100,	'dd20',	'dd32',	'dd6',	'no',	'si',	'si',	1,	'dd',	'no',	'[{"dd626":"dd12"}]',	'{
  "info": "Propiedades NO standarizadas. Sólo en puebas",
  "section_config": {
    "list_line": "single"
  }
}',	'{"info": "Propiedades NO standarizadas. Sólo en puebas", "section_config": {"list_line": "single"}}',	'{"lg-cat": "Plantillas de maquetació", "lg-deu": "Layout-Vorlagen", "lg-ell": "Πρότυπα διάταξης", "lg-eng": "Layout templates", "lg-fra": "Modèles de mise en page", "lg-ita": "Modelli d&#039; impaginazione", "lg-spa": "Plantillas de maquetación"}'),
(15362101,	'dd345',	'dd342',	'dd395',	'no',	'si',	'si',	4,	'dd',	'si',	NULL,	'{
  "name": "component_tipo"
}',	'{"name": "component_tipo"}',	'{"lg-cat": "Tipus de component", "lg-deu": "Typ der Komponente", "lg-eng": "Component tipo", "lg-fra": "Type de composante", "lg-ita": "Tipo di componente", "lg-spa": "Tipo del componente"}'),
(15362102,	'dd1301',	'dd1101',	'dd1235',	'no',	'si',	'si',	20,	'dd',	'no',	'[{"dd592":"dd813"}]',	'{
  "process_dato": "diffusion_sql::resolve_value",
  "process_dato_arguments": {
    "target_component_tipo": "dd1207",
    "component_method": "get_diffusion_value"
  }
}',	'{"process_dato": "diffusion_sql::resolve_value", "process_dato_arguments": {"component_method": "get_diffusion_value", "target_component_tipo": "dd1207"}}',	'{"lg-spa": "ref_property_example"}'),
(15362103,	'dd1719',	'dd627',	'dd626',	'no',	'si',	'si',	19,	'dd',	'no',	'',	'{
  "inverse_relations": false
}',	'{"inverse_relations": false}',	'{"lg-spa": "matrix_users"}'),
(15362104,	'dd1088',	'dd537',	'dd395',	'no',	'si',	'si',	15,	'dd',	'si',	'',	'{"name":"no_se_pudo_escribir_el_archivo_en_el_disco"}',	'{"name": "failed_to_writte_file_to_disk"}',	'{"lg-cat": "No s''ha pogut escriure el fitxer al disc", "lg-deu": "Datei konnte nicht auf die Diskette überschrieben werden.", "lg-ell": "Δεν θα μπορούσε να γράψει το αρχείο στο δίσκο", "lg-eng": "Failed to write file to disk", "lg-fra": "Le fichier n''a pas pu être écrit sur le disque", "lg-ita": "Impossibile scrivere l''archivio nel disco", "lg-spa": "No se pudo escribir el archivo en el disco"}'),
(15362105,	'dd920',	'dd918',	'dd339',	'no',	'si',	'si',	2,	'dd',	'no',	'[{"dd6":"dd64"},{"dd9":"dd62"}]',	'{
  "css": {
    ".wrap_component": {
      "mixin": [
        ".vertical"
      ],
      "style": {
        "width": "10%"
      }
    },
    ".content_data": {
      "style": {
        "width": "120px"
      }
    }
  }
}',	'{"css": {".content_data": {"style": {"width": "120px"}}, ".wrap_component": {"mixin": [".vertical"], "style": {"width": "10%"}}}}',	'{"lg-deu": "Öffentlich", "lg-eng": "Public", "lg-fra": "Public", "lg-ita": "Pubblico", "lg-spa": "Público"}'),
(15362106,	'dd1394',	'dd1390',	'dd11',	'no',	'si',	'si',	3,	'dd',	'no',	'[{"dd6":"dd477"},{"dd9":"dd594"}]',	'{
  "css": {
    ".wrap_component": {
      "mixin": [
        ".vertical"
      ],
      "style": {
        "width": "25%"
      }
    }
  }
}',	'{"css": {".wrap_component": {"mixin": [".vertical"], "style": {"width": "20%"}}}}',	'{"lg-deu": "Seiten-Vorlage", "lg-eng": "Page Template", "lg-fra": "Page de modèle", "lg-spa": "Página plantilla"}'),
(15362107,	'dd706',	'dd391',	'dd395',	'no',	'si',	'si',	14,	'dd',	'si',	'',	'{"name":"recuperar"}',	'{"name": "recuperar"}',	'{"lg-cat": "recuperar", "lg-deu": "Wiederherstellen", "lg-ell": "ανάκτηση", "lg-eng": "recover", "lg-fra": "récupérer", "lg-ita": "Recuperare", "lg-nep": "पुन: प्राप्ति", "lg-spa": "recuperar"}'),
(15362108,	'dd1092',	'dd692',	'dd395',	'no',	'si',	'si',	17,	'dd',	'si',	'',	'{"name":"recuperar_seccion"}',	'{"name": "recuperar_seccion"}',	'{"lg-cat": "Recuperar secció", "lg-deu": "Sektion wiederherstellen", "lg-ell": "χάνεται τμήμα", "lg-eng": "Recover section", "lg-fra": "Récupérer la section", "lg-ita": "Recuperare sezione", "lg-nep": "खण्ड पुन: प्राप्ति गर्नुहोस्", "lg-spa": "Recuperar sección"}'),
(15362109,	'dd599',	'dd477',	'dd247',	'no',	'si',	'si',	2,	'dd',	'no',	NULL,	'{"dato_default":{"1":"2"},"css":{".wrap_component":{"mixin":[".vertical"],"style":{"width":"50%","height":"5em"}},".content_data":{"style":{"max-height":"3.15em"}}}}',	'{"css": {".content_data": {"style": {"max-height": "3.15em"}}, ".wrap_component": {"mixin": [".vertical"], "style": {"width": "50%", "height": "5em"}}}, "dato_default": {"1": "2"}}',	'{"lg-cat": "Projecte", "lg-deu": "Projekt", "lg-ell": "Έργο", "lg-eng": "Project", "lg-fra": "Projet", "lg-ita": "Progetto", "lg-spa": "Proyecto"}'),
(15362110,	'dd857',	'dd391',	'dd395',	'no',	'si',	'si',	56,	'dd',	'si',	'',	'{"name":"jerarquias"}',	'{"name": "jerarquias"}',	'{"lg-cat": "jerarquies", "lg-deu": "Hierarchien", "lg-ell": "ιεραρχίες", "lg-eng": "hierarchies", "lg-fra": "hiérarchies", "lg-ita": "Gerarchie", "lg-nep": "पदानुक्रमहरू", "lg-spa": "jerarquías"}'),
(15362111,	'dd744',	'dd391',	'dd395',	'no',	'si',	'si',	29,	'dd',	'si',	'',	'{"name":"el_directorio_no_existe"}',	'{"name": "el_directorio_no_existe"}',	'{"lg-cat": "El directori no existeix o no és accessible", "lg-deu": "Das Verzeichnis existiert nicht oder ist nicht zugänglich.", "lg-ell": "Ο κατάλογος δεν υπάρχει ή δεν είναι προσβάσιμο", "lg-eng": "The directory does not exist or is not accessible", "lg-fra": "Le répertoire n''existe pas ou n''est pas accessible", "lg-ita": "La cartella non esiste o non è accessibile", "lg-nep": "निर्देशिका अवस्थित छैन वा पहुँचयोग्य छैन", "lg-spa": "El directorio no existe o no es accesible"}'),
(15362112,	'dd747',	'dd391',	'dd395',	'no',	'si',	'si',	32,	'dd',	'si',	'',	'{"name":"por_favor_espere"}',	'{"name": "por_favor_espere"}',	'{"lg-cat": "Espere, si us plau...", "lg-deu": "Bitte warten", "lg-ell": "Παρακαλώ περιμένετε ..", "lg-eng": "Please wait..", "lg-fra": "Veuillez patienter...", "lg-ita": "Per favore attenda...", "lg-nep": "कृपया पर्खनुहोस्..", "lg-spa": "Por favor espere.."}'),
(15362113,	'dd738',	'dd389',	'dd395',	'no',	'si',	'si',	14,	'dd',	'si',	'',	'{"name":"fichero_demasiado_grande"}',	'{"name": "filesize_is_too_big"}',	'{"lg-cat": "El pes de l''arxiu és massa gran", "lg-deu": "Die Datei ist zu gross.", "lg-ell": "Το μέγεθος του αρχείου είναι πολύ μεγάλο", "lg-eng": "File size is too big", "lg-fra": "La taille du fichier est trop importante", "lg-ita": "La grandezza dell''archivio è troppo grande", "lg-nep": "फाइल साइज धेरै ठूलो छ", "lg-spa": "El tamaño de archivo es demasiado grande"}'),
(15362114,	'dd781',	'dd390',	'dd395',	'no',	'si',	'si',	19,	'dd',	'si',	'',	'{"name":"crear_nuevo_fragmento"}',	'{"name": "crear_nuevo_fragmento"}',	'{"lg-cat": "Crear nou fragment amb la selecció", "lg-deu": "Neuen Auszug aus Auswahl erstellen", "lg-ell": "Δημιουργία νέου κομματιού με την επιλογή", "lg-eng": "Create new fragment with the selection", "lg-fra": "Créer un nouveau fragment avec une sélection", "lg-ita": "Creare nuovo frammento con selezione", "lg-nep": "चयनको साथ नयाँ टुक्रा सिर्जना गर्नुहोस्", "lg-spa": "Crear nuevo fragmento con selección"}'),
(15362115,	'dd611',	'dd811',	'dd339',	'no',	'si',	'si',	1,	'dd',	'no',	'[{"dd6":"dd64"},{"dd9":"dd62"}]',	'{
  "dato_default": {
    "section_id": "1",
    "section_tipo": "dd64"
  },
  "css": {
    ".wrap_component": {
      "mixin": [
        ".vertical"
      ],
      "style": {
        "width": "10%"
      }
    }
  }
}',	'{"css": {".wrap_component": {"mixin": [".vertical"], "style": {"width": "10%"}}}, "dato_default": {"section_id": "1", "section_tipo": "dd64"}}',	'{"lg-deu": "Öffentlich", "lg-eng": "Public", "lg-fra": "Public", "lg-ita": "Pubblico", "lg-spa": "Público"}'),
(15362116,	'dd752',	'dd751',	'dd1231',	'no',	'si',	'si',	2,	'dd',	'si',	'[{"dd9":"rsc23"}]',	NULL,	NULL,	'{"lg-spa": "title"}'),
(15362117,	'dd850',	'dd821',	'dd91',	'no',	'si',	'si',	2,	'dd',	'no',	'[{"dd9":"dd826"},{"dd9":"dd828"},{"dd10":"dd845"}]',	'{
  "elements_list_mode": {
    "dd819": {
      "column_width": "25%"
    },
    "dd823": {
      "column_width": "35%"
    },
    "dd820": {
      "column_width": "40%"
    }
  }
}',	'{"elements_list_mode": {"dd819": {"column_width": "25%"}, "dd820": {"column_width": "40%"}, "dd823": {"column_width": "35%"}}}',	'{"lg-deu": "Liste der Methoden", "lg-eng": "Methods list", "lg-fra": "Liste des méthodes", "lg-ita": "Elenco dei metodi", "lg-spa": "Lista de métodos"}'),
(15362118,	'dd1207',	'dd868',	'dd592',	'no',	'si',	'si',	8,	'dd',	'no',	'[{"dd6":"dd1197"},{"dd9":"dd1204"},{"dd9":"dd896"}]',	'{
  "edit_view": "view_single_line",
  "css": {
    ".wrap_component": {
      "mixin": [
        ".vertical",
        ".line_top"
      ],
      "style": {
        "width": "100%"
      }
    },
    ".css_button_generic > span": {
      "style": {
        "display": "none"
      }
    }
  }
}',	'{"css": {".wrap_component": {"mixin": [".vertical", ".line_top"], "style": {"width": "100%"}}, ".css_button_generic > span": {"style": {"display": "none"}}}, "edit_view": "view_single_line"}',	'{"lg-deu": "Beispiele", "lg-eng": "Examples", "lg-fra": "Exemples", "lg-ita": "Esempi", "lg-spa": "Ejemplos"}'),
(15362119,	'dd1581',	'dd73',	'dd8',	'no',	'si',	'si',	5,	'dd',	'si',	NULL,	NULL,	'{"css": {".content_data": {"grid-template-columns": "repeat(10, 10%)"}}}',	'{"lg-cat": "Configuració", "lg-deu": "Konfiguration", "lg-ell": "Διαμόρφωση", "lg-eng": "Configuration", "lg-fra": "Configuration", "lg-spa": "Configuración"}'),
(15362120,	'dd1189',	'dd1631',	'dd530',	'no',	'si',	'si',	12,	'dd',	'no',	'[{"dd6":"dd772"},{"dd9":"dd797"}]',	'{"multi_value":true,"mode":"autocomplete","source":{"filter_custom":[{"q":{"section_id":"3","section_tipo":"dd1178","from_component_tipo":"dd1188","type":"dd151"},"path":[{"section_tipo":"dd772","component_tipo":"dd1188","modelo":"component_select","name":"Typology"}]}]},"css":{".wrap_component":{"mixin":[".vertical"],"style":{"width":"50%"}}}}',	'{"css": {".wrap_component": {"mixin": [".vertical"], "style": {"width": "50%"}}}, "mode": "autocomplete", "source": {"filter_custom": [{"q": {"type": "dd151", "section_id": "3", "section_tipo": "dd1178", "from_component_tipo": "dd1188"}, "path": [{"name": "Typology", "model": "component_select", "section_tipo": "dd772", "component_tipo": "dd1188"}]}]}, "multi_value": true}',	'{"lg-deu": "Modifizierer", "lg-eng": "Modifiers", "lg-fra": "Modifications", "lg-ita": "Modificatori", "lg-spa": "Modificadores"}'),
(15362121,	'dd710',	'dd622',	'dd1230',	'no',	'si',	'si',	17,	'dd',	'si',	'[{"dd429":"ww28"}]',	'{"process_dato":"diffusion_sql::map_parent_to_norder"}',	NULL,	'{"lg-spa": "norder"}'),
(15362122,	'dd1582',	'dd73',	'dd8',	'no',	'si',	'si',	2,	'dd',	'si',	NULL,	NULL,	'{"css": {".content_data": {"grid-template-columns": "repeat(10, 10%)"}}}',	'{"lg-cat": "Abast", "lg-deu": "Bereich", "lg-eng": "Scope", "lg-fra": "Champ d''application", "lg-spa": "Ámbito"}'),
(15362123,	'dd1451',	'dd1448',	'dd442',	'no',	'si',	'si',	3,	'dd',	'no',	NULL,	'{
  "source": {
    "mode": "autocomplete",
    "hierarchy_types": [
      2
    ],
    "hierarchy_sections": []
  },
  "value_with_parents": true,
  "css": {
    ".wrap_component": {
      "mixin": [
        ".vertical",
        ".width_50"
      ]
    }
  }
}',	'null',	'{"lg-deu": "Auflösung", "lg-eng": "resolution", "lg-fra": "Résolution", "lg-spa": "resolución"}'),
(15362124,	'dd1502',	'dd1472',	'dd1231',	'no',	'si',	'si',	7,	'dd',	'si',	'[{"dd592":"dd1564"}]',	NULL,	NULL,	'{"lg-spa": "ontology_commons"}'),
(15362125,	'dd1382',	'dd785',	'dd395',	'no',	'si',	'si',	61,	'dd',	'si',	NULL,	'{
  "name": "tool_metadata"
}',	'{"name": "tool_metadata"}',	'{"lg-cat": "Metadata", "lg-deu": "Metadaten", "lg-eng": "Metadata", "lg-fra": "Métadata", "lg-spa": "Metadata"}'),
(15362126,	'dd1505',	'dd1473',	'dd500',	'no',	'si',	'si',	10,	'dd',	'no',	NULL,	'{"css":{".wrap_component":{"mixin":[".vertical",".line_top"],"style":{"width":"100%"}}}}',	'{"css": {".wrapper_component": {"grid-column": "span 3"}}}',	'{"lg-deu": "externer URI", "lg-eng": "External URI", "lg-fra": "URI externe", "lg-spa": "URI externa"}'),
(15362127,	'dd1373',	'dd1314',	'dd1747',	'no',	'si',	'si',	1,	'dd',	'no',	'null',	NULL,	'{"css": {".wrapper_component": {"grid-column": "span 1"}}}',	'{"lg-cat": "Id", "lg-deu": "Id", "lg-ell": "Id", "lg-eng": "Id", "lg-fra": "Id", "lg-ita": "Id", "lg-spa": "Id"}'),
(15362128,	'dd1432',	'dd1192',	'dd1231',	'no',	'si',	'si',	21,	'dd',	'si',	'[{"dd592":"dd1404"}]',	'{
  "process_dato": "diffusion_sql::resolve_value",
  "process_dato_arguments": {
    "split_string_value": " | ",
    "output": "merged",
    "target_component_tipo": "rsc29",
    "DES_dato_splice_DES": [
      1
    ]
  }
}',	NULL,	'{"lg-spa": "identifying_images"}'),
(15362129,	'dd1128',	'dd1101',	'dd1231',	'no',	'si',	'si',	13,	'dd',	'no',	'[{"dd592":"dd807"}]',	'{
  "process_dato": "diffusion_sql::resolve_value",
  "process_dato_arguments": {
    "target_component_tipo": "dd826",
    "component_method": "get_diffusion_value"
  }
}',	'{"process_dato": "diffusion_sql::resolve_value", "process_dato_arguments": {"component_method": "get_diffusion_value", "target_component_tipo": "dd826"}}',	'{"lg-spa": "ref_method_name"}'),
(15362130,	'dd1389',	'dd1390',	'dd11',	'no',	'si',	'si',	8,	'dd',	'no',	'[{"dd6":"dd911"},{"dd9":"dd914"}]',	'{
  "css": {
    ".wrap_component": {
      "mixin": [
        ".vertical"
      ],
      "style": {
        "width": "25%"
      }
    }
  }
}',	'{"css": {".wrap_component": {"mixin": [".vertical"], "style": {"width": "20%"}}}}',	'{"lg-deu": "Knotenpunkt. CSS-Klasse", "lg-eng": "Node css class", "lg-fra": "Nœud. CSS", "lg-spa": "Nodo. CSS class"}'),
(15362131,	'dd1407',	'dd1391',	'dd592',	'no',	'si',	'si',	13,	'dd',	'no',	'[{"dd6":"rsc167"},{"dd339":"rsc20"},{"dd9":"rsc21"},{"dd9":"rsc23"},{"dd722":"rsc35"}]',	'{"css":{".wrap_component":{"mixin":[".vertical",".line_top"]}}}',	'{"css": {".wrapper_component": {"grid-column": "span 5"}}}',	'{"lg-deu": "Video", "lg-eng": "Video", "lg-fra": "Vidéo", "lg-spa": "Vídeo"}'),
(15362132,	'dd1400',	'dd1391',	'dd247',	'no',	'si',	'si',	4,	'dd',	'no',	NULL,	'{
  "css": {
    ".wrap_component": {
      "mixin": [
        ".vertical"
      ],
      "style": {
        "width": "18%"
      }
    },
    ".content_data": {
      "style": {
        "max-height": "40px"
      }
    }
  }
}',	'null',	'{"lg-deu": "Projekt", "lg-eng": "Project", "lg-fra": "Projet", "lg-spa": "Proyecto"}'),
(15362133,	'dd1105',	'dd1101',	'dd1233',	'no',	'si',	'si',	1,	'dd',	'no',	'[{"dd339":"dd796"}]',	'{
  "info": "For construct the ENUM value of the field, it need to be changed from the -dato- (without language) to the final -enum- value, dato:enumvalue",
  "data_to_be_used": "dato",
  "enum": {
    "1": "true",
    "2": "false"
  }
}',	'{"enum": {"1": "true", "2": "false"}, "info": "For construct the ENUM value of the field, it need to be changed from the -dato- (without language) to the final -enum- value, dato:enumvalue", "data_to_be_used": "dato"}',	'{"lg-spa": "publication"}'),
(15362134,	'dd1303',	'dd1302',	'dd1233',	'no',	'si',	'si',	1,	'dd',	'no',	'[{"dd339":"dd1271"}]',	'{
  "info": "For construct the ENUM value of the field, it need to be changed from the -dato- (without language) to the final -enum- value, dato:enumvalue",
  "data_to_be_used": "dato",
  "enum": {
    "1": "true",
    "2": "false"
  }
}',	'{"enum": {"1": "true", "2": "false"}, "info": "For construct the ENUM value of the field, it need to be changed from the -dato- (without language) to the final -enum- value, dato:enumvalue", "data_to_be_used": "dato"}',	'{"lg-spa": "publication"}'),
(15362135,	'dd863',	'dd862',	'dd9',	'no',	'si',	'si',	3,	'dd',	'si',	'',	'{
  "css": {
    ".wrap_component": {
      "mixin": [
        ".vertical"
      ],
      "style": {
        "width": "50%"
      }
    }
  }
}',	NULL,	'{"lg-cat": "Home / Dona", "lg-deu": "Geschlecht", "lg-eng": "Gender", "lg-fra": "Homme/Femme", "lg-ita": "Uomo/Donna", "lg-spa": "Hombre/Mujer"}'),
(15362136,	'dd1529',	'dd1473',	'dd592',	'no',	'si',	'si',	15,	'dd',	'no',	'[{"dd6":"dd800"},{"dd339":"dd796"},{"dd530":"dd797"},{"dd10":"dd801"}]',	'{"css":{".wrap_component":{"mixin":[".vertical"],"style":{"width":"100%"}}}}',	'{"css": {".wrapper_component": {"grid-column": "span 10"}}}',	'{"lg-deu": "Versionsdokumentation", "lg-eng": "Version documentation", "lg-fra": "Documentation de mise à disposition", "lg-spa": "Documentación de versión"}'),
(15362137,	'dd802',	'dd1631',	'dd592',	'no',	'si',	'si',	5,	'dd',	'no',	'[{"dd6":"dd1197"},{"dd339":"dd1203"},{"dd9":"dd1204"},{"dd9":"dd896"},{"dd580":"dd903"},{"dd580":"dd1205"}]',	'{"css":{".wrap_component":{"mixin":[".vertical",".line_top"],"style":{"clear":"left","width":"100%"}},".css_button_generic > span":{"style":{"display":"none"}},".section_id_number":{"style":{"display":"none"}}}}',	'{"css": {".wrap_component": {"mixin": [".vertical", ".line_top"], "style": {"clear": "left", "width": "100%"}}, ".section_id_number": {"style": {"display": "none"}}, ".css_button_generic > span": {"style": {"display": "none"}}}}',	'{"lg-deu": "Beispiele", "lg-eng": "Examples", "lg-fra": "Exemples", "lg-spa": "Ejemplos"}'),
(15362138,	'dd809',	'dd1631',	'dd592',	'no',	'si',	'si',	11,	'dd',	'no',	'[{"dd6":"dd821"},{"dd9":"dd826"},{"dd9":"dd828"},{"dd10":"dd845"}]',	'{"elements_list_mode":{"dd826":{"column_width":"25%"},"dd828":{"column_width":"35%"},"dd845":{"column_width":"40%"}},"edit_view":"view_single_line","css":{".wrap_component":{"mixin":[".vertical",".line_top"],"style":{"clear":"left"}},".css_button_generic > span":{"style":{"display":"none"}},".section_id_number":{"style":{"display":"none"}}},"portal_link_open":false}',	'{"css": {".wrap_component": {"mixin": [".vertical", ".line_top"], "style": {"clear": "left"}}, ".section_id_number": {"style": {"display": "none"}}, ".css_button_generic > span": {"style": {"display": "none"}}}, "edit_view": "view_single_line", "portal_link_open": false, "elements_list_mode": {"dd826": {"column_width": "25%"}, "dd828": {"column_width": "35%"}, "dd845": {"column_width": "40%"}}}',	'{"lg-deu": "ausführliche Methoden", "lg-eng": "Extended methods", "lg-fra": "Méthodes étendues", "lg-ita": "Metodi diffusi", "lg-spa": "Métodos extendidos"}'),
(15362139,	'dd1054',	'dd1133',	'dd1747',	'no',	'si',	'si',	1,	'dd',	'no',	NULL,	'{"css":{".wrap_component":{"mixin":[".vertical",".inverse"],"style":{"width":"8%","border-bottom-right-radius":"8px"}}}}',	'{"css": {".wrapper_component": {"grid-column": "span 1"}}}',	'{"lg-cat": "Id", "lg-deu": "Id", "lg-eng": "Id", "lg-fra": "Id", "lg-ita": "Id", "lg-spa": "Id"}'),
(15362140,	'dd813',	'dd1631',	'dd592',	'no',	'si',	'si',	8,	'dd',	'no',	'[{"dd6":"dd867"},{"dd9":"dd871"},{"dd11":"dd872"},{"dd10":"dd897"}]',	'{"elements_list_mode":{"dd871":{"column_width":"20%"},"dd872":{"column_width":"20%"},"dd897":{"column_width":"60%"}},"edit_view":"view_single_line","css":{".wrap_component":{"mixin":[".vertical",".line_top"],"style":{"clear":"left"}},".css_button_generic > span":{"style":{"display":"none"}},".section_id_number":{"style":{"display":"none"}}},"portal_link_open":false}',	'{"css": {".wrap_component": {"mixin": [".vertical", ".line_top"], "style": {"clear": "left"}}, ".section_id_number": {"style": {"display": "none"}}, ".css_button_generic > span": {"style": {"display": "none"}}}, "edit_view": "view_single_line", "portal_link_open": false, "elements_list_mode": {"dd871": {"column_width": "20%"}, "dd872": {"column_width": "20%"}, "dd897": {"column_width": "60%"}}}',	'{"lg-deu": "Eigenschaften", "lg-eng": "Properties", "lg-fra": "Propriétés", "lg-ita": "Proprietà", "lg-spa": "Propiedades"}'),
(15362141,	'dd718',	'dd391',	'dd395',	'no',	'si',	'si',	83,	'dd',	'si',	NULL,	'{"name":"page"}',	'{"name": "page"}',	'{"lg-ara": "صفحة", "lg-cat": "Pàgina", "lg-deu": "Seite", "lg-ell": "Σελίδα", "lg-eng": "Page", "lg-fra": "Page", "lg-ita": "Pagina", "lg-nep": "पृष्ठ", "lg-spa": "Página"}'),
(15362142,	'dd173',	'dd391',	'dd395',	'no',	'si',	'si',	9,	'dd',	'si',	'',	'{"name":"registros_creados"}',	'{"name": "registros_creados"}',	'{"lg-cat": "Registres creats", "lg-deu": "erstellte Einträge", "lg-ell": "αρχεία που δημιουργήθηκαν", "lg-eng": "Created records", "lg-fra": "Enregistrements créés", "lg-ita": "Registri creati", "lg-nep": "रेकर्डहरू सिर्जना गरे", "lg-spa": "Registros creados"}'),
(15362143,	'dd763',	'dd390',	'dd395',	'no',	'si',	'si',	17,	'dd',	'si',	'',	'{"name":"borrar_registro_completo"}',	'{"name": "delete_data_and_record"}',	'{"lg-cat": "Esborrar registre complet", "lg-deu": "Kompletten Eintrag löschen", "lg-ell": "Διαγραφή πλήρες αρχείο", "lg-eng": "Delete data and record", "lg-fra": "Effacer l''ensemble de l''enregistrement", "lg-ita": "Cancellare registro completo", "lg-nep": "डाटा र रेकर्ड मेटाउनुहोस्", "lg-spa": "Borrar registro completo"}'),
(15362144,	'dd762',	'dd390',	'dd395',	'no',	'si',	'si',	16,	'dd',	'si',	'',	'{"name":"borrar_solo_datos"}',	'{"name": "delete_data_only"}',	'{"lg-cat": "Esborrar només dades", "lg-deu": "Nur Daten löschen", "lg-ell": "Διαγραφή μόνο τα δεδομένα", "lg-eng": "Delete data only", "lg-fra": "Supprimer uniquement les données", "lg-ita": "Cancellare solo dati", "lg-nep": "डाटा मात्र मेटाउनुहोस्", "lg-spa": "Borrar sólo datos"}'),
(15362145,	'dd735',	'dd391',	'dd395',	'no',	'si',	'si',	25,	'dd',	'si',	'',	'{"name":"seleccione_fotograma"}',	'{"name": "seleccione_fotograma"}',	'{"lg-cat": "Seleccioneu fotograma en el reproductor i faci clic a «CREAR POSTERFRAME» per crear un fotograma a partir del vídeo", "lg-deu": "Wählen Sie Standbild im Player und drücken Sie ''POSTERFRAME ERSTELLEN'' um ein Standbild aus dem Video zu erstellen", "lg-ell": "Επιλέξτε καρέ στο παίκτη και πατήστε Create POSTERFRAME για να δημιουργήσετε ένα καρέ από το βίντεο", "lg-eng": "Select frame in player and click button MAKE POSTERFRAME to generate new posterframe image from video", "lg-fra": "Sélectionnez le cadre dans le lecteur et appuyez sur ''CREATE POSTERFRAME'' pour créer un cadre à partir de la vidéo.", "lg-ita": "Seleziona fotogramma nel riproduttore e clicca CREARE POSTERFRAME per creare un fotogramma a partire dal video", "lg-spa": "Seleccione fotograma en el reproductor y pulse «CREAR POSTERFRAME» para crear un fotograma a partir del video"}'),
(15362146,	'dd783',	'dd440',	'null',	'si',	'si',	'si',	3,	'dd',	'si',	'',	'',	NULL,	'{"lg-spa": "component_security_tools"}'),
(15362147,	'dd318',	'dd440',	'null',	'si',	'si',	'si',	31,	'dd',	'no',	'',	'',	NULL,	'{"lg-spa": "component_html_text"}'),
(15362148,	'dd761',	'dd390',	'dd395',	'no',	'si',	'si',	15,	'dd',	'si',	'',	'{"name":"cancelar"}',	'{"name": "cancel"}',	'{"lg-cat": "Cancel·lar", "lg-deu": "Abbrechen", "lg-ell": "ακυρώσει", "lg-eng": "Cancel", "lg-fra": "Annuler", "lg-ita": "Cancellare", "lg-nep": "रद्द गर्नुहोस्", "lg-spa": "Cancelar"}'),
(15362149,	'dd746',	'dd391',	'dd395',	'no',	'si',	'si',	31,	'dd',	'si',	'',	'{"name":"recargar"}',	'{"name": "reload"}',	'{"lg-cat": "Recarregar", "lg-deu": "Aufladen", "lg-ell": "επαναφόρτωση", "lg-eng": "Reload", "lg-fra": "Recharge", "lg-ita": "Ricaricare", "lg-nep": "पुन: लोड गर्नुहोस्", "lg-spa": "Recargar"}'),
(15362150,	'dd1249',	'dd391',	'dd395',	'no',	'si',	'si',	87,	'dd',	'no',	NULL,	'{"name":"registros_mostrados"}',	'{"name": "records_displayed"}',	'{"lg-cat": "Registres mostrats de X a Y de Z", "lg-deu": "Dargestellte Einträge von X bis Y aus Z", "lg-ell": "Οι καταχωρητές που εμφανίζονται από το Χ έως το Υ του Z", "lg-eng": "Displayed records from X to Y of Z", "lg-fra": "Registres affichés de X à Y de Z", "lg-ita": "Registri mostrati da X a Y di Z", "lg-nep": "X देखि Y को Z को रेकर्डहरू प्रदर्शन गरियो।", "lg-spa": "Registros mostrados de X a Y de Z"}'),
(15362151,	'dd1399',	'dd1391',	'dd9',	'no',	'si',	'si',	3,	'dd',	'si',	NULL,	'{"css":{".wrap_component":{"mixin":[".vertical"],"style":{"width":"35%"}},".css_input_text":{"style":{"font-size":"16px"}}}}',	'{"css": {".wrapper_component": {"grid-column": "span 4"}}}',	'{"lg-deu": "Name", "lg-eng": "Name", "lg-fra": "Prénom", "lg-spa": "Nombre"}'),
(15362152,	'dd551',	'dd548',	'dd9',	'no',	'si',	'si',	6,	'dd',	'no',	'',	'{"list_show_key":"msg"}',	'{"list_show_key": "msg", "show_interface": {"tools": false, "read_only": true}}',	'{"lg-cat": "Dada", "lg-deu": "Datum, Angabe", "lg-ell": "δεδομένο", "lg-eng": "Data", "lg-fra": "Donnée", "lg-ita": "Dato", "lg-spa": "Dato"}'),
(15362153,	'dd1401',	'dd1391',	'dd9',	'no',	'si',	'si',	6,	'dd',	'si',	NULL,	'{"css":{".wrap_component":{"mixin":[".vertical",".line_top"],"style":{"width":"100%"}},".css_input_text":{"style":{"font-size":"16px"}}}}',	'{"css": {".wrapper_component": {"grid-column": "span 10"}}}',	'{"lg-deu": "Titel Kopfzeile", "lg-eng": "Page heading title", "lg-fra": "En-tête de page de titre", "lg-spa": "Titulo encabezado página"}'),
(15362154,	'dd1627',	'dd391',	'dd395',	'no',	'si',	'si',	97,	'dd',	'si',	NULL,	'{"name":"match_case"}',	'{"name": "match_case"}',	'{"lg-cat": "Coincidir majúscules i minúscules", "lg-deu": "Groß- und Kleinschreibung beachten", "lg-ell": "διάκριση πεζών-κεφαλαίων", "lg-eng": "Match case", "lg-fra": "Lettres majuscules et minuscules assorties", "lg-ita": "maiuscole e minuscole", "lg-nep": "मिलान मामला", "lg-spa": "Coincidir mayúsculas y minúsculas"}'),
(15362155,	'dd1139',	'dd1391',	'dd580',	'no',	'si',	'si',	9,	'dd',	'no',	'[{"dd6":"ww36"}]',	'{"css":{".wrap_component":{"mixin":[".line_top",".vertical"],"style":{"width":"100%","height":"340px"}},".content_data":{"style":{}}}}',	'{"css": {".wrapper_component": {"grid-column": "span 10"}}}',	'{"lg-deu": "Code", "lg-eng": "Code", "lg-fra": "Code", "lg-spa": "Código"}'),
(15362156,	'dd1468',	'dd1391',	'dd592',	'no',	'si',	'si',	10,	'dd',	'no',	'[{"dd6":"rsc170"},{"dd339":"rsc20"},{"dd9":"rsc21"},{"dd9":"rsc23"},{"dd9":"rsc31"},{"dd10":"rsc30"},{"dd749":"rsc29"}]',	'{"dragable_connectWith":"dd1404","css":{".wrap_component":{"mixin":[".vertical",".line_top"]}}}',	'{"css": {".wrapper_component": {"grid-column": "span 10"}}}',	'{"lg-deu": "Banner", "lg-eng": "Banner", "lg-fra": "Bannière", "lg-spa": "Banner"}'),
(15362157,	'dd1467',	'dd1192',	'dd1231',	'no',	'si',	'si',	24,	'dd',	'si',	'[{"dd592":"dd1406"}]',	'{
  "process_dato": "diffusion_sql::resolve_value",
  "process_dato_arguments": {
    "split_string_value": " | ",
    "output": "merged",
    "target_component_tipo": "rsc23"
  }
}',	'{"process_dato": "diffusion_sql::resolve_value", "process_dato_arguments": {"component_method": "get_diffusion_value", "target_component_tipo": "rsc30"}}',	'{"lg-spa": "images_description"}'),
(15362158,	'dd1427',	'dd1192',	'dd1231',	'no',	'si',	'si',	25,	'dd',	'si',	'[{"dd592":"dd1407"}]',	'{
  "process_dato": "diffusion_sql::resolve_value",
  "process_dato_arguments": {
    "split_string_value": " | ",
    "output": "merged",
    "target_component_tipo": "rsc35"
  }
}',	'{"process_dato": "diffusion_sql::resolve_value", "process_dato_arguments": {"output": "merged", "split_string_value": " | ", "target_component_tipo": "rsc35"}}',	'{"lg-spa": "audiovisual"}'),
(15362159,	'dd1555',	'dd1391',	'dd592',	'no',	'si',	'si',	15,	'dd',	'no',	'[{"dd6":"rsc302"},{"dd339":"rsc20"},{"dd9":"rsc21"},{"dd9":"rsc23"},{"dd686":"rsc855"}]',	NULL,	'{"css": {".wrapper_component": {"grid-column": "span 10"}}}',	'{"lg-deu": "SVG", "lg-eng": "SVG", "lg-fra": "SVG", "lg-spa": "SVG"}'),
(15362160,	'dd1291',	'dd604',	'dd339',	'no',	'si',	'si',	1,	'dd',	'no',	'[{"dd6":"dd64"},{"dd9":"dd62"}]',	'{
  "css": {
    ".wrap_component": {
      "mixin": [
        ".vertical"
      ],
      "style": {
        "width": "12%"
      }
    }
  }
}',	'{"css": {".wrap_component": {"mixin": [".vertical"], "style": {"width": "12%"}}}}',	'{"lg-cat": "Públic", "lg-deu": "Öffentlich", "lg-eng": "Public", "lg-fra": "Public", "lg-spa": "Público"}'),
(15362161,	'dd1666',	'dd389',	'dd395',	'no',	'si',	'si',	39,	'dd',	'si',	'null',	'{"name":"not_allow_to_create_note"}',	'{"name": "not_allow_to_create_note"}',	'{"lg-cat": "No es poden crear notes a un canvi que no és el teu", "lg-deu": "Sie können keine Notizen zu einer Änderung erstellen, die nicht von Ihnen stammt", "lg-eng": "Cannot create notes of a change that is not yours", "lg-ita": "Non è possibile creare note di una modifica che non è vostra", "lg-nep": "तपाईंको होइन परिवर्तनको नोटहरू सिर्जना गर्न सकिँदैन", "lg-por": "Não é possível criar notas de uma alteração que não é sua", "lg-spa": "No puede crear notas de un cambio que no es suyo"}'),
(15362162,	'dd1556',	'dd1473',	'dd580',	'no',	'si',	'si',	14,	'dd',	'no',	NULL,	'{"css":{".wrap_component":{"mixin":[".vertical"],"style":{"width":"100%","height":"80vh"}}},"read_only":true}',	'{"css": {".wrapper_component": {"grid-column": "span 10"}}}',	'{"lg-deu": "Element der JSON-Ontologie", "lg-eng": "JSON Ontology Item", "lg-fra": "JSON Ontology Item", "lg-spa": "JSON Ontology Item"}'),
(15362163,	'dd1484',	'dd1472',	'dd1233',	'no',	'si',	'si',	1,	'dd',	'no',	'[{"dd339":"dd1481"}]',	'{
  "info": "For construct the ENUM value of the field, it need to be changed from the -dato- (without language) to the final -enum- value, dato:enumvalue",
  "data_to_be_used": "dato",
  "enum": {
    "1": 0,
    "2": 1
  },
  "exclude_column": true
}',	'{"enum": {"1": 0, "2": 1}, "info": "For construct the ENUM value of the field, it need to be changed from the -dato- (without language) to the final -enum- value, dato:enumvalue", "exclude_column": true, "data_to_be_used": "dato"}',	'{"lg-spa": "publication"}'),
(15362164,	'dd188',	'dd539',	'dd395',	'no',	'si',	'si',	4,	'dd',	'si',	'',	'{
  "name": "eliminar_imagenes_tras_la_importacion"
}',	'{"name": "eliminar_imagenes_tras_la_importacion"}',	'{"lg-cat": "Eliminar imatges després de la importació", "lg-deu": "Bilder nach dem Importieren löschen", "lg-ell": "Διαγραφή φωτογραφιών μετά την εισαγωγή", "lg-eng": "Deleting images after import", "lg-fra": "Supprimer les images après l''importation", "lg-ita": "Eliminare immagini dopo l''importazione", "lg-spa": "Eliminar imágenes tras la importación"}'),
(15362165,	'dd217',	'dd539',	'dd395',	'no',	'si',	'si',	7,	'dd',	'si',	'',	'{
  "name": "extension"
}',	'{"name": "extension"}',	'{"lg-cat": "extensió", "lg-deu": "Erweiterung", "lg-ell": "επέκταση", "lg-eng": "extension", "lg-fra": "extension", "lg-ita": "Estensione", "lg-spa": "extensión"}'),
(15362166,	'dd1362',	'dd1325',	'dd10',	'no',	'si',	'si',	9,	'dd',	'no',	NULL,	NULL,	'{"css": {".wrapper_component": {"grid-row-start": "auto", "grid-column-end": "11", "grid-column-start": "5"}, ".wrapper_component > .content_data": {"height": "14rem"}}}',	'{"lg-cat": "Implementació", "lg-deu": "Implementierung", "lg-ell": "Εκτέλεση", "lg-eng": "Implementation", "lg-fra": "Mise en œuvre", "lg-ita": "Implementazione", "lg-spa": "Implementación"}'),
(15362167,	'dd647',	'dd539',	'dd395',	'no',	'si',	'si',	19,	'dd',	'si',	NULL,	'{"name":"same_name_same_record"}',	'{"name": "same_name_same_record"}',	'{"lg-cat": "Mateix nom mateix registre. Crea nou id", "lg-deu": "Gleicher Name gleicher Datensatz. Neue ID erstellen", "lg-ell": "Ίδιο όνομα, ίδιος δίσκος. Δημιουργία νέας ταυτότητας", "lg-eng": "Same name same record. Create new ID", "lg-fra": "Même nombre même registre. Créer un nouvel identifiant", "lg-ita": "Stesso nome stesso record. Creare un nuovo ID", "lg-spa": "Mismo nombre mismo registro. Crea nuevo ID"}'),
(15362168,	'dd514',	'dd449',	'dd395',	'no',	'si',	'si',	6,	'dd',	'si',	NULL,	'{"name":"structurations_info"}',	'{"name": "structurations_info"}',	'{"lg-cat": "Estructuracions info", "lg-deu": "Informationsstrukturen", "lg-eng": "Structurations info", "lg-fra": "Structures d''information", "lg-ita": "Strutturazioni info", "lg-spa": "Estructuraciones info"}'),
(15362169,	'dd1490',	'dd1472',	'dd1231',	'no',	'si',	'si',	18,	'dd',	'si',	'[{"dd9":"dd1475"}]',	'{"process_dato":"diffusion_sql::resolve_jer_dd_data","process_dato_arguments":{"column":"properties"}}',	'{"process_dato": "diffusion_sql::resolve_jer_dd_data", "process_dato_arguments": {"column": "properties"}}',	'{"lg-spa": "properties"}'),
(15362170,	'dd1488',	'dd1472',	'dd523',	'no',	'si',	'si',	5,	'dd',	'si',	'[{"dd9":"dd1475"}]',	'{"process_dato":"diffusion_sql::resolve_jer_dd_data","process_dato_arguments":{"column":"esmodelo"}}',	'{"process_dato": "diffusion_sql::resolve_jer_dd_data", "process_dato_arguments": {"column": "esmodelo"}}',	'{"lg-spa": "is_model"}'),
(15362171,	'dd1543',	'dd1473',	'dd10',	'no',	'si',	'si',	12,	'dd',	'si',	NULL,	'{"css":{".wrap_component":{"mixin":[".vertical"],"style":{"width":"100%"}}}}',	'{"css": {".wrapper_component": {"grid-column": "span 6"}, ".wrapper_component >.content_data": {"max-height": "20rem"}}}',	'{"lg-deu": "Anwendungsregeln", "lg-eng": "Application rules", "lg-fra": "Règles d''application", "lg-spa": "Reglas de aplicación"}'),
(15362172,	'dd1475',	'dd1473',	'dd9',	'no',	'si',	'si',	3,	'dd',	'no',	NULL,	'{"read_only":"read_only","css":{".wrap_component":{"mixin":[".vertical"],"style":{"width":"35%","background-color":"#FFE2AB","border-right":"1px solid #d0d0d0"}}}}',	'{"css": {".wrapper_component": {"grid-column": "span 2"}}, "read_only": "read_only"}',	'{"lg-deu": "term_id", "lg-eng": "term_id", "lg-fra": "term_id", "lg-spa": "term_id"}'),
(15362173,	'dd1052',	'dd770',	'dd4',	'no',	'si',	'si',	5,	'dd',	'no',	NULL,	NULL,	NULL,	'{"lg-cat": "Xarxa d&#039;entitats", "lg-deu": "Netzwerk der Einheiten", "lg-ell": "Δίκτυο οντοτήτων", "lg-eng": "Entities network", "lg-fra": "Réseau d''entités", "lg-ita": "Rete delle entità", "lg-spa": "Red de entidades"}'),
(15362174,	'dd1336',	'dd73',	'dd91',	'no',	'si',	'si',	6,	'dd',	'no',	'[{"dd57":"dd1354"},{"dd9":"dd1326"},{"dd9":"dd799"},{"dd10":"dd612"},{"dd9":"dd1327"},{"dd9":"dd1328"},{"dd80":"dd1330"},{"dd57":"dd1331"},{"dd57":"dd1332"},{"dd57":"dd1333"}]',	NULL,	NULL,	'{"lg-deu": "Liste", "lg-eng": "List", "lg-fra": "Liste", "lg-spa": "Listado"}'),
(15362175,	'dd1559',	'dd1500',	'dd91',	'no',	'si',	'si',	1,	'dd',	'no',	'[{"dd339":"dd1481"},{"dd9":"dd1475"},{"dd9":"dd1482"},{"dd9":"dd1477"},{"dd10":"dd1478"},{"dd592":"dd1564"},{"dd10":"dd1476"}]',	NULL,	NULL,	'{"lg-deu": "Liste", "lg-eng": "List", "lg-fra": "Liste", "lg-spa": "list"}'),
(15362176,	'dd1564',	'dd1473',	'dd592',	'no',	'si',	'no',	9,	'dd',	'no',	'[{"dd6":"dd1560"},{"dd339":"dd1481"},{"dd9":"dd1562"},{"dd10":"dd1478"},{"dd500":"dd1505"}]',	NULL,	'{"css": {".wrapper_component": {"grid-column": "span 3"}}}',	'{"lg-deu": "Gemeinsame Definitionen", "lg-eng": "Common definitions", "lg-fra": "Définitions communes", "lg-spa": "Definiciones comunes"}'),
(15362177,	'dd244',	'dd129',	'dd252',	'no',	'si',	'no',	3,	'dd',	'no',	'[{"dd6":"dd64"},{"dd9":"dd62"}]',	'{"css":{".wrap_component":{"mixin":[".vertical"],"style":{"width":"15%"}},".content_data":{"style":{}}}}',	'{"css": {".wrapper_component": {"grid-row": "1", "grid-column": "span 1"}}}',	'{"lg-cat": "Admin. General", "lg-deu": "Allgemeiner Admin", "lg-ell": "Διαχειριστή. γενικός", "lg-eng": "General administrator", "lg-fra": "Administration Générale", "lg-ita": "Amm. Generale", "lg-spa": "Admin. General"}'),
(15362178,	'dd1341',	'dd1340',	'dd91',	'no',	'si',	'si',	1,	'dd',	'no',	'[{"dd57":"dd1354"},{"dd9":"dd1326"},{"dd9":"dd799"},{"dd10":"dd612"},{"dd9":"dd1327"},{"dd9":"dd1328"},{"dd80":"dd1330"},{"dd57":"dd1331"},{"dd57":"dd1332"},{"dd57":"dd1333"}]',	NULL,	'{"css": {".content_data": {"background-color": "rgb(247 138 27 / 10%)"}, ".list_body .column_section": {"background-color": "#f78a1b26"}, ".list_body .column_section.column_dd1326": {"min-width": "16.5rem", "background-color": "#f78a1b40"}}}',	'{"lg-deu": "Liste", "lg-eng": "List", "lg-fra": "Liste", "lg-spa": "Listado"}'),
(15362179,	'dd1608',	'dd389',	'dd395',	'no',	'si',	'si',	35,	'dd',	'si',	NULL,	'{"name":"type_root_password"}',	'{"name": "type_root_password"}',	'{"lg-eng": "Type and retype your desired superuser password and keep it in a safe place. Use a strong password from 8 to 32 characters containing, at least, an upper-case letter, a lower-case letter, and a number. Identical characters in sequential order are not allowed (''aa'', ''11'', ''BB'', etc.). Numerical (''123'', ''345'', etc.) nor alphabetical (''aBC'', ''hIjK'', etc.) order are allowed.", "lg-fra": "Tapez et retapez le mot de passe superutilisateur souhaité et conservez-le en lieu sûr. Utilisez un mot de passe fort de 8 à 32 caractères contenant au moins une lettre majuscule, une lettre minuscule et un chiffre. Les caractères identiques dans l''ordre séquentiel (''aa'', ''11'', ''BB'', etc.) ne sont pas autorisés. L''ordre numérique (''123'', ''345'', etc.) et l''ordre alphabétique (''aBC'', ''hIjK'', etc.) ne sont pas autorisés.", "lg-nep": "आफ्नो मनपर्ने सुपरयुजर पासवर्ड टाइप गर्नुहोस् र पुन: टाइप गर्नुहोस् र यसलाई सुरक्षित स्थानमा राख्नुहोस्। 8 देखि 32 वर्णहरू सम्मिलित बलियो पासवर्ड प्रयोग गर्नुहोस्, कम्तिमा, एउटा ठूलो-केस अक्षर, एउटा सानो-केस अक्षर, र एउटा संख्या। क्रमिक क्रममा समान वर्णहरूलाई अनुमति छैन (''aa'', ''11'', ''BB'', आदि)। संख्यात्मक (''123'', ''345'', आदि) वा वर्णमाला (''aBC'', ''hIjK'', आदि) क्रमलाई अनुमति छैन।", "lg-spa": "Escriba y vuelva a escribir la contraseña de superusuario deseada y guárdela en un lugar seguro. Utilice una contraseña segura de 8 a 32 caracteres que contenga, al menos, una letra mayúscula, una letra minúscula y un número. No se permiten caracteres idénticos en orden secuencial (''aa'', ''11'', ''BB'', etc.). No se permite el orden numérico (''123'', ''345'', etc.) ni alfabético (''aBC'', ''hIjK'', etc.)."}'),
(15362180,	'dd1284',	'dd1286',	'dd1233',	'no',	'si',	'si',	1,	'dd',	'no',	'[{"dd339":"dd1271"}]',	'{"info":"For construct the ENUM value of the field, it need to be changed from the -dato- (without language) to the final -enum- value, dato:enumvalue","data_to_be_used":"dato","enum":{"1":0,"2":1},"exclude_column":true}',	'{"enum": {"1": 0, "2": 1}, "info": "For construct the ENUM value of the field, it need to be changed from the -dato- (without language) to the final -enum- value, dato:enumvalue", "exclude_column": true, "data_to_be_used": "dato"}',	'{"lg-spa": "publication"}'),
(15362181,	'dd1605',	'dd659',	'dd395',	'no',	'si',	'si',	18,	'dd',	'si',	NULL,	'{"name":"source"}',	'{"name": "source"}',	'{"lg-cat": "Origen", "lg-deu": "Quelle", "lg-eng": "Source", "lg-fra": "Origine", "lg-nep": "मुहान", "lg-spa": "Origen"}'),
(15362182,	'dd1019',	'dd390',	'dd395',	'no',	'si',	'si',	1,	'dd',	'si',	'null',	'{"name":"operadores_de_busqueda"}',	'{"name": "search_operators"}',	'{"lg-cat": "Operadors de cerca", "lg-deu": "Suchoperatoren", "lg-ell": "Αναζήτηση Operators", "lg-eng": "Search operators", "lg-fra": "Opérateurs de recherche", "lg-ita": "Operatori della ricerca", "lg-nep": "खोज अपरेटरहरू", "lg-spa": "Operadores de búsqueda"}'),
(15362183,	'dd1583',	'dd389',	'dd395',	'no',	'si',	'si',	30,	'dd',	'si',	NULL,	'{"name":"are_you_sure_to_delete_note"}',	'{"name": "are_you_sure_to_delete_note"}',	'{"lg-cat": "Segur que voleu suprimir aquesta nota?", "lg-ell": "Είστε βέβαιοι ότι θέλετε να διαγράψετε αυτήν τη σημείωση;", "lg-eng": "Are you sure you want to delete this note?", "lg-fra": "Êtes-vous sûr de vouloir supprimer cette note ?", "lg-ita": "Sei sicuro di voler eliminare questa nota?", "lg-nep": "के तपाइँ यो नोट मेटाउन निश्चित हुनुहुन्छ?", "lg-spa": "¿Seguro que desea borrar esta nota?"}'),
(15362184,	'dd1083',	'dd537',	'dd395',	'no',	'si',	'si',	10,	'dd',	'si',	'',	'{"name":"el_archivo_subido_excede_de_la_directiva"}',	'{"name": "uploaded_file_exceeds_the_directive"}',	'{"lg-cat": "El fitxer carregat excedeix la directiva upload_max_filesize a php.ini", "lg-deu": "Die hochgeladene Datei überschreitet die upload_max_filesize Direktive in php.ini.", "lg-ell": "Το αρχείο που μεταφορτώθηκε υπερβαίνει την οδηγία upload_max_filesize στο php.ini", "lg-eng": "The uploaded file exceeds the upload_max_filesize directive in php.ini", "lg-fra": "Le fichier téléchargé dépasse la directive upload_max_filesize dans php.ini", "lg-ita": "L''archivio caricato supera la direttiva upload_max_filesize in php.ini", "lg-spa": "El archivo subido excede la directiva upload_max_filesize en php.ini"}'),
(15362185,	'dd1318',	'dd1454',	'dd6',	'no',	'si',	'si',	1,	'dd',	'no',	'[{"dd626":"dd22"}]',	'',	'null',	'{"lg-cat": "Tipologias de projecte", "lg-deu": "Typologien der Projekte", "lg-ell": "Τύπους έργων", "lg-eng": "Typology of project", "lg-fra": "Typologies de projets", "lg-ita": "Tipologie di progetto", "lg-spa": "Tipologías de proyecto"}'),
(15362186,	'dd1279',	'dd622',	'dd1231',	'no',	'si',	'si',	34,	'dd',	'no',	'[{"dd10":"ww45"}]',	'{"process_dato":"diffusion_sql::build_geolocation_data_geojson","process_dato_arguments":{"fallback":{"tipo":"ww46","method":"get_diffusion_value_as_geojson"}}}',	NULL,	'{"lg-spa": "space_geojson"}'),
(15362187,	'dd1361',	'dd1318',	'dd441',	'no',	'si',	'si',	7,	'dd',	'no',	NULL,	'{
  "thesaurus": {
    "term": "dd1320",
    "is_descriptor": "dd265",
    "is_indexable": false,
    "model": false,
    "parent": "dd169"
  }
}',	'{"thesaurus": {"term": "dd1320", "model": false, "parent": "dd169", "is_indexable": false, "is_descriptor": "dd265"}}',	'{"lg-deu": "Karte der Sektion", "lg-eng": "section map", "lg-fra": "Plan de section", "lg-spa": "Section map"}'),
(15362188,	'dd788',	'dd537',	'dd395',	'no',	'si',	'si',	7,	'dd',	'si',	'',	'{
  "name": "tool_upload"
}',	'{"name": "tool_upload"}',	'{"lg-cat": "Càrrega d''arxius", "lg-deu": "Dateien hochladen", "lg-ell": "Ανεβάστε το αρχείο", "lg-eng": "Upload files", "lg-fra": "Téléchargement de fichiers", "lg-ita": "Caricamento degli archivi", "lg-spa": "Carga de archivos"}'),
(15362189,	'dd740',	'dd537',	'dd395',	'no',	'si',	'si',	8,	'dd',	'si',	'',	'{"name":"fichero_subido_con_exito"}',	'{"name": "file_uploaded_successfully"}',	'{"lg-cat": "Fitxer pujat amb èxit", "lg-deu": "Datei erfolgreich hochgeladen", "lg-ell": "Αρχείο φορτώθηκε με επιτυχία", "lg-eng": "File uploaded successfully", "lg-fra": "Fichier téléchargé avec succès", "lg-ita": "File caricato con successo", "lg-spa": "Fichero subido con éxito"}'),
(15362190,	'dd290',	'dd692',	'dd395',	'no',	'si',	'si',	9,	'dd',	'si',	NULL,	'{"name":"file"}',	'{"name": "file"}',	'{"lg-cat": "Fitxer", "lg-deu": "Datei", "lg-ell": "Αρχείο", "lg-eng": "File", "lg-fra": "Télécharger", "lg-ita": "File", "lg-nep": "फाइल", "lg-spa": "Fichero"}'),
(15362191,	'dd1576',	'dd389',	'dd395',	'no',	'si',	'si',	2,	'dd',	'no',	NULL,	'{"name":"delete_found_records"}',	'{"name": "delete_found_records"}',	'{"lg-cat": "S''eliminaran tots els registres trobats.", "lg-deu": "Wird gelöscht: alle gefundenen Einträge", "lg-eng": "All records found will be deleted.", "lg-fra": "Tous les enregistrements trouvés seront supprimés.", "lg-ita": "Tutti i record trovati verranno eliminati.", "lg-nep": "फेला परेका सबै रेकर्डहरू मेटिने छन्।", "lg-spa": "Se eliminarán todos los registros encontrados."}'),
(15362192,	'dd1059',	'dd389',	'dd395',	'no',	'si',	'si',	4,	'dd',	'si',	NULL,	'{
  "name": "error_el_codigo_de_usuario_no_existe"
}',	'{"name": "error_el_codigo_de_usuario_no_existe"}',	'{"lg-cat": "Error. El codi d&#039;usuari no existeix a Dédalo. Contacte amb l&#039;administrador.", "lg-deu": "Fehler: Der Benutzercode existiert nicht in Dédalo. Bitte kontaktieren Sie Ihren Administrator.", "lg-ell": "Σφάλμα Ο κωδικός χρήστη δεν υπάρχει στο Daedalus. Επικοινωνήστε με τον διαχειριστή σας.", "lg-eng": "Error The user code does not exist in Dédalo. Contact with your administrator.", "lg-fra": "Erreur. Le code utilisateur n''existe pas dans Daedalus. Veuillez contacter votre administrateur.", "lg-ita": "Errore: Il codice dell''utente non esiste in Dedalo. Contatta l''amministratore.", "lg-nep": "त्रुटि प्रयोगकर्ता कोड Dédalo मा अवस्थित छैन। आफ्नो प्रशासकसँग सम्पर्क गर्नुहोस्।", "lg-spa": "Error. El código de usuario no existe en Dédalo. Contacto con el administrador."}'),
(15362193,	'dd168',	'dd389',	'dd395',	'no',	'si',	'si',	5,	'dd',	'si',	'',	'{"name":"verifique_datos_de_instalacion"}',	'{"name": "verifique_datos_de_instalacion"}',	'{"lg-cat": "Comproveu que les dades de configuració són correctes. Si no ho són, configurar la informació relativa a la base de dades en les preferències de Dédalo (config_db.php)", "lg-deu": "Überprüfen Sie, ob die Installationsdaten korrekt sind. Wenn sie es nicht sind, konfigurieren Sie die information gemäss der Datenbank in den Präferenzen von Dédalo (config_db.php)", "lg-ell": "Βεβαιωθείτε ότι τα στοιχεία της εγκατάστασης είναι σωστές. Εάν δεν είναι, ρυθμίστε τις πληροφορίες σχετικά με τις προτιμήσεις της βάσης δεδομένων Δαίδαλος (config_db.php)", "lg-eng": "Verify that the installation data are correct. If they are not, set the information on the Dédalo database preferences (config_db.php)", "lg-fra": "Vérifiez que les données d''installation sont correctes. Si ce n''est pas le cas, configurez les informations relatives à la base de données dans les préférences de Daedalus (config_db.php).", "lg-ita": "Verifica che i dati d''installazione sono corretti. Se non lo sono, configura l''informazione relativa alla base dei dati nelle preferenza di Dedalo (config_db.php)", "lg-nep": "स्थापना डाटा सही छ भनी प्रमाणित गर्नुहोस्। यदि तिनीहरू छैनन् भने, Dédalo डाटाबेस प्राथमिकताहरू (config_db.php) मा जानकारी सेट गर्नुहोस्।", "lg-spa": "Verifique que los datos de instalación son correctos. Si no lo son, configure la información relativa a la base de datos en las preferencias de Dédalo (config_db.php)"}'),
(15362194,	'dd165',	'dd389',	'dd395',	'no',	'si',	'si',	3,	'dd',	'si',	'',	'{"name":"error_usuario_sin_proyectos"}',	'{"name": "user_without_projects_error"}',	'{"lg-cat": "Error: L''usuari i la clau introduïdes són correctes però l''usuari actual no està correctament configurat. Si us plau, contacteu amb l''administrador per assignar projectes autoritzats al seu usuari.", "lg-deu": "Fehler: Benutzername und Passwort sind korrekt, aber der aktuelle Benutzer ist nicht korrekt konfiguriert. Bitte kontaktieren Sie Ihren Administrator, um dem Benutzer autorisierte Projekte zuzuweisen.", "lg-ell": "Σφάλμα: Το όνομα χρήστη και τον κωδικό πρόσβασης που έχουν εισαχθεί είναι σωστή, αλλά ο τρέχων χρήστης δεν έχει ρυθμιστεί σωστά. Επικοινωνήστε με το διαχειριστή σας για να εκχωρήσετε εξουσιοδοτημένος χρήστης με τα έργα σας.", "lg-eng": "Error: user and password are ok but the current user is not configured properly. Please contact the administrator to assign authorized projects for this user.", "lg-fra": "Erreur : L''utilisateur et le mot de passe saisis sont corrects mais l''utilisateur actuel n''est pas correctement configuré. Veuillez contacter votre administrateur pour assigner des projets autorisés à votre utilisateur.", "lg-ita": "Errore: L''utente e la chiave introdotti sono corretti però l''utente attuale non sta correttamente configurato. Per favore, contatta l''amministratore per assegnare progetti autorizzati al suo utente.", "lg-nep": "त्रुटि: प्रयोगकर्ता र पासवर्ड ठीक छ तर हालको प्रयोगकर्ता ठीकसँग कन्फिगर गरिएको छैन। यस प्रयोगकर्ताका लागि अधिकृत परियोजनाहरू तोक्नका लागि कृपया प्रशासकलाई सम्पर्क गर्नुहोस्।", "lg-spa": "Error: El usuario y la clave introducidos son correctos pero el usuario actual no está correctamente configurado. Por favor, contacte con su administrador para asignar proyectos autorizados a su usuario."}'),
(15362195,	'dd401',	'dd389',	'dd395',	'no',	'si',	'si',	10,	'dd',	'si',	'',	'{"name":"esta_seguro_de_borrar_este_registro"}',	'{"name": "are_you_sure_to_delete_this_record"}',	'{"lg-cat": "Està segur d''esborrar aquest registre?", "lg-deu": "Sind Sie sicher, dass Sie diesen Eintrag löschen wollen?", "lg-ell": "Είστε σίγουροι ότι για να διαγράψετε αυτό το ρεκόρ;", "lg-eng": "Are you sure to delete this record?", "lg-fra": "Êtes-vous sûr de vouloir supprimer cet enregistrement ?", "lg-ita": "Sei sicuro di cancellare questo registro?", "lg-nep": "के तपाइँ यो रेकर्ड मेटाउन निश्चित हुनुहुन्छ?", "lg-spa": "¿Está seguro de borrar este registro?"}'),
(15362196,	'dd1051',	'dd389',	'dd395',	'no',	'si',	'si',	7,	'dd',	'si',	'null',	'{"name":"seguro"}',	'{"name": "sure"}',	'{"lg-cat": "Segur?", "lg-deu": "Sind Sie sicher?", "lg-ell": "Είσαι σίγουρος;", "lg-eng": "Are you sure?", "lg-fra": "Êtes-vous sûr ?", "lg-ita": "Sicuro", "lg-nep": "के तपाईँ निश्चित हुनुहुन्छ?", "lg-spa": "¿Seguro?"}'),
(15362197,	'dd1578',	'dd1011',	'dd580',	'no',	'si',	'si',	6,	'dd',	'no',	NULL,	'{"css":{".wrap_component":{"mixin":[".vertical"],"style":{"width":"90%","margin-left":"10%","padding-bottom":"1em","padding-top":"1em"}}}}',	NULL,	'{"lg-deu": "Konfiguration", "lg-eng": "Configuration", "lg-fra": "Configuration", "lg-spa": "Configuración"}'),
(15362198,	'dd1319',	'dd1318',	'dd8',	'no',	'si',	'si',	1,	'dd',	'no',	'',	NULL,	'{"css": {".content_data": {"grid-template-columns": "repeat(10, 1fr)"}}}',	'{"lg-cat": "Valor de la llista", "lg-deu": "Wert aus der Liste", "lg-ell": "αναγνώριση", "lg-eng": "Value in the list", "lg-fra": "Valeur de la liste", "lg-ita": "Valore della lista", "lg-spa": "Valor de la lista"}'),
(15362199,	'dd355',	'dd242',	'dd4',	'no',	'si',	'si',	1,	'dd',	'si',	'',	NULL,	'{"css": {".wrapper_area": {"color": "white", "background-color": "#4fb492"}}}',	'{"lg-cat": "Cultural", "lg-deu": "Kulturell", "lg-ell": "Πολιτιστικός", "lg-eng": "Cultural", "lg-eus": "Kulturalak", "lg-fra": "Culture", "lg-ita": "Culturale", "lg-nep": "सांस्कृतिक", "lg-spa": "Cultural"}'),
(15362200,	'dd915',	'dd911',	'dd91',	'no',	'si',	'si',	3,	'dd',	'si',	'[{"dd9":"dd914"}]',	'',	NULL,	'{"lg-cat": "Llistat de registres", "lg-deu": "Liste der Einträge", "lg-eng": "Record listing", "lg-fra": "Liste des enregistrements", "lg-ita": "Elenco dei registri", "lg-spa": "Listado de registros"}'),
(15362201,	'dd1569',	'dd1514',	'dd347',	'no',	'si',	'si',	9,	'dd',	'si',	'[{"dd1229":"hierarchy65"},{"dd6":"on1"}]',	NULL,	NULL,	'{"lg-spa": "ts_onomastic"}'),
(15362202,	'dd1572',	'dd540',	'dd395',	'no',	'si',	'si',	7,	'dd',	'si',	NULL,	'{"name":"ultimos_cambios"}',	'{"name": "latest_changes"}',	'{"lg-ara": "أحدث التغييرات", "lg-cat": "Darrers canvis", "lg-deu": "Letzte Änderungen", "lg-eng": "Latest changes", "lg-fra": "Dernières modifications", "lg-ita": "Ultime modifiche", "lg-nep": "नवीनतम परिवर्तनहरू", "lg-spa": "Últimos cambios"}'),
(15362203,	'dd616',	'dd342',	'dd395',	'no',	'si',	'si',	15,	'dd',	'no',	NULL,	'{"name": "renumerar_secciones"}',	'{"name": "renumerar_secciones"}',	'{"lg-cat": "Renumerar seccions", "lg-deu": "Sektionen neu nummerieren", "lg-eng": "Renumerate sections", "lg-fra": "Renuméroter les sections", "lg-ita": "Rinumerare sezioni", "lg-spa": "Renumerar secciones"}'),
(15362204,	'dd1610',	'dd342',	'dd395',	'no',	'si',	'si',	17,	'dd',	'si',	NULL,	'{"name":"import_json_ontology"}',	'{"name": "import_json_ontology"}',	'{"lg-cat": "Importar Ontologia JSON", "lg-deu": "JSON-Ontologie importieren", "lg-ell": "εισαγωγή οντολογίας JSON", "lg-eng": "Import JSON ontology", "lg-fra": "Importer Ontologie JSON", "lg-ita": "Importa l''Ontologia JSON", "lg-spa": "Importar ontología JSON"}'),
(15362205,	'dd1573',	'dd1532',	'dd1747',	'no',	'si',	'si',	1,	'dd',	'no',	NULL,	'{"css":{".wrap_component":{"mixin":[".vertical",".inverse"],"style":{"width":"8%","border-bottom-right-radius":"8px"}}}}',	NULL,	'{"lg-cat": "Id", "lg-deu": "Id", "lg-ell": "Αναγν", "lg-eng": "Id", "lg-fra": "Id", "lg-spa": "Id"}'),
(15362206,	'dd1539',	'dd129',	'dd339',	'no',	'si',	'si',	13,	'dd',	'no',	'[{"dd6":"dd64"},{"dd9":"dd62"}]',	'{"css":{".wrap_component":{"style":{"clear":"left"}}}}',	'{"css": {".wrapper_component": {"grid-row": "1", "grid-column": "5 / span 1"}}}',	'{"lg-deu": "Öffentlich", "lg-eng": "Public", "lg-fra": "Public", "lg-spa": "Público"}'),
(15362207,	'dd1615',	'dd147',	'dd395',	'no',	'si',	'si',	21,	'dd',	'si',	NULL,	'{"name":"model"}',	'{"name": "model"}',	'{"lg-cat": "Model", "lg-deu": "Modell", "lg-ell": "Μοντέλο", "lg-eng": "Model", "lg-fra": "Modèle", "lg-ita": "Modello", "lg-nep": "मोडेल", "lg-spa": "Modelo"}'),
(15362208,	'dd1617',	'dd391',	'dd395',	'no',	'si',	'si',	90,	'dd',	'si',	NULL,	'{"name":"activity"}',	'{"name": "activity"}',	'{"lg-ara": "نشاط", "lg-cat": "Activitat", "lg-deu": "Aktivität", "lg-ell": "Δραστηριότητα", "lg-eng": "Activity", "lg-fra": "Activité", "lg-ita": "Attività", "lg-nep": "गतिविधि", "lg-spa": "Actividad"}'),
(15362209,	'dd1618',	'dd391',	'dd395',	'no',	'si',	'si',	91,	'dd',	'si',	NULL,	'{"name":"empty_selection"}',	'{"name": "empty_selection"}',	'{"lg-cat": "Selecció buida", "lg-deu": "Leere Auswahl", "lg-ell": "Κενή επιλογή", "lg-eng": "Empty selection", "lg-fra": "Sélection vide", "lg-ita": "Leere Auswahl", "lg-nep": "खाली चयन", "lg-spa": "Selección vacía"}'),
(15362210,	'dd1619',	'dd391',	'dd395',	'no',	'si',	'si',	92,	'dd',	'si',	NULL,	'{"name":"levels"}',	'{"name": "levels"}',	'{"lg-cat": "Nivells", "lg-deu": "Ebenen", "lg-ell": "Επίπεδα", "lg-eng": "Levels", "lg-fra": "Niveaux", "lg-ita": "Livelli", "lg-nep": "स्तरहरू", "lg-spa": "Niveles"}'),
(15362211,	'dd1620',	'dd147',	'dd395',	'no',	'si',	'si',	23,	'dd',	'si',	NULL,	'{"name":"type"}',	'{"name": "type"}',	'{"lg-cat": "Tipus", "lg-deu": "Typ", "lg-ell": "Τύπος", "lg-eng": "Type", "lg-fra": "Type", "lg-ita": "Tipo", "lg-nep": "टाइप गर्नुहोस्", "lg-spa": "Tipo"}'),
(15362212,	'dd617',	'dd389',	'dd395',	'no',	'si',	'si',	26,	'dd',	'si',	NULL,	'{"name":"exceeded_limit"}',	'{"name": "exceeded_limit"}',	'{"lg-cat": "S''ha sobrepassat el màxim nombre d''ítems per a aquest camp. límit =", "lg-deu": "Die maximale Anzahl an Items für dieses Feld wurde überschriten. Limite =", "lg-ell": "Έχει ξεπεραστεί ο μέγιστος αριθμός στοιχείων για αυτό το πεδίο. Όριο =", "lg-eng": "The maximum number of values for this field has been exceeded. Limit =", "lg-fra": "Le nombre maximum de valeurs pour ce champ a été dépassé. Limite =", "lg-ita": "è stato superato il massimo numero di items per questo campo. Limite =", "lg-nep": "यस क्षेत्रका लागि मानहरूको अधिकतम संख्या नाघिसकेको छ। सीमा =", "lg-spa": "Se ha rebasado el máximo número de valores para este campo. Límite ="}'),
(15362213,	'dd1036',	'dd389',	'dd395',	'no',	'si',	'si',	19,	'dd',	'si',	'',	'{"name":"relacion_anadida"}',	'{"name": "relacion_anadida"}',	'{"lg-cat": "Relació afegida", "lg-deu": "Beziehung hinzugefügt", "lg-ell": "σχέσης προστεθεί", "lg-eng": "Relation added", "lg-fra": "Rapport ajouté", "lg-ita": "Relazione aggiunta", "lg-nep": "सम्बन्ध थपियो", "lg-spa": "Relación añadida"}'),
(15362214,	'dd1744',	'dd389',	'dd395',	'no',	'si',	'si',	20,	'dd',	'si',	NULL,	'{"name":"por_favor_indexe_desde_una_seccion_de_inventario"}',	'{"name": "por_favor_indexe_desde_una_seccion_de_inventario"}',	'{"lg-deu": "Bitte indexieren Sie von einer Sektion des Inventars aus (z.B. Orale Geschichte) und nicht von einer Ressource", "lg-ell": "Παρακαλείστε να αναπροσαρμόζονται από ένα τμήμα των αποθεμάτων (σε. Προφορικής Ιστορίας) και όχι από έναν πόρο", "lg-eng": "Please, index from a section of inventory (eg. Oral History) and not from a resource", "lg-fra": "Veuillez indexer à partir d''une section d''inventaire (par exemple, Histoire orale) et non à partir d''une ressource.", "lg-ita": "Per favore, indicizza da una sezione d''inventario (es. Storia orale) e non da una risorsa", "lg-nep": "कृपया, इन्भेन्टरीको खण्डबाट अनुक्रमणिका (जस्तै मौखिक इतिहास) र स्रोतबाट होइन", "lg-spa": "Por favor, indexe desde una sección de inventario (ej. Historia Oral) y no desde un  recurso"}'),
(15362215,	'dd1725',	'dd129',	'dd1724',	'no',	'si',	'si',	5,	'dd',	'no',	'[{"dd6":"dd234"},{"dd9":"dd237"}]',	'{"css":{".wrap_component":{"mixin":[".vertical"],"style":{"width":"40%"}},".content_data":{"style":{}}}}',	'{"css": {".wrapper_component": {"grid-row": "1", "grid-column": "span 2"}}}',	'{"lg-cat": "Perfil d''usuari", "lg-deu": "Benutzerprofil", "lg-ell": "Προφίλ του χρήστη", "lg-eng": "User profile", "lg-fra": "Profil de l''utilisateur", "lg-ita": "Profilo dell&#039; utente", "lg-spa": "Perfil de usuario"}'),
(15362216,	'dd721',	'dd389',	'dd395',	'no',	'si',	'si',	27,	'dd',	'si',	NULL,	'{
  "name": "component_alternative"
}',	'{"name": "component_alternative"}',	'{"lg-cat": "Camp alternatiu. No fer servir llevat que el terme no es trobi normalitzat. Utilitzi en el seu lloc:% s", "lg-deu": "Alternatives Feld. Nur benutzen, wenn der Begriff nicht standardisiert vorkommt. Stattdessen verwenden: %s", "lg-ell": "Εναλλακτικό πεδίο. Μην χρησιμοποιείτε εκτός εάν ο όρος δεν είναι ομαλοποιημένος. Χρησιμοποιήστε αντ &#039;αυτού: %s", "lg-eng": "Alternative field. Do not use unless the term is not normalized. Use instead: %s", "lg-fra": "Champ alternatif. Ne pas utiliser sauf si le terme n''est pas normalisé. Utiliser à la place : %s", "lg-ita": "Campo alternativo. Non usare salvo che il termine non si trova normalizzato. Utilizza nello stesso luogo:", "lg-nep": "वैकल्पिक क्षेत्र। शब्द सामान्यीकृत नभएसम्म प्रयोग नगर्नुहोस्। यसको सट्टा प्रयोग गर्नुहोस्: %s", "lg-spa": "Campo alternativo. No usar salvo que el término no se encuentre normalizado. Utilize en su lugar: %s"}'),
(15362217,	'dd162',	'dd389',	'dd395',	'no',	'si',	'si',	1,	'dd',	'si',	'',	'{"name":"error_usuario_sin_perfil"}',	'{"name": "user_without_profile_error"}',	'{"lg-cat": "Error: L''usuari i la clau introduïdes són correctes però l''usuari actual no està correctament configurat. Si us plau, contacteu amb l''administrador per assignar perfil al seu usuari.", "lg-deu": "Fehler: Benutzername und Passwort sind korrekt, aber der aktuelle Benutzer ist nicht korrekt konfiguriert. Bitte kontaktieren Sie Ihren Administrator, um das Profil dem Benutzer zuzuweisen.", "lg-ell": "Σφάλμα: Το όνομα χρήστη και τον κωδικό πρόσβασης που έχουν εισαχθεί είναι σωστή, αλλά ο τρέχων χρήστης δεν έχει ρυθμιστεί σωστά. Επικοινωνήστε με το διαχειριστή σας για να ορίσετε το προφίλ χρήστη σας.", "lg-eng": "Error: user and password are ok but the current user is not configured properly. Please contact the administrator to assign profile to this user.", "lg-fra": "Erreur : L''utilisateur et le mot de passe introduits sont corrects mais l''utilisateur actuel n''est pas correctement configuré. Veuillez contacter votre administrateur pour attribuer un profil à votre utilisateur.", "lg-ita": "Errore: L''utente e la chiave introdotti sono corretti però l''utente attuale non sta correttamente configurato. Per favore, contatta l''amministratore per assegnare profilo al suo utente.", "lg-nep": "त्रुटि: प्रयोगकर्ता र पासवर्ड ठीक छ तर हालको प्रयोगकर्ता ठीकसँग कन्फिगर गरिएको छैन। कृपया यस प्रयोगकर्तालाई प्रोफाइल तोक्न प्रशासकलाई सम्पर्क गर्नुहोस्।", "lg-spa": "Error: El usuario y la clave introducidos son correctos pero el usuario actual no está correctamente configurado. Por favor, contacte con su administrador para asignar perfil a su usuario."}'),
(15362218,	'dd584',	'dd389',	'dd395',	'no',	'si',	'si',	13,	'dd',	'si',	'',	'{"name":"esta_seguro_de_sobreescribir_el_texto"}',	'{"name": "are_you_sure_to_overwrite_text"}',	'{"lg-cat": "Està segur que vol sobre escriure el text?", "lg-deu": "Sind Sie sicher, dass Sie diesen Text überschreiben wollen?", "lg-ell": "Είστε σίγουροι ότι αντικαταστήσετε το κείμενο;", "lg-eng": "Are you sure of overwrite the text?", "lg-fra": "Êtes-vous sûr de vouloir remplacer le texte ?", "lg-ita": "Sei sicuro di sovrascrivere il testo", "lg-nep": "के तपाइँ पाठ अधिलेखन गर्न निश्चित हुनुहुन्छ?", "lg-spa": "¿Está seguro de sobrescribir el texto?"}'),
(15362219,	'dd424',	'dd389',	'dd395',	'no',	'si',	'si',	6,	'dd',	'si',	'null',	'{
  "name": "error_generate_hierarchy"
}',	'{"name": "error_generate_hierarchy"}',	'{"lg-cat": "Aquesta jerarquia no está activa i no es pot generar", "lg-deu": "Diese Hierarchie ist nicht aktiv und kann nicht generiert werden.", "lg-ell": "Αυτή η ιεραρχία δεν είναι ενεργό και δεν μπορεί να δημιουργήσει", "lg-eng": "Current hierarchy is not active and no is possible generate it", "lg-fra": "Cette hiérarchie n''est pas active et ne peut pas être générée.", "lg-ita": "Questa gerarchia non è attiva e non si può creare", "lg-nep": "हालको पदानुक्रम सक्रिय छैन र यसलाई उत्पन्न गर्न सम्भव छैन", "lg-spa": "Esta jerarquía no está activa y no se puede generar"}'),
(15362220,	'dd403',	'dd389',	'dd395',	'no',	'si',	'si',	21,	'dd',	'no',	'',	'{"name":"atencion"}',	'{"name": "warning"}',	'{"lg-cat": "Atenció", "lg-deu": "Achtung", "lg-ell": "προσοχή", "lg-eng": "Warning", "lg-fra": "Attention", "lg-ita": "Attenzione", "lg-nep": "चेतावनी", "lg-spa": "Atención"}'),
(15362221,	'dd1726',	'dd390',	'dd395',	'no',	'si',	'si',	23,	'dd',	'si',	'',	'{"name":"aplicar"}',	'{"name": "apply"}',	'{"lg-cat": "Aplicar", "lg-deu": "Anwenden", "lg-ell": "ισχύουν", "lg-eng": "Apply", "lg-fra": "Appliquer", "lg-ita": "Applicare", "lg-nep": "निवेदन गर्नु", "lg-spa": "Aplicar"}'),
(15362222,	'dd93',	'dd391',	'dd395',	'no',	'si',	'si',	1,	'dd',	'si',	'',	'{"name":"creado"}',	'{"name": "created"}',	'{"lg-cat": "creat", "lg-deu": "erstellt", "lg-ell": "δημιουργήθηκε", "lg-eng": "created", "lg-fra": "créé", "lg-ita": "Creato", "lg-nep": "सिर्जना गरियो", "lg-spa": "creado"}'),
(15362223,	'dd1330',	'dd1582',	'dd80',	'no',	'si',	'si',	5,	'dd',	'no',	'[{"dd6":"dd1342"},{"dd9":"dd1345"}]',	'{"css":{".wrap_component":{"mixin":[".vertical"],"style":{"width":"50%"}},".content_data":{"style":{"height":"490px","overflow":"auto"}}}}',	'{"css": {".wrapper_component": {"grid-column": "span 5"}}}',	'{"lg-cat": "Afecta models:", "lg-deu": "Betrifft Modelle:", "lg-eng": "Affected models:", "lg-fra": "Affecte les modèles :", "lg-spa": "Afecta a modelos:"}'),
(15362224,	'dd283',	'dd537',	'dd395',	'no',	'si',	'si',	17,	'dd',	'si',	NULL,	'{"name":"procesando_media_en_background"}',	'{"name": "procesando_media_en_background"}',	'{"lg-cat": "Processant el material en segon pla. Aquest procés pot portar un temps, però vostè pot continuar treballant.", "lg-deu": "Hintergrundmedien werden verarbeitet. Dieser Prozess kann etwas dauern, aber Sie dürfen weiterarbeiten.", "lg-ell": "Μέσων φόντο επεξεργασία. Αυτή η διαδικασία μπορεί να διαρκέσει, αλλά μπορεί να συνεχίσει να εργάζεται.", "lg-eng": "Processing background media. This may take a while, but you can continue working.", "lg-fra": "Traitement des médias en arrière-plan. Ce processus peut prendre un certain temps, mais il peut continuer à fonctionner.", "lg-ita": "Processando media in secondo piano. Questo processo può tardare, però può continuare a lavorare.", "lg-spa": "Procesando media en segundo plano. Este proceso puede tardar, pero puede continuar trabajando."}'),
(15362225,	'dd1623',	'dd389',	'dd395',	'no',	'si',	'si',	36,	'dd',	'si',	NULL,	'{"name":"select_search_section"}',	'{"name": "select_search_section"}',	'{"lg-cat": "Seleccioneu una secció de cerca.", "lg-deu": "Wählen Sie einen Suchbereich aus.", "lg-ell": "Επιλέξτε μια ενότητα αναζήτησης.", "lg-eng": "Select a search section", "lg-fra": "Sélectionner une section de recherche.", "lg-ita": "Seleziona una sezione di ricerca.", "lg-nep": "खोज खण्ड चयन गर्नुहोस्", "lg-spa": "Seleccione una sección de búsqueda."}'),
(15362226,	'dd1540',	'dd1133',	'dd10',	'no',	'si',	'si',	5,	'dd',	'si',	NULL,	'{"css":{".wrap_component":{"mixin":[".vertical"],"style":{"width":"100%"}}}}',	'{"css": {".wrapper_component": {"grid-column": "span 10"}}}',	'{"lg-cat": "Descripció", "lg-deu": "Beschreibung", "lg-eng": "Description", "lg-fra": "Description", "lg-spa": "Description"}'),
(15362227,	'dd1632',	'dd366',	'dd1747',	'no',	'si',	'si',	1,	'dd',	'no',	'null',	NULL,	'{"css": {".wrapper_component": {"grid-column": "span 1"}}}',	'{"lg-cat": "Id", "lg-deu": "Id", "lg-ell": "Id", "lg-eng": "Id", "lg-fra": "Id", "lg-ita": "Id", "lg-spa": "Id"}'),
(15362228,	'dd884',	'dd883',	'dd9',	'no',	'si',	'si',	2,	'dd',	'si',	'',	'{"mandatory":true,"css":{".wrap_component":{"mixin":[".vertical"],"style":{"width":"80%"}}}}',	'{"css": {".wrapper_component": {"grid-column": "span 5"}}}',	'{"lg-cat": "Professió", "lg-deu": "Beruf", "lg-ell": "επάγγελμα", "lg-eng": "Profession", "lg-fra": "Profession", "lg-ita": "Professione", "lg-spa": "Profesión"}'),
(15362229,	'dd1637',	'dd943',	'dd1747',	'no',	'si',	'si',	1,	'dd',	'no',	'null',	'{"css":{".wrap_component":{"mixin":[".vertical",".inverse"],"style":{"width":"8%","border-bottom-right-radius":"8px"}}}}',	'{"css": {".wrapper_component": {"grid-column": "span 1"}}}',	'{"lg-cat": "Id", "lg-deu": "Id", "lg-eng": "Id", "lg-fra": "Id", "lg-ita": "Id", "lg-spa": "Id"}'),
(15362230,	'dd1587',	'dd389',	'dd395',	'no',	'si',	'si',	33,	'dd',	'si',	NULL,	'{"name":"email_limit_explanation"}',	'{"name": "email_limit_explanation"}',	'{"lg-eng": "The emails selected to send exceed the maximum limit of your operating system, so we have proceeded to create packages that do not exceed this maximum. Click on the following buttons to create the emails.", "lg-fra": "Les mails sélectionnés pour l''envoi dépassent la limite maximale de votre système d''exploitation, nous avons donc procédé à la création de dossiers qui ne dépassent pas ce maximum. Cliquez sur les boutons suivants pour créer les courriers.", "lg-nep": "पठाउनका लागि चयन गरिएका इमेलहरू तपाईंको अपरेटिङ सिस्टमको अधिकतम सीमा नाघ्छन्, त्यसैले हामीले यो अधिकतम नाघ्ने प्याकेजहरू सिर्जना गर्न अगाडि बढेका छौं। इमेलहरू सिर्जना गर्न निम्न बटनहरूमा क्लिक गर्नुहोस्।", "lg-spa": "Los correos seleccionados para enviar superan el límite máximo de su sistema operativo, por lo que se ha procedido a crear paquetes que no superen este máximo. Haga click en los siguientes botones para crear los correos."}'),
(15362231,	'dd625',	'dd637',	'dd580',	'no',	'si',	'si',	11,	'dd',	'no',	NULL,	'{"css":{".content_data":{"style":{"height":"64vh"}},".wrap_component":{"mixin":[".vertical"],"style":{"width":"100%"}}}}',	'{"css": {".wrapper_component": {"grid-column": "span 6"}, ".wrapper_component >.content_data": {"min-height": "70vh"}}, "sample_data": [{"show": {"ddo_map": [{"info": "Title test (component_input_text)", "mode": "edit", "tipo": "test52", "parent": "test3", "properties": {"css": {".wrapper_component.edit .input_value": {"background-color": "aqua"}}}, "section_tipo": "test3"}, {"info": "Email test (component_email)", "mode": "edit", "tipo": "test208", "parent": "test3", "section_tipo": "test3"}, {"info": "Portal test (component_portal)", "mode": "edit", "tipo": "test80", "parent": "test3", "section_tipo": "test3"}]}}]}',	'{"lg-cat": "JSON dada", "lg-deu": "JSON-Daten", "lg-eng": "JSON data", "lg-fra": "JSON data", "lg-ita": "JSON data", "lg-spa": "JSON data"}'),
(15362232,	'dd719',	'dd390',	'dd395',	'no',	'si',	'si',	13,	'dd',	'si',	'',	'{"name":"inicio"}',	'{"name": "beginning"}',	'{"lg-cat": "Inici", "lg-deu": "Beginn", "lg-ell": "εκκίνηση", "lg-eng": "Beginning", "lg-fra": "Accueil", "lg-ita": "Inizio", "lg-nep": "शुरुवात", "lg-spa": "Inicio"}'),
(15362233,	'dd582',	'dd390',	'dd395',	'no',	'si',	'si',	14,	'dd',	'si',	'',	'{"name":"selecionar_texto"}',	'{"name": "selecionar_texto"}',	'{"lg-cat": "Seleccionar text", "lg-deu": "Text auswählen", "lg-ell": "Επιλογή κειμένου", "lg-eng": "Select text", "lg-fra": "Sélectionner le texte", "lg-ita": "Selezionare testo", "lg-nep": "पाठ चयन गर्नुहोस्", "lg-spa": "Seleccionar texto"}'),
(15362234,	'dd831',	'dd390',	'dd395',	'no',	'si',	'si',	21,	'dd',	'si',	'',	'{"name":"borrar_el_recurso"}',	'{"name": "delete_resource_and_links"}',	'{"lg-cat": "Esborrar el recurs i tots els seus vincles", "lg-deu": "Ressource und alle ihre Verknüpfungen löschen", "lg-ell": "Διαγράψτε τον πόρο και όλες τις συνδέσεις", "lg-eng": "Delete resource and all links", "lg-fra": "Supprimer la ressource et tous ses liens", "lg-ita": "Cancellare la risorsae tutti i suoi collegamenti", "lg-nep": "स्रोत र सबै लिङ्कहरू मेटाउनुहोस्", "lg-spa": "Borrar el recurso y todos sus vínculos"}'),
(15362235,	'dd1735',	'dd390',	'dd395',	'no',	'si',	'si',	27,	'dd',	'si',	NULL,	'{"name":"mostrar_filtrados"}',	'{"name": "mostrar_filtrados"}',	'{"lg-cat": "Mostrar filtrats", "lg-deu": "Gefilterte anzeigen", "lg-ell": "Εμφάνιση φιλτραρισμένα", "lg-eng": "Show filtered", "lg-fra": "Afficher les boutons filtrés", "lg-ita": "Mostrare filtrati", "lg-nep": "फिल्टर गरिएको देखाउनुहोस्", "lg-spa": "Mostrar filtrados"}'),
(15362236,	'dd1736',	'dd390',	'dd395',	'no',	'si',	'si',	29,	'dd',	'si',	NULL,	'{"name":"salvar"}',	'{"name": "save"}',	'{"lg-cat": "Salvar", "lg-deu": "Speichern", "lg-ell": "αποθηκεύετε", "lg-eng": "Save", "lg-fra": "Sauver", "lg-ita": "Salvare", "lg-nep": "बचत गर्नुहोस्", "lg-spa": "Salvar"}'),
(15362237,	'dd1738',	'dd390',	'dd395',	'no',	'si',	'si',	30,	'dd',	'si',	NULL,	'{"name":"update_cache"}',	'{"name": "update_cache"}',	'{"lg-cat": "Actualitzar cache", "lg-deu": "Cache aktualisieren", "lg-ell": "ενημερωμένη cache", "lg-eng": "Update cache", "lg-fra": "Actualiser la mémoire cache", "lg-ita": "Aggiornare", "lg-nep": "क्यास अपडेट गर्नुहोस्", "lg-spa": "Actualizar caché"}'),
(15362238,	'dd261',	'dd390',	'dd395',	'no',	'si',	'si',	32,	'dd',	'no',	'null',	'{"name":"generar_turnos"}',	'{"name": "generar_turnos"}',	'{"lg-deu": "Besichtigungs-Schichten erstellen", "lg-ell": "Δημιουργήστε βάρδιες επισκέψεις", "lg-eng": "Generate shifts visits", "lg-fra": "Générer des changements de visiteurs", "lg-ita": "Creare turni di visite", "lg-spa": "Generar turnos de visitas"}'),
(15362239,	'dd1607',	'dd390',	'dd395',	'no',	'si',	'si',	38,	'dd',	'si',	NULL,	'{"name":"data_was_not_modified_save_canceled"}',	'{"name": "data_was_not_modified_save_canceled"}',	'{"lg-cat": "Les dades no s''han modificat. Desat cancel·lat.", "lg-deu": "Die Daten wurden nicht geändert. Speichern abgebrochen.", "lg-ell": "Τα δεδομένα δεν τροποποιήθηκαν. Ακυρώθηκε η αποθήκευση.", "lg-eng": "The data was not modified. Save canceled.", "lg-fra": "Les données n''ont pas été modifiées. Sauvegarde annulée.", "lg-ita": "I dati non sono stati modificati. Salvataggio annullato.", "lg-nep": "डाटा परिमार्जन गरिएको छैन। बचत रद्द गरियो।", "lg-spa": "Los datos no fueron modificados. Salvar cancelado."}'),
(15362240,	'dd1595',	'dd390',	'dd395',	'no',	'si',	'si',	35,	'dd',	'si',	NULL,	'{"name":"mostrar_botones"}',	'{"name": "show_buttons"}',	'{"lg-ara": "إظهار الأزرار", "lg-cat": "Mostrar botons", "lg-deu": "Schaltflächen anzeigen", "lg-ell": "εμφάνιση κουμπιών", "lg-eng": "Show buttons", "lg-fra": "Afficher les boutons", "lg-ita": "Mostra i pulsanti", "lg-nep": "बटनहरू देखाउनुहोस्", "lg-spa": "Mostrar botones"}'),
(15362241,	'dd688',	'dd622',	'dd1233',	'no',	'si',	'si',	1,	'dd',	'si',	'[{"dd339":"ww17"}]',	'{"info":"For construct the ENUM value of the field, it need to be changed from the -dato- (without language) to the final -enum- value, dato:enumvalue","data_to_be_used":"dato","enum":{"1":"si","2":"no"},"exclude_column":true}',	NULL,	'{"lg-spa": "publication"}'),
(15362242,	'dd607',	'dd147',	'dd395',	'no',	'si',	'si',	2,	'dd',	'si',	NULL,	'{
  "name": "order_change"
}',	'{"name": "order_change"}',	'{"lg-cat": "Canvi d''ordre", "lg-deu": "Änderung der Reihenfolge", "lg-ell": "Αλλαγή παραγγελίας", "lg-eng": "Order change", "lg-fra": "Changement d''ordre", "lg-ita": "Cambio in ordine", "lg-spa": "Cambio de orden"}'),
(15362243,	'dd468',	'dd129',	'dd635',	'no',	'si',	'si',	7,	'dd',	'no',	NULL,	'{"date_mode":"period","css":{".wrap_component":{"mixin":[".vertical"],"style":{"width":"25%","background-color":"#FFE2AB","border-right":"1px solid #d0d0d0"}},".content_data":{"style":{}}}}',	'{"css": {".wrapper_component": {"grid-column": "span 2", "background-color": "#FFE2AB"}}, "date_mode": "period"}',	'{"lg-cat": "Caducitat de la contrasenya", "lg-deu": "Gültigkeitsdauer des Passworts", "lg-ell": "Λήξης κωδικού πρόσβασης", "lg-eng": "Password expiration", "lg-fra": "Expiration du mot de passe", "lg-ita": "Scadenza della password", "lg-spa": "Caducidad de la contraseña"}'),
(15362244,	'dd134',	'dd129',	'dd227',	'no',	'si',	'si',	9,	'dd',	'no',	'',	'{"mandatory":true,"css":{".wrap_component":{"mixin":[".vertical"],"style":{"width":"30%","background-color":"#FFE2AB"}},".content_data":{"style":{}}}}',	'{"css": {".wrapper_component": {"grid-column": "span 3", "background-color": "#FFE2AB"}}, "mandatory": true}',	'{"lg-cat": "email", "lg-deu": "E-Mail", "lg-ell": "email", "lg-eng": "email", "lg-eus": "email-a", "lg-fra": "e-mail", "lg-ita": "E-mail", "lg-spa": "email"}'),
(15362245,	'dd135',	'dd129',	'dd10',	'no',	'si',	'si',	15,	'dd',	'no',	'',	'{"css":{".wrap_component":{"mixin":[".vertical"],"style":{"clear":"left","padding-bottom":"25px"}},".css_input_text_large":{"style":{"height":"100%"}}}}',	'{"css": {".wrapper_component": {"grid-column": "span 10"}}}',	'{"lg-cat": "Observacions", "lg-deu": "Beobachtungen", "lg-ell": "Παρατηρήσεις", "lg-eng": "Observations", "lg-eus": "Behaketak", "lg-fra": "Observations", "lg-ita": "Osservazioni", "lg-spa": "Observaciones"}'),
(15362246,	'dd1411',	'dd1392',	'dd431',	'no',	'si',	'si',	3,	'dd',	'no',	NULL,	'{
  "show_parent_name": true,
  "config_relation": {
    "relation_type": "dd89",
    "relation_type_rel": "dd620"
  },
  "source": {
    "mode": "autocomplete",
    "hierarchy_types": [],
    "hierarchy_sections": [
      "dd1100"
    ]
  },
  "css": {
    ".wrap_component": {
      "mixin": [
        ".vertical",
        ".line_top",
        ".line_right"
      ],
      "style": {
        "width": "50%",
        "border-right": "none"
      }
    }
  }
}',	'{"css": {".wrap_component": {"mixin": [".vertical", ".line_top", ".line_right"], "style": {"width": "50%", "border-right": "none"}}}, "source": {"mode": "autocomplete", "hierarchy_types": [1], "hierarchy_sections": []}, "config_relation": {"relation_type": "dd89", "relation_type_rel": "dd620"}, "show_parent_name": true}',	'{"lg-deu": "Verwandte Begriffe", "lg-eng": "Related terms", "lg-fra": "Termes liés", "lg-spa": "Términos relacionados"}'),
(15362247,	'dd1537',	'dd1636',	'dd52',	'no',	'si',	'si',	19,	'dd',	'si',	NULL,	'{"css":{".wrap_component":{"mixin":[".vertical"]}},"widgets":[{"data_source":[],"widget_info":"Creates a graphic visualization of whole user activity.","widget_name":"user_activity","widget_path":"\/dd\/widgets"}],"show_in_modes":["list","edit"]}',	'{"css": {".wrapper_component": {"grid-column": "span 1"}}, "widgets": [{"ipo": [{"input": [{"type": "totals", "section_tipo": "dd1521", "component_tipo": "dd1523"}, {"type": "date", "section_tipo": "dd1521", "component_tipo": "dd1530"}], "output": [{"id": "what", "value": "integer"}, {"id": "where", "value": "integer"}, {"id": "when", "value": "integer"}]}], "path": "/dd/user_activity", "data_source": [{"type": "totals", "section_tipo": "dd1521", "component_tipo": "dd1523"}, {"type": "date", "section_tipo": "dd1521", "component_tipo": "dd1530"}], "widget_info": "DRAFT UNFINISHED! Creates a graphic visualization of whole user activity", "widget_name": "user_activity", "widget_path": "/widgets/dd"}], "widgets_DES": [{"data_source": [], "widget_info": "Creates a graphic visualization of whole user activity.", "widget_name": "user_activity", "widget_path": "/dd/widgets"}], "show_in_modes": ["list", "edit"]}',	'{"lg-cat": "Activitat d&#039;usuari", "lg-deu": "Benutzeraktivität", "lg-eng": "User activity", "lg-fra": "Activité de l''utilisateur", "lg-spa": "Actividad de usuario"}'),
(15362248,	'dd1667',	'dd389',	'dd395',	'no',	'si',	'si',	40,	'dd',	'si',	'null',	'{"name":"skip_deletion_cause_children"}',	'{"name": "skip_deletion_cause_children"}',	'{"lg-cat": "S''ha omès l''eliminació del registre actual perquè té fills", "lg-deu": "Löschung des aktuellen Datensatzes übersprungen, da er Kinder hat", "lg-eng": "Skipped current record deletion because he has children", "lg-fra": "Il a ignoré la suppression de l''enregistrement actuel car il a des enfants", "lg-ita": "Saltata la cancellazione del record attuale perché ha dei figli", "lg-nep": "हालको रेकर्ड मेटाउन छोडियो किनभने उहाँसँग बच्चाहरू छन्", "lg-por": "Ignorou a eliminação do registo atual porque tem filhos", "lg-spa": "Se ha omitido la eliminación del registro actual porque tiene hijos"}'),
(15362249,	'dd549',	'dd542',	'dd91',	'no',	'si',	'si',	2,	'dd',	'si',	'[{"dd9":"dd547"},{"dd9":"dd543"},{"dd9":"dd544"},{"dd9":"dd546"},{"dd9":"dd545"},{"dd247":"dd551"},{"dd9":"dd550"}]',	NULL,	'{"source": {"request_config": [{"sqo": {"limit": 25, "section_tipo": [{"value": ["dd542"], "source": "section"}]}, "show": {"ddo_map": [{"info": "When - component_date", "tipo": "dd547", "width": "11.3rem", "parent": "self", "section_tipo": "self"}, {"info": "Who - component_portal", "tipo": "dd543", "width": "10rem", "parent": "self", "section_tipo": "self"}, {"info": "Information (IP Address) - component_input_text", "tipo": "dd544", "view": "ip", "width": "minmax(8rem, 1fr)", "parent": "self", "section_tipo": "self"}, {"info": "Where - component_input_text", "tipo": "dd546", "width": "10rem", "parent": "self", "section_tipo": "self"}, {"info": "What - component_select", "tipo": "dd545", "width": "5rem", "parent": "self", "section_tipo": "self"}, {"info": "Data - component_json", "tipo": "dd551", "view": "collapse", "parent": "self", "section_tipo": "self"}, {"info": "Project component_filter", "tipo": "dd550", "view": "collapse", "width": "13rem", "parent": "self", "section_tipo": "self"}], "fields_separator": " | "}, "type": "main", "api_engine": "dedalo"}]}}',	'{"lg-deu": "Sektionsliste", "lg-eng": "List", "lg-fra": "Liste des sections", "lg-ita": "Elenco della sezione", "lg-spa": "section list"}'),
(15362250,	'dd1642',	'dd342',	'dd395',	'no',	'si',	'si',	20,	'dd',	'si',	NULL,	'{"name":"update_data_version"}',	'{"name": "update_data_version"}',	'{"lg-cat": "Actualitzar la versió de la dada", "lg-deu": "Datenversion aktualisieren", "lg-eng": "Update data version", "lg-fra": "Mettre à jour la version des données", "lg-ita": "Aggiorna la versione dei dati", "lg-por": "Atualizar versão dos dados", "lg-spa": "Actualizar la versión del dato"}'),
(15362251,	'dd1315',	'dd1314',	'dd9',	'no',	'si',	'si',	2,	'dd',	'si',	'',	NULL,	'{"css": {".wrapper_component": {"grid-column": "span 5"}}}',	'{"lg-cat": "Tipologia de document administratiu", "lg-deu": "Typologie des administrativen Dokuments", "lg-eng": "Administrative document typology", "lg-fra": "Typologie des documents administratifs", "lg-ita": "Tipologia di documento amministrativo", "lg-spa": "Tipología de documento administrativo"}'),
(15362252,	'dd1645',	'dd390',	'dd395',	'no',	'si',	'si',	40,	'dd',	'si',	NULL,	'{"name":"delete_diffusion_records"}',	'{"name": "delete_diffusion_records"}',	'{"lg-cat": "Esborrar registres de difusió", "lg-deu": "Diffusionsdatensätze löschen", "lg-ell": "Διαγραφή εγγραφών διάχυσης", "lg-eng": "Delete diffusion records", "lg-fra": "Supprimer les enregistrements de diffusion", "lg-ita": "Cancellare i record di diffusione", "lg-nep": "प्रसार रेकर्डहरू मेटाउनुहोस्", "lg-por": "Eliminar registos de difusão", "lg-spa": "Borrar registros de difusión"}'),
(15362253,	'dd418',	'dd147',	'dd395',	'no',	'si',	'si',	10,	'dd',	'si',	NULL,	'{"name":"dias"}',	'{"name": "days"}',	'{"lg-cat": "dies", "lg-deu": "Tage", "lg-ell": "ημέρες", "lg-eng": "days", "lg-fra": "jours", "lg-ita": "Giorni", "lg-nep": "दिनहरू", "lg-spa": "días"}'),
(15362254,	'dd944',	'dd943',	'dd9',	'no',	'si',	'si',	2,	'dd',	'si',	'',	NULL,	'{"css": {".wrapper_component": {"grid-column": "span 5"}}}',	'{"lg-cat": "Tipus d''associació / grup", "lg-deu": "Typ der Verbindung / Gruppe", "lg-ell": "Τύπος της ένωσης / ομάδας", "lg-eng": "Type of association / group", "lg-fra": "Type d''association / de groupe", "lg-ita": "Tipo di associazione / gruppo", "lg-spa": "Tipo de asociación / grupo"}'),
(15362255,	'dd1527',	'dd529',	'dd1747',	'no',	'si',	'si',	1,	'dd',	'no',	'null',	NULL,	'{"css": {".wrapper_component": {"grid-column": "span 1"}}}',	'{"lg-cat": "Id", "lg-deu": "Id", "lg-ell": "Id", "lg-eng": "Id", "lg-fra": "Id", "lg-ita": "Id", "lg-spa": "Id"}'),
(15362256,	'dd376',	'dd373',	'dd635',	'no',	'si',	'si',	4,	'dd',	'no',	NULL,	'{"css":{".wrap_component":{"mixin":[".vertical"],"style":{"width":"25%"}}}}',	'{"css": {".wrapper_component": {"grid-column": "span 2"}}}',	'{"lg-cat": "Any de fundació", "lg-deu": "Gründungsjahr", "lg-ell": "έτος ίδρυσης", "lg-eng": "Foundation year", "lg-fra": "Année de fondation", "lg-ita": "Anno di fondazione", "lg-spa": "Año de fundación"}'),
(15362257,	'dd883',	'dd882',	'dd8',	'no',	'si',	'si',	1,	'dd',	'no',	'',	NULL,	'{"css": {".content_data": {"grid-template-columns": "repeat(10, 1fr)"}}}',	'{"lg-cat": "General", "lg-deu": "Allgemein", "lg-ell": "αναγνώριση", "lg-eng": "Professions", "lg-fra": "Général", "lg-ita": "Generale", "lg-spa": "General"}'),
(15362258,	'dd998',	'dd147',	'dd395',	'no',	'si',	'si',	16,	'dd',	'no',	'',	'{"name":"select_page_of_the_doc"}',	'{"name": "select_page_of_the_doc"}',	'{"lg-cat": "Seleccioneu una pàgina de el document:", "lg-deu": "Wählen Sie eine Seite aus dem Dokument", "lg-ell": "Επιλέξτε μια σελίδα του εγγράφου:", "lg-eng": "Select a page of the document:", "lg-fra": "Sélectionner une page du document :", "lg-ita": "Seleziona una pagina del documento:", "lg-nep": "कागजातको पृष्ठ चयन गर्नुहोस्:", "lg-spa": "Seleccione una página del documento:"}'),
(15362259,	'dd1649',	'dd147',	'dd395',	'no',	'si',	'si',	25,	'dd',	'si',	NULL,	'{"name":"publicado"}',	'{"name": "publicado"}',	'{"lg-cat": "Publicat", "lg-deu": "Veröffentlicht", "lg-ell": "Δημοσιευμένο", "lg-eng": "Published", "lg-fra": "Publié", "lg-ita": "Pubblicato", "lg-nep": "प्रकाशित", "lg-por": "Publicado", "lg-spa": "Publicado"}'),
(15362260,	'dd1622',	'dd147',	'dd395',	'no',	'si',	'si',	26,	'dd',	'si',	NULL,	'{"name":"select_one_project"}',	'{"name": "select_one_project"}',	'{"lg-cat": "Heu de seleccionar almenys un projecte", "lg-deu": "Sie müssen mindestens ein Projekt auswählen", "lg-eng": "You must select at least one project", "lg-fra": "Vous devez sélectionner au moins un projet", "lg-ita": "Devi selezionare almeno un progetto", "lg-nep": "तपाईंले कम्तिमा एउटा परियोजना चयन गर्नुपर्छ", "lg-spa": "Debe seleccionar al menos un proyecto"}'),
(15362261,	'dd409',	'dd408',	'dd8',	'no',	'si',	'si',	1,	'dd',	'no',	NULL,	NULL,	'{"css": {".content_data": {"grid-template-columns": "repeat(10, 1fr)"}}}',	'{"lg-cat": "Identificació", "lg-deu": "Identifizierung", "lg-ell": "αναγνώριση", "lg-eng": "Identification", "lg-fra": "Identification", "lg-ita": "Identificazione", "lg-spa": "Identificación"}'),
(15362262,	'dd1659',	'dd785',	'dd395',	'no',	'si',	'si',	76,	'dd',	'si',	NULL,	'{"name":"export_hierarchy"}',	'{"name": "export_hierarchy"}',	'{"lg-cat": "Exportar jerarquia", "lg-deu": "Hierarchie exportieren", "lg-ell": "Εξαγωγή ιεραρχίας", "lg-eng": "Export hierarchy", "lg-fra": "Exportation de la hiérarchie", "lg-ita": "Gerarchia di esportazione", "lg-nep": "पदानुक्रम निर्यात गर्दै", "lg-spa": "Exportar jerarquía"}'),
(15362263,	'dd265',	'dd1319',	'dd57',	'no',	'si',	'si',	2,	'dd',	'no',	'[{"dd6":"dd64"},{"dd9":"dd62"}]',	'{"dato_default":[{"section_id":"1","section_tipo":"dd64"}],"css":{".wrap_component":{"mixin":[".vertical"],"style":{"width":"12%"}}}}',	'{"css": {".wrapper_component": {"grid-column": "span 2"}}, "dato_default": [{"section_id": "1", "section_tipo": "dd64"}]}',	'{"lg-cat": "Es descriptor", "lg-deu": "Ist Deskriptor", "lg-eng": "Is descriptor", "lg-fra": "C''est un descripteur", "lg-ita": "Descrittore", "lg-spa": "Es descriptor"}'),
(15362264,	'dd366',	'dd365',	'dd8',	'no',	'si',	'si',	1,	'dd',	'no',	NULL,	NULL,	'{"css": {".content_data": {"grid-template-columns": "repeat(10, 1fr)"}}}',	'{"lg-cat": "Estat Civil", "lg-deu": "Zivilstand", "lg-ell": "αναγνώριση", "lg-eng": "Civil status", "lg-fra": "État civil", "lg-ita": "Stato civile", "lg-spa": "Estado civil"}'),
(15362265,	'dd373',	'dd372',	'dd8',	'no',	'si',	'si',	1,	'dd',	'no',	NULL,	NULL,	'{"css": {".content_data": {"grid-template-columns": "repeat(10, 1fr)"}}}',	'{"lg-cat": "Partit polític", "lg-deu": "Politische Partei", "lg-ell": "αναγνώριση", "lg-eng": "Politic party", "lg-fra": "Partis politiques", "lg-ita": "Partito politico", "lg-spa": "Partido político"}'),
(15362266,	'dd529',	'dd528',	'dd8',	'no',	'si',	'si',	1,	'dd',	'no',	NULL,	NULL,	'{"css": {".content_data": {"grid-template-columns": "repeat(10, 1fr)"}}}',	'{"lg-cat": "Identificació", "lg-deu": "Identifizierung", "lg-eng": "Identification", "lg-fra": "Identification", "lg-ita": "Identificazione", "lg-spa": "Identificación"}'),
(15362267,	'dd943',	'dd942',	'dd8',	'no',	'si',	'si',	1,	'dd',	'no',	'',	NULL,	'{"css": {".content_data": {"grid-template-columns": "repeat(10, 1fr)"}}}',	'{"lg-cat": "Valor de la llista", "lg-deu": "Wert aus der Liste", "lg-ell": "αναγνώριση", "lg-eng": "Type of association / group", "lg-fra": "Valeur de la liste", "lg-ita": "Valore della lista", "lg-spa": "Valor de la lista"}'),
(15362268,	'dd486',	'dd73',	'dd8',	'no',	'si',	'si',	4,	'dd',	'no',	'null',	NULL,	NULL,	'{"lg-cat": "Etiquetes", "lg-deu": "Etiketten", "lg-ell": "Ετικέτες", "lg-eng": "Labels", "lg-fra": "Étiquettes", "lg-spa": "Etiquetas"}'),
(15362269,	'dd997',	'dd996',	'dd1129',	'no',	'si',	'si',	1,	'dd',	'no',	'[{"dd57":"dd1354"},{"dd9":"dd799"},{"dd9":"dd1327"},{"dd9":"dd1328"},{"dd10":"dd612"},{"dd80":"dd1330"},{"dd580":"dd1350"},{"dd57":"dd1331"},{"dd57":"dd1332"},{"dd57":"dd1333"},{"dd10":"dd1362"},{"dd580":"dd1334"},{"dd580":"dd1335"},{"dd580":"dd1372"},{"dd580":"dd1353"},{"dd247":"dd1337"},{"dd8":"dd1582"},{"dd580":"dd1633"},{"dd9":"dd1644"},{"dd8":"dd482"},{"dd8":"dd486"}]',	NULL,	NULL,	'{"lg-deu": "Ausgeschlossene", "lg-eng": "Exclude", "lg-fra": "Exclus ", "lg-spa": "Excluidos"}'),
(15362270,	'dd1089',	'dd537',	'dd395',	'no',	'si',	'si',	2,	'dd',	'si',	'',	'{"name":"una_extension_de_php_detuvo_la_carga_de_archivos"}',	'{"name": "php_extension_stopped_the_upload_file"}',	'{"lg-cat": "Una extensió de PHP va detenir la càrrega d''arxius", "lg-deu": "Eine PHP-Erweiterung hat das Laden der Dateien angehalten", "lg-ell": "Μια επέκταση PHP σταματήσει το upload αρχείου", "lg-eng": "A PHP extension stopped the file upload", "lg-fra": "Une extension de PHP interrompt les téléchargements de fichiers", "lg-ita": "Un''estensione di PHP ha impedito il caricamento degli archivi", "lg-spa": "Una extensión de PHP detuvo la carga de archivos"}'),
(15362271,	'dd137',	'dd68',	'dd4',	'no',	'si',	'si',	1,	'dd',	'si',	'',	'',	NULL,	'{"lg-cat": "Privades", "lg-deu": "Private", "lg-eng": "Private lists", "lg-fra": "Privés", "lg-ita": "Private", "lg-spa": "Privadas"}'),
(15362272,	'dd1453',	'dd68',	'dd4',	'no',	'si',	'si',	18,	'dd',	'no',	NULL,	'',	'null',	'{"lg-cat": "Configuracions i útils", "lg-deu": "Einstellungen und Werkzeuge", "lg-eng": "Settings and tools", "lg-fra": "Configurations et outils", "lg-spa": "Configuraciones y útiles"}'),
(15362273,	'dd1664',	'dd389',	'dd395',	'no',	'si',	'si',	38,	'dd',	'si',	'null',	'{"name":"user_code_does_not_exist_error"}',	'{"name": "no_hay_etiqueta_seleccionada"}',	'{"lg-cat": "El codi d''usuari no existeix", "lg-deu": "Benutzercode ist nicht vorhanden", "lg-eng": "User code does not exist", "lg-ita": "Il codice utente non esiste", "lg-nep": "प्रयोगकर्ता कोड अवस्थित छैन", "lg-por": "O código de utilizador não existe", "lg-spa": "El código de usuario no existe"}'),
(15362274,	'dd542',	'dd207',	'dd6',	'no',	'si',	'si',	4,	'dd',	'no',	'[{"dd626":"dd628"},{"dd638":"dd639"}]',	'',	NULL,	'{"lg-cat": "Activitat", "lg-deu": "Aktivität", "lg-ell": "δραστηριότητα", "lg-eng": "Activity", "lg-fra": "Activité", "lg-ita": "Attività", "lg-nep": "गतिविधि", "lg-spa": "Actividad"}'),
(15362275,	'dd73',	'dd1323',	'dd6',	'no',	'si',	'si',	1,	'dd',	'no',	'[{"dd626":"dd46"}]',	'',	NULL,	'{"lg-deu": "Werkzeuge", "lg-eng": "Tools", "lg-fra": "Outils", "lg-spa": "Herramientas"}'),
(15362276,	'dd54',	'dd154',	'dd530',	'no',	'si',	'si',	6,	'dd',	'no',	'[{"dd6":"dd1308"},{"dd9":"dd1311"}]',	'{"css":{".wrap_component":{"mixin":[".width_50",".vertical",".line_top"],"style":{}},".label":{"style":{}},".content_data":{"style":{}}}}',	'{"css": {".wrapper_component": {"grid-column": "span 3"}}}',	'{"lg-cat": "Línia d''investigació", "lg-deu": "Forschungslinie", "lg-ell": "έρευνα Γραμμή", "lg-eng": "Research line", "lg-fra": "Ligne de recherche", "lg-ita": "Linea d&#039; indagine", "lg-spa": "Línea de investigación"}'),
(15362277,	'dd1532',	'dd193',	'dd8',	'no',	'si',	'si',	2,	'dd',	'no',	NULL,	NULL,	NULL,	'{"lg-deu": "", "lg-eng": "Day", "lg-fra": "tm info", "lg-spa": "tm info"}'),
(15362278,	'dd1533',	'dd627',	'dd626',	'no',	'si',	'si',	21,	'dd',	'si',	NULL,	'{
  "inverse_relations": false
}',	'{"inverse_relations": false}',	'{"lg-spa": "matrix_stats"}'),
(15362279,	'dd16',	'dd627',	'dd626',	'no',	'si',	'si',	10,	'dd',	'no',	'',	'{
  "inverse_relations": false
}',	'{"inverse_relations": false}',	'{"lg-spa": "matrix_layout"}'),
(15362280,	'dd46',	'dd627',	'dd626',	'no',	'si',	'no',	16,	'dd',	'no',	'',	'{
  "inverse_relations": false
}',	'{"inverse_relations": false}',	'{"lg-spa": "matrix_tools"}'),
(15362281,	'dd628',	'dd627',	'dd626',	'no',	'si',	'si',	3,	'dd',	'no',	'',	'{
  "inverse_relations": false
}',	'{"inverse_relations": false}',	'{"lg-spa": "matrix_activity"}'),
(15362282,	'dd963',	'dd627',	'dd626',	'no',	'si',	'si',	5,	'dd',	'no',	'',	'{
  "inverse_relations": false
}',	'{"inverse_relations": false}',	'{"lg-spa": "matrix_dd"}'),
(15362283,	'dd489',	'dd627',	'dd626',	'no',	'si',	'si',	17,	'dd',	'no',	NULL,	'{
  "inverse_relations": false
}',	'{"inverse_relations": false}',	'{"lg-spa": "matrix_structurations"}'),
(15362284,	'dd82',	'dd627',	'dd626',	'no',	'si',	'si',	2,	'dd',	'no',	'',	'{
  "inverse_relations": true
}',	'{"inverse_relations": true}',	'{"lg-spa": "matrix_activities"}'),
(15362285,	'dd425',	'dd627',	'dd626',	'no',	'si',	'si',	6,	'dd',	'no',	NULL,	'{
  "inverse_relations": true
}',	'{"inverse_relations": true}',	'{"lg-spa": "matrix_hierarchy"}'),
(15362286,	'dd1746',	'dd537',	'dd395',	'no',	'si',	'si',	3,	'dd',	'si',	NULL,	'{
  "name": "procesar"
}',	'{"name": "procesar"}',	'{"lg-cat": "processar", "lg-deu": "Verarbeiten", "lg-ell": "διαδικασία", "lg-eng": "process", "lg-fra": "processus", "lg-ita": "Processare", "lg-spa": "procesar"}'),
(15362287,	'dd657',	'dd391',	'dd395',	'no',	'si',	'si',	79,	'dd',	'si',	NULL,	'{
  "name": "go_to_page"
}',	'{"name": "go_to_page"}',	'{"lg-cat": "Anar a la pàgina", "lg-deu": "Gehe zur Seite", "lg-ell": "Πηγαίνετε στη σελίδα", "lg-eng": "Go to page", "lg-fra": "Aller à la page", "lg-ita": "Andare alla pagina", "lg-nep": "पृष्ठमा जानुहोस्", "lg-spa": "Ir a la página"}'),
(15362288,	'dd739',	'dd537',	'dd395',	'no',	'si',	'si',	6,	'dd',	'si',	'',	'{
  "name": "seleccione_el_fichero_a_subir"
}',	'{"name": "seleccione_el_fichero_a_subir"}',	'{"lg-cat": "Seleccione el fitxer a pujar", "lg-deu": "Wählen Sie die Datei zum Hochladen", "lg-ell": "Επιλέξτε το αρχείο για να φορτώσετε", "lg-eng": "Select a File to Upload", "lg-fra": "Sélectionner le fichier à télécharger", "lg-ita": "Seleziona il file da caricare", "lg-spa": "Seleccione el fichero a subir"}'),
(15362289,	'dd400',	'dd391',	'dd395',	'no',	'si',	'si',	73,	'dd',	'si',	'',	'{"name":"sin_acceso"}',	'{"name": "no_access"}',	'{"lg-cat": "Sense accés aquí", "lg-deu": "Ohne Zugang hier", "lg-ell": "Χωρίς πρόσβαση εδώ", "lg-eng": "No access here", "lg-fra": "Pas d''accès ici", "lg-ita": "Senza accesso qui", "lg-nep": "यहाँ पहुँच छैन", "lg-spa": "Sin acceso aquí"}'),
(15362290,	'dd707',	'dd391',	'dd395',	'no',	'si',	'si',	15,	'dd',	'si',	'',	'{"name":"registro"}',	'{"name": "record"}',	'{"lg-cat": "registre", "lg-deu": "Eintrag", "lg-ell": "εγγραφή", "lg-eng": "record", "lg-fra": "Registre", "lg-ita": "registro", "lg-nep": "रेकर्ड", "lg-spa": "registro"}'),
(15362291,	'dd1034',	'dd391',	'dd395',	'no',	'si',	'si',	61,	'dd',	'si',	'',	'{"name":"seleccione_una_etiqueta_para_indexar"}',	'{"name": "seleccione_una_etiqueta_para_indexar"}',	'{"lg-cat": "Seleccioneu una etiqueta per indexar", "lg-deu": "Wählen Sie ein Label zum Indexieren", "lg-ell": "Επιλέξτε μια ετικέτα στο ευρετήριο", "lg-eng": "Select a tag to index", "lg-fra": "Sélectionner une étiquette à indexer", "lg-ita": "Seleziona un'' etichetta per indicizzare", "lg-nep": "अनुक्रमणिकाको लागि ट्याग चयन गर्नुहोस्", "lg-spa": "Seleccione una etiqueta para indexar"}'),
(15362292,	'dd685',	'dd118',	'dd395',	'no',	'si',	'si',	10,	'dd',	'si',	NULL,	'{
  "name": "tool_do_add"
}',	'{"name": "tool_do_add"}',	'{"lg-cat": "Afegir el contigut", "lg-deu": "Inhalt hinzufügen", "lg-ell": "Προσθέστε το περιεχόμενο", "lg-eng": "Add the content", "lg-fra": "Ajouter du contenu", "lg-ita": "Aggiungere il contenuto", "lg-spa": "Añadir el contenido"}'),
(15362293,	'dd907',	'dd868',	'dd247',	'no',	'si',	'si',	6,	'dd',	'no',	NULL,	'{
  "css": {
    ".wrap_component": {
      "mixin": [
        ".vertical"
      ],
      "style": {
        "width": "20%"
      }
    }
  }
}',	'{"css": {".wrap_component": {"mixin": [".vertical"], "style": {"width": "20%"}}}}',	'{"lg-deu": "Projekt", "lg-eng": "Project", "lg-fra": "Projet", "lg-ita": "Progetto", "lg-spa": "Proyecto"}'),
(15362294,	'dd751',	'dd348',	'dd1229',	'no',	'si',	'si',	4,	'dd',	'si',	'[{"dd6":"rsc176"}]',	NULL,	NULL,	'{"lg-spa": "documents"}'),
(15362295,	'dd353',	'dd440',	NULL,	'si',	'si',	'si',	51,	'dd',	'no',	NULL,	NULL,	NULL,	'{"lg-spa": "component_semantic_node"}'),
(15362296,	'dd1278',	'dd622',	'dd1231',	'no',	'si',	'si',	35,	'dd',	'no',	'[{"dd500":"ww47"}]',	'{"data_to_be_used":"dato"}',	NULL,	'{"lg-spa": "uri"}'),
(15362297,	'dd11',	'dd440',	'null',	'si',	'si',	'si',	32,	'dd',	'no',	'',	'',	NULL,	'{"lg-spa": "component_select"}'),
(15362298,	'dd164',	'dd440',	'null',	'si',	'si',	'si',	50,	'dd',	'no',	'',	'',	NULL,	'{"lg-spa": "component_alias"}'),
(15362299,	'dd556',	'dd2',	NULL,	'si',	'si',	'si',	6,	'dd',	'si',	NULL,	NULL,	NULL,	'{"lg-spa": "dataframe_root"}'),
(15362300,	'dd614',	'dd2',	NULL,	'si',	'si',	'no',	9,	'dd',	'no',	NULL,	NULL,	NULL,	'{"lg-spa": "RECICLAR !!"}'),
(15362301,	'dd103',	'dd6',	NULL,	'si',	'si',	'no',	3,	'dd',	'no',	'',	'',	NULL,	'{"lg-spa": "search"}'),
(15362302,	'dd1058',	'dd6',	'null',	'si',	'si',	'si',	8,	'dd',	'no',	'',	'',	NULL,	'{"lg-spa": "button_stats"}'),
(15362303,	'dd97',	'dd6',	'null',	'si',	'si',	'si',	1,	'dd',	'no',	'',	'',	NULL,	'{"lg-spa": "edit_view"}'),
(15362304,	'dd144',	'dd6',	'null',	'si',	'si',	'si',	13,	'dd',	'no',	'',	'',	NULL,	'{"lg-spa": "section_list_thesaurus"}'),
(15362305,	'dd181',	'dd6',	NULL,	'si',	'si',	'si',	19,	'dd',	'no',	NULL,	'',	NULL,	'{"lg-spa": "state_map"}'),
(15362306,	'dd441',	'dd6',	NULL,	'si',	'si',	'si',	20,	'dd',	'no',	NULL,	NULL,	NULL,	'{"lg-spa": "section_map"}'),
(15362307,	'dd609',	'dd117',	NULL,	'si',	'si',	'si',	11,	'dd',	'no',	NULL,	NULL,	NULL,	'{"lg-spa": "area_development"}'),
(15362308,	'dd1349',	'dd1342',	'dd183',	'no',	'si',	'si',	5,	'dd',	'no',	NULL,	NULL,	NULL,	'{"lg-deu": "Löschen", "lg-eng": "Delete", "lg-fra": "Supprimer", "lg-spa": "Borrar"}'),
(15362309,	'dd593',	'dd585',	'dd339',	'no',	'si',	'si',	2,	'dd',	'no',	'[{"dd6":"dd64"},{"dd9":"dd62"}]',	'{
  "dato_default": [
    {
      "section_id": "1",
      "section_tipo": "dd64"
    }
  ],
  "css": {
    ".wrap_component": {
      "mixin": [
        ".vertical"
      ],
      "style": {
        "width": "10%"
      }
    }
  }
}',	'{"css": {".wrap_component": {"mixin": [".vertical"], "style": {"width": "10%"}}}, "dato_default": [{"section_id": "1", "section_tipo": "dd64"}]}',	'{"lg-cat": "Públic", "lg-deu": "Öffentlich", "lg-ell": "Δημόσιο", "lg-eng": "Public", "lg-fra": "Public", "lg-ita": "Pubblico", "lg-spa": "Público"}'),
(15362310,	'dd1198',	'dd1197',	'dd8',	'no',	'si',	'si',	1,	'dd',	'no',	NULL,	NULL,	NULL,	'{"lg-deu": "Allgemeine Informationen", "lg-eng": "General information", "lg-fra": "Information générale", "lg-ita": "Informazione generale", "lg-spa": "Información general"}'),
(15362311,	'dd1238',	'dd264',	'dd1231',	'no',	'si',	'si',	3,	'dd',	'no',	'[{"dd9":"dd896"}]',	NULL,	NULL,	'{"lg-spa": "reference"}'),
(15362312,	'dd1124',	'dd1101',	'dd1231',	'no',	'si',	'si',	11,	'dd',	'no',	'[{"dd9":"dd806"}]',	NULL,	NULL,	'{"lg-spa": "details_other_references"}'),
(15362313,	'dd1004',	'dd1003',	'dd500',	'no',	'si',	'si',	4,	'dd',	'no',	NULL,	'{"css":{".wrap_component":{"mixin":[".vertical",".line_top"],"style":{"width":"50%"}}}}',	'{"css": {".wrapper_component.edit": {"grid-column": "span 10"}}}',	'{"lg-cat": "URL", "lg-deu": "URL", "lg-ell": "URL", "lg-eng": "URL", "lg-fra": "URL", "lg-ita": "URL", "lg-spa": "URL"}'),
(15362314,	'dd1237',	'dd264',	'dd1231',	'no',	'si',	'si',	4,	'dd',	'no',	'[{"dd580":"dd903"}]',	NULL,	NULL,	'{"lg-spa": "example"}'),
(15362315,	'dd1170',	'dd264',	'dd1231',	'no',	'si',	'si',	5,	'dd',	'no',	'[{"dd580":"dd1205"}]',	NULL,	NULL,	'{"lg-spa": "example_dexcription"}'),
(15362316,	'dd528',	'rsc481',	'dd6',	'no',	'si',	'si',	8,	'dd',	'no',	'[{"dd626":"dd22"}]',	NULL,	'{"color": "#be6f82"}',	'{"lg-cat": "Tipologia de medidas", "lg-deu": "Typologie der Masseinheiten", "lg-eng": "Types of measures", "lg-fra": "Typologie des mesures", "lg-ita": "Tipologia di misure", "lg-spa": "Tipología de medidas"}'),
(15362317,	'dd637',	'dd623',	'dd8',	'no',	'si',	'si',	1,	'dd',	'no',	NULL,	NULL,	'{"css": {".content_data": {"grid-template-columns": "repeat(6, 1fr)"}}}',	'{"lg-deu": "Allgemein", "lg-eng": "General", "lg-fra": "Général", "lg-ita": "Generale", "lg-spa": "General"}'),
(15362318,	'dd631',	'dd623',	'dd177',	'no',	'si',	'si',	4,	'dd',	'no',	NULL,	NULL,	NULL,	'{"lg-cat": "Nou", "lg-deu": "Neu", "lg-eng": "New", "lg-fra": "Nouveau", "lg-ita": "Nuovo", "lg-spa": "New"}'),
(15362319,	'dd632',	'dd623',	'dd183',	'no',	'si',	'si',	5,	'dd',	'no',	NULL,	NULL,	NULL,	'{"lg-cat": "Esborrar", "lg-deu": "Löschen", "lg-eng": "Delete", "lg-fra": "Supprimer ", "lg-ita": "Cancellare", "lg-spa": "Delete"}'),
(15362320,	'dd882',	'rsc480',	'dd6',	'no',	'si',	'si',	3,	'dd',	'si',	'[{"dd626":"dd22"}]',	NULL,	'{"color": "#e4b387"}',	'{"lg-cat": "Professions", "lg-deu": "Berufe", "lg-ell": "επαγγέλματα", "lg-eng": "Professions", "lg-fra": "Professions", "lg-ita": "Professioni", "lg-spa": "Profesiones"}'),
(15362321,	'dd1534',	'dd1521',	'dd91',	'no',	'si',	'si',	2,	'dd',	'si',	'[{"dd530":"dd1522"},{"dd9":"dd1531"},{"dd43":"dd1530"},{"dd580":"dd1523"}]',	NULL,	NULL,	'{"lg-deu": "Liste", "lg-eng": "List", "lg-fra": "Liste", "lg-spa": "List"}'),
(15362322,	'dd623',	'dd1453',	'dd6',	'no',	'si',	'si',	4,	'dd',	'no',	'[{"dd626":"dd22"}]',	'',	'null',	'{"lg-cat": "Configuracions de recerques", "lg-deu": "Suchkonfiguration", "lg-eng": "Search presets", "lg-fra": "Paramètres de recherches", "lg-ita": "Configurazioni delle ricerche", "lg-spa": "Configuraciones de búsquedas"}'),
(15362323,	'dd1535',	'dd1521',	'dd8',	'no',	'si',	'si',	1,	'dd',	'no',	NULL,	NULL,	'{"css": {".content_data": {"grid-template-columns": "repeat(5, 1fr)"}}}',	'{"lg-deu": "Allgemein", "lg-eng": "General", "lg-fra": "Général", "lg-spa": "General"}'),
(15362324,	'dd1536',	'dd493',	'dd9',	'no',	'si',	'si',	2,	'dd',	'si',	NULL,	NULL,	NULL,	'{"lg-deu": "Akronym", "lg-eng": "Acronym", "lg-fra": "Acronyme", "lg-spa": "Acrónimo"}'),
(15362325,	'dd1239',	'dd1103',	'dd1231',	'no',	'si',	'si',	6,	'dd',	'no',	'[{"dd592":"dd1207"}]',	NULL,	NULL,	'{"lg-spa": "example"}'),
(15362326,	'dd71',	'dd154',	'dd10',	'no',	'si',	'si',	10,	'dd',	'si',	'',	'{"css":{".wrap_component":{"mixin":[".width_50",".vertical",".line_top"],"style":{}},".label":{"style":{}},".content_data":{"style":{}}}}',	'{"css": {".wrapper_component": {"grid-column": "span 10"}, ".wrapper_component > .content_data": {"min-height": "8rem"}}}',	'{"lg-cat": "Descripció", "lg-deu": "Beschreibung", "lg-ell": "περιγραφή", "lg-eng": "Description", "lg-fra": "Description", "lg-ita": "Descrizione", "lg-spa": "Descripción"}'),
(15362327,	'dd764',	'dd391',	'dd395',	'no',	'si',	'si',	42,	'dd',	'si',	'',	'{"name":"indexacion"}',	'{"name": "indexacion"}',	'{"lg-cat": "indexació", "lg-deu": "Indexierung", "lg-ell": "ευρετηρίαση", "lg-eng": "indexation", "lg-fra": "Indexation", "lg-ita": "Indicizzazione", "lg-spa": "indexación"}'),
(15362328,	'dd1001',	'dd1003',	'dd1747',	'no',	'si',	'si',	1,	'dd',	'no',	'',	'{
  "css": {
    ".wrap_component": {
      "mixin": [
        ".vertical",
        ".inverse"
      ],
      "style": {
        "width": "10%",
        "border-bottom-right-radius": "10px"
      }
    }
  }
}',	'{"css": {".wrap_component": {"mixin": [".vertical", ".inverse"], "style": {"width": "10%", "border-bottom-right-radius": "10px"}}}}',	'{"lg-cat": "Id", "lg-deu": "Id", "lg-ell": "Id", "lg-eng": "Id", "lg-fra": "Id", "lg-ita": "Id", "lg-spa": "Id"}'),
(15362329,	'dd905',	'dd867',	'dd91',	'no',	'si',	'si',	2,	'dd',	'no',	'[{"dd9":"dd871"},{"dd11":"dd872"},{"dd10":"dd897"}]',	NULL,	NULL,	'{"lg-deu": "Liste der Eigenschaften", "lg-eng": "Properties list", "lg-fra": "Liste des propriétés", "lg-ita": "Elenco delle proprietà", "lg-spa": "Lista de propiedades"}'),
(15362330,	'dd1010',	'dd1052',	'dd6',	'no',	'si',	'si',	2,	'dd',	'no',	'[{"dd626":"dd963"}]',	NULL,	NULL,	'{"lg-cat": "Serveis de publicació", "lg-deu": "Publikationsdienste", "lg-ell": "Υπηρεσίες εκδόσεων", "lg-eng": "Publication services", "lg-fra": "Services de publication", "lg-ita": "Servizi di pubblicazioni", "lg-spa": "Servicios de publicación"}'),
(15362331,	'dd481',	'dd627',	'dd626',	'no',	'si',	'si',	13,	'dd',	'no',	NULL,	'{
  "inverse_relations": false
}',	'{"inverse_relations": false}',	'{"lg-spa": "matrix_notes"}'),
(15362332,	'dd1720',	'dd627',	'dd626',	'no',	'si',	'si',	15,	'dd',	'no',	'',	'{
  "inverse_relations": false
}',	'{"inverse_relations": false}',	'{"lg-spa": "matrix_projects"}'),
(15362333,	'dd362',	'dd627',	'dd626',	'no',	'si',	'si',	20,	'dd',	'no',	NULL,	'{
  "inverse_relations": false
}',	'{"inverse_relations": false}',	'{"lg-spa": "matrix_resources"}'),
(15362334,	'dd525',	'dd1229',	NULL,	'si',	'si',	'si',	9,	'dd',	'si',	NULL,	NULL,	NULL,	'{"lg-spa": "field_decimal"}'),
(15362335,	'dd186',	'dd174',	'dd247',	'no',	'si',	'si',	2,	'dd',	'no',	NULL,	'',	NULL,	'{"lg-cat": "Projecte", "lg-deu": "Projekt", "lg-eng": "Filter", "lg-fra": "Projet", "lg-ita": "Progetto", "lg-spa": "Proyecto"}'),
(15362336,	'dd91',	'dd6',	'null',	'si',	'si',	'si',	12,	'dd',	'no',	'null',	'',	NULL,	'{"lg-spa": "section_list"}'),
(15362337,	'dd33',	'dd30',	'dd8',	'no',	'si',	'si',	1,	'dd',	'no',	'',	'',	NULL,	'{"lg-cat": "Maquetació", "lg-deu": "Layout", "lg-ell": "επιφάνεια εργασίας", "lg-eng": "Layout", "lg-fra": "Mise en page", "lg-ita": "Impaginazione", "lg-spa": "Maquetación"}'),
(15362338,	'dd1268',	'dd1266',	'dd91',	'no',	'si',	'si',	2,	'dd',	'no',	'[{"dd339":"dd1271"},{"dd9":"dd1288"},{"dd10":"dd1277"},{"dd318":"dd1280"}]',	NULL,	NULL,	'{"lg-deu": "Liste", "lg-eng": "New", "lg-fra": "liste", "lg-spa": "list"}'),
(15362339,	'dd1364',	'dd1631',	'dd1229',	'no',	'si',	'si',	4,	'dd',	'si',	'[{"dd6":"rsc332"}]',	NULL,	NULL,	'{"lg-spa": "bibliographic_references"}'),
(15362340,	'dd182',	'dd174',	'dd8',	'no',	'si',	'si',	1,	'dd',	'no',	NULL,	'',	NULL,	'{"lg-cat": "Procés general", "lg-deu": "Allgemeiner Prozess", "lg-eng": "General process", "lg-fra": "Procédures générales", "lg-ita": "Processo generale", "lg-spa": "Proceso general"}'),
(15362341,	'dd142',	'dd90',	'dd177',	'no',	'si',	'si',	4,	'dd',	'no',	NULL,	'',	NULL,	'{"lg-cat": "Nou", "lg-deu": "Neu", "lg-eng": "New", "lg-fra": "Nouveau", "lg-ita": "Nuovo", "lg-spa": "Nuevo"}'),
(15362342,	'dd731',	'dd391',	'dd395',	'no',	'si',	'si',	23,	'dd',	'si',	'',	'{"name":"version"}',	'{"name": "version"}',	'{"lg-cat": "Versió", "lg-deu": "Version", "lg-ell": "εκδοχή", "lg-eng": "Version", "lg-fra": "Version", "lg-ita": "Versione", "lg-nep": "संस्करण", "lg-spa": "Versión"}'),
(15362343,	'dd598',	'dd477',	'dd177',	'no',	'si',	'si',	4,	'dd',	'no',	NULL,	NULL,	NULL,	'{"lg-cat": "Nou", "lg-deu": "Neu", "lg-ell": "Νέα", "lg-eng": "New", "lg-fra": "Nouveau", "lg-ita": "Nuovo", "lg-nep": "नयाँ", "lg-spa": "Nuevo"}'),
(15362344,	'dd1269',	'dd622',	'dd1235',	'no',	'si',	'si',	32,	'dd',	'no',	'[{"dd66":"ww46"}]',	'{"varchar":128}',	NULL,	'{"lg-spa": "space"}'),
(15362345,	'dd1405',	'dd1404',	'dd91',	'no',	'si',	'si',	1,	'dd',	'si',	'[{"dd6":"rsc170"},{"dd749":"rsc29"}]',	'',	'null',	'{"lg-deu": "Liste", "lg-eng": "List", "lg-fra": "Liste", "lg-spa": "Listado"}'),
(15362346,	'dd189',	'dd174',	'dd91',	'no',	'si',	'si',	3,	'dd',	'no',	'[{"dd9":"dd185"}]',	'',	NULL,	'{"lg-cat": "Llistat", "lg-deu": "Liste", "lg-eng": "List", "lg-fra": "Liste", "lg-ita": "Elenco", "lg-spa": "Listado"}'),
(15362347,	'dd185',	'dd182',	'dd9',	'no',	'si',	'si',	1,	'dd',	'si',	NULL,	'',	NULL,	'{"lg-cat": "Process", "lg-deu": "Prozesse", "lg-eng": "Process", "lg-fra": "Processus", "lg-ita": "Processo", "lg-spa": "Proceso"}'),
(15362348,	'dd568',	'dd567',	'dd8',	'no',	'si',	'si',	1,	'dd',	'si',	'',	'',	NULL,	'{"lg-cat": "Valor de la llista", "lg-deu": "Wert aus der Liste", "lg-eng": "List value", "lg-fra": "Valeur de la liste", "lg-ita": "Valore della lista", "lg-spa": " Valor de la lista"}'),
(15362349,	'dd885',	'dd882',	'dd247',	'no',	'si',	'si',	2,	'dd',	'no',	'',	'',	NULL,	'{"lg-cat": "Projecte", "lg-deu": "Projekt", "lg-ell": "Έργο", "lg-eng": "Project", "lg-fra": "Projet", "lg-ita": "Progetto", "lg-spa": "Proyecto"}'),
(15362350,	'dd1208',	'dd15',	'dd19',	'no',	'si',	'si',	3,	'dd',	'si',	'[{"dd6":"rsc167"}]',	'',	NULL,	'{"lg-deu": "Audiovisuell", "lg-eng": "Audiovisual", "lg-fra": "Audiovisuel", "lg-spa": "Audiovisual"}'),
(15362351,	'dd393',	'dd382',	'dd9',	'no',	'si',	'si',	3,	'dd',	'si',	NULL,	'{"css":{".wrap_component":{"mixin":[".vertical"],"style":{"width":"40%"}}}}',	'{"css": {".wrapper_component": {"grid-column": "span 5"}}}',	'{"lg-cat": "Nom", "lg-deu": "Name", "lg-ell": "όνομα", "lg-eng": "Name", "lg-fra": "Prénom", "lg-ita": "Nome", "lg-spa": "Nombre"}'),
(15362352,	'dd842',	'dd839',	'dd247',	'no',	'si',	'si',	2,	'dd',	'no',	'',	'',	NULL,	'{"lg-cat": "Projecte", "lg-deu": "Projekt", "lg-eng": "Filter", "lg-fra": "Projet", "lg-ita": "Progetto", "lg-spa": "Proyecto"}'),
(15362353,	'dd206',	'dd303',	'null',	'si',	'si',	'si',	1,	'dd',	'no',	'',	'',	NULL,	'{"lg-spa": "relation_type"}'),
(15362354,	'dd397',	'dd390',	'dd395',	'no',	'si',	'si',	11,	'dd',	'si',	'',	'{"name":"volver"}',	'{"name": "volver"}',	'{"lg-cat": "Tornar", "lg-deu": "Zurück", "lg-ell": "απόδοση", "lg-eng": "Back", "lg-fra": "Retour", "lg-ita": "Ritornare", "lg-nep": "पछाडि", "lg-spa": "Volver"}'),
(15362355,	'dd1242',	'dd637',	'dd9',	'no',	'si',	'si',	3,	'dd',	'no',	NULL,	'{"css":{".wrap_component":{"mixin":[".vertical"],"style":{"width":"15%"}}}}',	NULL,	'{"lg-cat": "Tipo", "lg-deu": "Tipo", "lg-eng": "Tipo", "lg-fra": "Type", "lg-ita": "Tipo", "lg-spa": "Tipo"}'),
(15362356,	'dd411',	'dd409',	'dd9',	'no',	'si',	'si',	2,	'dd',	'si',	NULL,	NULL,	'{"css": {".wrapper_component": {"grid-column": "span 5"}}}',	'{"lg-cat": "Nom", "lg-deu": "Name", "lg-ell": "όνομα", "lg-eng": "Name", "lg-fra": "Prénom", "lg-ita": "Nome", "lg-spa": "Nombre"}'),
(15362357,	'dd429',	'dd440',	NULL,	'si',	'si',	'si',	41,	'dd',	'no',	NULL,	NULL,	NULL,	'{"lg-spa": "component_relation_parent"}'),
(15362358,	'dd352',	'dd440',	'null',	'si',	'si',	'si',	42,	'dd',	'no',	'',	'',	NULL,	'{"lg-spa": "component_relation_children"}'),
(15362359,	'dd431',	'dd440',	NULL,	'si',	'si',	'si',	43,	'dd',	'no',	NULL,	NULL,	NULL,	'{"lg-spa": "component_relation_related"}'),
(15362360,	'dd487',	'dd440',	NULL,	'si',	'si',	'si',	46,	'dd',	'no',	NULL,	NULL,	NULL,	'{"lg-spa": "component_inverse"}'),
(15362361,	'dd1323',	'dd770',	'dd4',	'no',	'si',	'si',	6,	'dd',	'no',	NULL,	NULL,	NULL,	'{"lg-deu": "Werkzeuge", "lg-eng": "Tools", "lg-fra": "Outils", "lg-spa": "Herramientas"}'),
(15362362,	'dd428',	'dd440',	NULL,	'si',	'si',	'si',	39,	'dd',	'no',	NULL,	NULL,	NULL,	'{"lg-spa": "component_relation_model"}'),
(15362363,	'dd247',	'dd440',	'null',	'si',	'si',	'si',	34,	'dd',	'no',	'',	'',	NULL,	'{"lg-spa": "component_filter"}'),
(15362364,	'dd406',	'dd381',	'dd247',	'no',	'si',	'si',	2,	'dd',	'no',	NULL,	NULL,	NULL,	'{"lg-cat": "Projecte", "lg-deu": "Projekt", "lg-ell": "Έργο", "lg-eng": "Project", "lg-fra": "Projet", "lg-ita": "Progetto", "lg-spa": "Proyecto"}'),
(15362365,	'dd1050',	'dd1020',	'dd177',	'no',	'si',	'si',	3,	'dd',	'no',	NULL,	NULL,	NULL,	'{"lg-cat": "Nou", "lg-deu": "Neu", "lg-ell": "Νέος", "lg-eng": "New", "lg-fra": "Nouveau", "lg-ita": "Nuovo", "lg-spa": "Nuevo"}'),
(15362366,	'dd249',	'dd1718',	'dd241',	'no',	'si',	'si',	1,	'dd',	'no',	'',	'',	NULL,	'{"lg-cat": "Àrea", "lg-deu": "Gebiet", "lg-ell": "έκταση", "lg-eng": "Area", "lg-fra": "Zone ", "lg-ita": "Area", "lg-spa": "Área"}'),
(15362367,	'dd55',	'dd30',	'dd177',	'no',	'si',	'si',	4,	'dd',	'no',	'',	'',	NULL,	'{"lg-cat": "Nou", "lg-deu": "Neu", "lg-ell": "νέος", "lg-eng": "New", "lg-fra": "Nouveau", "lg-ita": "Nuovo", "lg-spa": "Nuevo"}'),
(15362368,	'dd417',	'dd147',	'dd395',	'no',	'si',	'si',	9,	'dd',	'si',	NULL,	'{"name":"anyos"}',	'{"name": "years"}',	'{"lg-cat": "anys", "lg-deu": "Jahre", "lg-ell": "ετών", "lg-eng": "years", "lg-fra": "Années", "lg-ita": "Anni", "lg-nep": "वर्ष", "lg-spa": "años"}'),
(15362369,	'dd1075',	'dd63',	'dd1029',	'no',	'si',	'si',	6,	'dd',	'si',	'[{"dd247":"dd550"}]',	'',	NULL,	'{"lg-cat": "Projectes", "lg-deu": "Projekte", "lg-eng": "Projects", "lg-fra": "Projets", "lg-spa": "Proyectos"}'),
(15362370,	'dd59',	'dd17',	'null',	'si',	'si',	'si',	1,	'dd',	'no',	'',	'',	NULL,	'{"lg-spa": "diffusion_section_stats"}'),
(15362371,	'dd465',	'dd147',	'dd395',	'no',	'si',	'si',	27,	'dd',	'no',	'null',	'{"name":"provisional"}',	'{"name": "provisional"}',	'{"lg-cat": "Provisional", "lg-deu": "Vorläufig", "lg-ell": "Προσωρινό", "lg-eng": "Provisional", "lg-fra": "Provisoire", "lg-ita": "Provvisoria", "lg-spa": "Provisional"}'),
(15362372,	'dd163',	'dd440',	'null',	'si',	'si',	'si',	35,	'dd',	'no',	'',	'',	NULL,	'{"lg-spa": "component_filter_master"}'),
(15362373,	'dd479',	'dd440',	NULL,	'si',	'si',	'si',	45,	'dd',	'no',	NULL,	NULL,	NULL,	'{"lg-spa": "component_filter_records"}'),
(15362374,	'dd1703',	'dd1028',	NULL,	'si',	'si',	'si',	2,	'dd',	'no',	'',	'',	NULL,	'{"lg-spa": "stats_bar_horizontal"}'),
(15362375,	'dd1681',	'dd6',	'null',	'si',	'si',	'si',	24,	'dd',	'no',	'',	NULL,	NULL,	'{"lg-spa": "dd_grid"}'),
(15362376,	'dd745',	'dd391',	'dd395',	'no',	'si',	'si',	30,	'dd',	'si',	'',	'{"name":"cerrar"}',	'{"name": "cerrar"}',	'{"lg-cat": "Tancar", "lg-deu": "Schliessen", "lg-ell": "κοντά", "lg-eng": "Close", "lg-fra": "Fermer", "lg-ita": "Chiudere", "lg-nep": "बन्द गर्नुहोस्", "lg-spa": "Cerrar"}'),
(15362377,	'dd753',	'dd391',	'dd395',	'no',	'si',	'si',	34,	'dd',	'si',	'',	'{"name":"insertar"}',	'{"name": "insertar"}',	'{"lg-cat": "Insertar", "lg-deu": "Einfügen", "lg-ell": "εισάγετε", "lg-eng": "Insert", "lg-fra": "Insérer", "lg-ita": "Inserire", "lg-nep": "घुसाउनुहोस्", "lg-spa": "Insertar"}'),
(15362378,	'dd698',	'dd391',	'dd395',	'no',	'si',	'si',	94,	'dd',	'si',	'',	'{"name":"next"}',	'{"name": "next"}',	'{"lg-cat": "Següent", "lg-deu": "Folgend", "lg-ell": "ΕΠΟΜΕΝΟ", "lg-eng": "Next", "lg-fra": "Supprimer", "lg-ita": "Seguente", "lg-nep": "अर्को", "lg-spa": "Siguiente"}'),
(15362379,	'dd736',	'dd391',	'dd395',	'no',	'si',	'si',	26,	'dd',	'si',	'',	'{"name":"crear"}',	'{"name": "create"}',	'{"lg-cat": "Crear", "lg-deu": "Erstellen", "lg-ell": "δημιουργήσετε", "lg-eng": "Make", "lg-fra": "Créer", "lg-ita": "Creare", "lg-spa": "Crear"}'),
(15362380,	'dd697',	'dd692',	'dd395',	'no',	'si',	'si',	8,	'dd',	'si',	'',	'{"name":"salida"}',	'{"name": "salida"}',	'{"lg-cat": "Eixida", "lg-deu": "Logout", "lg-ell": "παραγωγή", "lg-eng": "Logout", "lg-fra": "Salida", "lg-ita": "Uscita", "lg-nep": "बाहिर निस्कनु", "lg-spa": "Salida"}'),
(15362381,	'dd1716',	'dd1707',	'dd1041',	'no',	'si',	'si',	3,	'dd',	'si',	'[{"dd9":"rsc23"}]',	'',	NULL,	'{"lg-deu": "Titel", "lg-eng": "Title", "lg-fra": "Titre", "lg-spa": "Título"}'),
(15362382,	'dd1316',	'dd1313',	'dd247',	'no',	'si',	'si',	2,	'dd',	'no',	'',	'',	NULL,	'{"lg-cat": "Projecte", "lg-deu": "Projekt", "lg-eng": "Filter", "lg-fra": "Projet", "lg-ita": "Progetto", "lg-spa": "Proyecto"}'),
(15362383,	'dd1196',	'dd1132',	'dd177',	'no',	'si',	'si',	3,	'dd',	'si',	'',	'',	NULL,	'{"lg-cat": "Nova Col·lecció / arxiu", "lg-deu": "Neue Sammlung / Archiv", "lg-ell": "νέος", "lg-eng": "New Collection / archive", "lg-fra": "Nouvelle collection / archive", "lg-ita": "Nuova Collezione / archivio", "lg-spa": "Nueva Colección / archivo"}'),
(15362384,	'dd368',	'dd365',	'dd91',	'no',	'si',	'si',	5,	'dd',	'no',	'[{"dd9":"dd367"}]',	NULL,	NULL,	'{"lg-cat": "Llistat", "lg-deu": "Liste", "lg-ell": "λίστα", "lg-eng": "List", "lg-fra": "Liste", "lg-ita": "Elenco", "lg-spa": "Listado"}'),
(15362385,	'dd369',	'dd365',	'dd177',	'no',	'si',	'si',	3,	'dd',	'no',	NULL,	NULL,	NULL,	'{"lg-cat": "Nou", "lg-deu": "Neu", "lg-ell": "νέος", "lg-eng": "New", "lg-fra": "Nouveau", "lg-ita": "Nuovo", "lg-spa": "Nuevo"}'),
(15362386,	'dd378',	'dd372',	'dd177',	'no',	'si',	'si',	3,	'dd',	'no',	NULL,	NULL,	NULL,	'{"lg-cat": "Nou", "lg-deu": "Neu", "lg-ell": "νέος", "lg-eng": "New", "lg-fra": "Nouveau", "lg-ita": "Nuovo", "lg-spa": "Nuevo"}'),
(15362387,	'dd416',	'dd408',	'dd247',	'no',	'si',	'si',	2,	'dd',	'no',	NULL,	NULL,	NULL,	'{"lg-cat": "Projecte", "lg-deu": "Projekt", "lg-ell": "Έργο", "lg-eng": "Project", "lg-fra": "Projet", "lg-ita": "Progetto", "lg-spa": "Proyecto"}'),
(15362388,	'dd415',	'dd408',	'dd183',	'no',	'si',	'si',	4,	'dd',	'no',	NULL,	NULL,	NULL,	'{"lg-cat": "Esborrar", "lg-deu": "Löschen", "lg-ell": "διαγράψετε", "lg-eng": "Delete", "lg-fra": "Supprimer", "lg-ita": "Cancellare", "lg-spa": "Borrar"}'),
(15362389,	'dd29',	'dd21',	'dd9',	'no',	'si',	'si',	2,	'dd',	'si',	'',	'',	NULL,	'{"lg-cat": "Nom", "lg-deu": "Name", "lg-ell": "όνομα", "lg-eng": "Name", "lg-fra": "Prénom", "lg-ita": "Nome", "lg-spa": "Nombre"}'),
(15362390,	'dd1070',	'dd63',	'dd1703',	'no',	'si',	'si',	1,	'dd',	'si',	'[{"dd633":"dd544"}]',	'"Empty"',	NULL,	'{"lg-cat": "Adreça IP", "lg-deu": "IP-Adresse", "lg-eng": "IP address", "lg-fra": "Adresse IP", "lg-spa": "Dirección IP"}'),
(15362391,	'dd836',	'dd833',	'dd247',	'no',	'si',	'si',	2,	'dd',	'no',	'',	'',	NULL,	'{"lg-cat": "Projecte", "lg-deu": "Projekt", "lg-eng": "Filter", "lg-fra": "Projet", "lg-ita": "Progetto", "lg-spa": "Proyecto"}'),
(15362392,	'dd587',	'dd1553',	'dd395',	'no',	'si',	'si',	8,	'dd',	'si',	'',	'{
  "name": "propagar_marcas"
}',	'{"name": "propagar_marcas"}',	'{"lg-cat": "Propagar marques", "lg-deu": "Zeichen verbreiten", "lg-ell": "διαδίδονται μάρκες", "lg-eng": "Propagate marks", "lg-fra": "Répartir les marques", "lg-ita": "Diffondere segnali", "lg-spa": "Propagar marcas"}'),
(15362393,	'dd1071',	'dd63',	'dd1029',	'no',	'si',	'si',	2,	'dd',	'si',	'[{"dd530":"dd543"}]',	'{
"key":"dd545",
"x":"dd543",
"y":"count"
}',	'{"x": "dd543", "y": "count", "key": "dd545"}',	'{"lg-cat": "Qui", "lg-deu": "Wer", "lg-eng": "Who", "lg-fra": "Qui", "lg-spa": "Quién"}'),
(15362394,	'dd1707',	'dd1706',	'dd31',	'no',	'si',	'si',	1,	'dd',	'si',	'',	'',	NULL,	'{"lg-deu": "Kopfzeile", "lg-eng": "Header", "lg-fra": "Entête", "lg-spa": "Cabecera"}'),
(15362395,	'dd392',	'dd386',	'null',	'si',	'si',	'si',	1,	'dd',	'no',	'',	'',	NULL,	'{"lg-spa": "label_group"}'),
(15362396,	'dd395',	'dd392',	'null',	'si',	'si',	'si',	1,	'dd',	'no',	'',	'',	NULL,	'{"lg-spa": "label"}'),
(15362397,	'dd891',	'dd890',	'dd9',	'no',	'si',	'si',	1,	'dd',	'si',	'',	'',	NULL,	'{"lg-cat": "Qualitat", "lg-deu": "Qualität", "lg-eng": "Quality", "lg-fra": "Qualité", "lg-ita": "Qualità", "lg-spa": "Calidad"}'),
(15362398,	'dd88',	'dd207',	'dd72',	'no',	'si',	'si',	8,	'dd',	'si',	'',	NULL,	NULL,	'{"lg-cat": "Manteniment", "lg-deu": "Wartung", "lg-ell": "Συντήρηση", "lg-eng": "Maintenance", "lg-fra": "Maintenance", "lg-ita": "Manutenzione", "lg-nep": "मर्मतसम्भार", "lg-spa": "Mantenimiento"}'),
(15362399,	'dd390',	'dd383',	'dd392',	'no',	'si',	'si',	3,	'dd',	'si',	'',	'',	NULL,	'{"lg-deu": "Buttons", "lg-eng": "Buttons", "lg-fra": "Boutons", "lg-ita": "Buttons", "lg-spa": "Buttons"}'),
(15362400,	'dd692',	'dd383',	'dd392',	'no',	'si',	'si',	5,	'dd',	'si',	'',	'',	NULL,	'{"lg-cat": "Activitat", "lg-deu": "Aktivität", "lg-eng": "Activity", "lg-fra": "Activité", "lg-ita": "Attività", "lg-spa": "Activity"}'),
(15362401,	'dd1056',	'dd1028',	'null',	'si',	'si',	'si',	1,	'dd',	'no',	'',	'',	NULL,	'{"lg-spa": "stats_bar"}'),
(15362402,	'dd341',	'dd117',	'null',	'si',	'si',	'si',	9,	'dd',	'no',	'',	'',	NULL,	'{"lg-spa": "area_root"}'),
(15362403,	'dd102',	'dd117',	NULL,	'si',	'si',	'si',	5,	'dd',	'no',	'',	'',	NULL,	'{"lg-spa": "area_activity"}'),
(15362404,	'dd699',	'dd692',	'dd395',	'no',	'si',	'si',	10,	'dd',	'si',	'',	'{"name":"busqueda"}',	'{"name": "search"}',	'{"lg-cat": "Cerca", "lg-deu": "Suche", "lg-ell": "αναζήτησή", "lg-eng": "Search", "lg-fra": "Recherche", "lg-ita": "Ricerca", "lg-nep": "खोज्नुहोस्", "lg-spa": "Búsqueda"}'),
(15362405,	'dd700',	'dd692',	'dd395',	'no',	'si',	'si',	11,	'dd',	'si',	'',	'{"name":"guardar"}',	'{"name": "guardar"}',	'{"lg-cat": "Guardar", "lg-deu": "speichern", "lg-ell": "αποθηκεύετε", "lg-eng": "Save", "lg-fra": "Sauvegarder ", "lg-ita": "Salvare", "lg-nep": "बचत गर्नुहोस्", "lg-spa": "Guardar"}'),
(15362406,	'dd1045',	'dd1125',	'dd395',	'no',	'si',	'si',	6,	'dd',	'si',	'null',	'{"name":"mapa_zoom"}',	'{"name": "zoom"}',	'{"lg-deu": "Zoom", "lg-ell": "ζουμ", "lg-eng": "Zoom", "lg-fra": "Zoom", "lg-ita": "Zoom", "lg-spa": "Zoom"}'),
(15362407,	'dd386',	'dd194',	'null',	'si',	'si',	'si',	1,	'dd',	'no',	'',	'',	NULL,	'{"lg-spa": "label_root"}'),
(15362408,	'dd945',	'dd942',	'dd91',	'no',	'si',	'si',	5,	'dd',	'si',	'[{"dd9":"dd944"}]',	NULL,	NULL,	'{"lg-cat": "Llistat d''associació / grup", "lg-deu": "Liste der Einträge", "lg-ell": "λίστα", "lg-eng": "List", "lg-fra": "Liste des enregistrements", "lg-ita": "Elenco dei registri", "lg-spa": "Listado de registros"}'),
(15362409,	'dd1231',	'dd1229',	'null',	'si',	'si',	'si',	2,	'dd',	'si',	'',	'',	NULL,	'{"lg-spa": "field_text"}'),
(15362410,	'dd866',	'dd861',	'dd177',	'no',	'si',	'si',	3,	'dd',	'si',	'',	'',	NULL,	'{"lg-cat": "Nou sexe", "lg-deu": "Neues Geschlecht", "lg-eng": "New Gender", "lg-fra": "Nouveau genre", "lg-ita": "Nuovo genere", "lg-spa": "Nuevo género"}'),
(15362411,	'dd1025',	'dd1259',	'null',	'si',	'si',	'si',	1,	'dd',	'no',	'',	NULL,	NULL,	'{"lg-spa": "database_alias"}'),
(15362412,	'dd1232',	'dd1229',	'null',	'si',	'si',	'si',	3,	'dd',	'si',	'',	'',	NULL,	'{"lg-spa": "field_mediumtext"}'),
(15362413,	'dd1233',	'dd1229',	'null',	'si',	'si',	'si',	4,	'dd',	'si',	'',	'',	NULL,	'{"lg-spa": "field_enum"}'),
(15362414,	'dd946',	'dd942',	'dd247',	'no',	'si',	'si',	2,	'dd',	'no',	'',	'',	NULL,	'{"lg-cat": "Projecte", "lg-deu": "Projekt", "lg-ell": "Έργο", "lg-eng": "Project", "lg-fra": "Projet", "lg-ita": "Progetto", "lg-spa": "Proyecto"}'),
(15362415,	'dd1235',	'dd1229',	'null',	'si',	'si',	'si',	6,	'dd',	'si',	'',	'',	NULL,	'{"lg-spa": "field_varchar"}'),
(15362416,	'dd711',	'dd709',	'null',	'si',	'si',	'si',	1,	'dd',	'si',	'',	'',	NULL,	'{"lg-spa": "tab"}'),
(15362417,	'dd70',	'dd60',	'dd6',	'no',	'si',	'si',	1,	'dd',	'si',	'[{"dd626":"dd46"}]',	'',	NULL,	'{"lg-deu": "Statistiken pro Sektion", "lg-eng": "Statistics by section", "lg-fra": "Statistiques par section", "lg-spa": "Estadísticas por sección"}'),
(15362418,	'dd912',	'dd911',	'dd8',	'no',	'si',	'si',	1,	'dd',	'no',	'',	'',	'null',	'{"lg-deu": "Identifizierung", "lg-eng": "Identification", "lg-fra": "Identification", "lg-spa": "Identificación"}'),
(15362419,	'dd383',	'dd193',	'dd386',	'no',	'si',	'si',	5,	'dd',	'si',	'',	'',	NULL,	'{"lg-deu": "Labels", "lg-eng": "Labels", "lg-fra": "Labels", "lg-ita": "Etichette", "lg-spa": "Labels"}'),
(15362420,	'dd27',	'dd20',	'dd177',	'no',	'si',	'si',	4,	'dd',	'no',	'',	'',	NULL,	'{"lg-cat": "Nou", "lg-deu": "Neu", "lg-ell": "νέος", "lg-eng": "New", "lg-fra": "Nouveau", "lg-ita": "Nuovo", "lg-spa": "Nuevo"}'),
(15362421,	'dd67',	'dd33',	'dd9',	'no',	'si',	'si',	1,	'dd',	'no',	'null',	'',	NULL,	'{"lg-deu": "Sektion", "lg-ell": "τμήμα", "lg-eng": "Section", "lg-fra": "Section", "lg-ita": "Sezione", "lg-spa": "Sección"}'),
(15362422,	'dd391',	'dd383',	'dd392',	'no',	'si',	'si',	4,	'dd',	'si',	'',	'',	NULL,	'{"lg-cat": "Navigació", "lg-deu": "Navigation", "lg-eng": "Navigation", "lg-fra": "Navigation", "lg-ita": "Navigazione", "lg-spa": "Navigation"}'),
(15362423,	'dd864',	'dd861',	'dd247',	'no',	'si',	'si',	2,	'dd',	'no',	'',	'',	NULL,	'{"lg-cat": "Projecte", "lg-deu": "Projekt", "lg-eng": "Filter", "lg-fra": "Projet", "lg-ita": "Progetto", "lg-spa": "Proyecto"}'),
(15362424,	'dd543',	'dd548',	'dd530',	'no',	'si',	'si',	2,	'dd',	'no',	'[{"dd6":"dd128"},{"dd9":"dd132"}]',	NULL,	'{"show_interface": {"tools": false, "read_only": true}}',	'{"lg-cat": "Qui", "lg-deu": "Wer", "lg-ell": "που", "lg-eng": "Who", "lg-fra": "Qui", "lg-ita": "Chi", "lg-spa": "Quién"}'),
(15362425,	'dd166',	'dd391',	'dd395',	'no',	'si',	'si',	5,	'dd',	'si',	'',	'{"name":"registros_modificados"}',	'{"name": "registros_modificados"}',	'{"lg-cat": "Registres modificats", "lg-deu": "Modifizierte Einträge", "lg-ell": "τροποποιημένα αρχεία", "lg-eng": "Modified records", "lg-fra": "Enregistrements modifiés", "lg-ita": "Registri modificati", "lg-nep": "परिमार्जित अभिलेखहरू", "lg-spa": "Registros modificados"}'),
(15362426,	'dd262',	'dd230',	'null',	'si',	'si',	'si',	1,	'dd',	'no',	'',	'',	NULL,	'{"lg-spa": "button_login"}'),
(15362427,	'dd899',	'dd898',	'dd8',	'no',	'si',	'si',	1,	'dd',	'no',	'',	NULL,	'{"css": {".content_data": {"grid-template-columns": "repeat(10, 1fr)"}}}',	'{"lg-cat": "Valor de la llista", "lg-deu": "Wert aus der Liste", "lg-ell": "αναγνώριση", "lg-eng": "Place of capture", "lg-fra": "Valeur de la liste", "lg-ita": "Valore della lista", "lg-spa": "Valor de la lista"}'),
(15362428,	'dd926',	'dd922',	'dd247',	'no',	'si',	'si',	2,	'dd',	'no',	'',	'',	NULL,	'{"lg-cat": "Projecte", "lg-deu": "Projekt", "lg-ell": "Έργο", "lg-eng": "Project", "lg-fra": "Projet", "lg-ita": "Progetto", "lg-spa": "Proyecto"}'),
(15362429,	'dd1702',	'dd539',	'dd395',	'no',	'si',	'si',	12,	'dd',	'si',	'',	'{
  "name": "tool_import_images"
}',	'{"name": "tool_import_images"}',	'{"lg-cat": "Importar imatges", "lg-deu": "Bilder importieren", "lg-ell": "εισαγωγή εικόνων", "lg-eng": "import images", "lg-fra": "Importer des images", "lg-ita": "Importare immagini", "lg-spa": "Importar imágenes"}'),
(15362430,	'dd147',	'dd383',	'dd392',	'no',	'si',	'si',	2,	'dd',	'si',	'',	'',	NULL,	'{"lg-deu": "Komponenten", "lg-eng": "Components", "lg-fra": "Composantes", "lg-ita": "Componenti", "lg-spa": "Componentes"}'),
(15362431,	'dd260',	'dd37',	'null',	'si',	'si',	'si',	1,	'dd',	'no',	'',	NULL,	NULL,	'{"lg-spa": "external_ontology"}'),
(15362432,	'dd844',	'dd839',	'dd177',	'no',	'si',	'si',	4,	'dd',	'si',	'',	'',	NULL,	'{"lg-cat": "Nou estat de la còpia DVD", "lg-deu": "Neuer Zustand der DVD-Kopie", "lg-eng": "New DVD copy", "lg-fra": "Nouveau statut pour la copie de DVD", "lg-ita": "Nuovo stato della copia DVD", "lg-spa": "Nuevo estado de la copia DVD"}'),
(15362433,	'dd977',	'dd976',	'dd8',	'no',	'si',	'si',	1,	'dd',	'si',	'',	'',	NULL,	'{"lg-cat": "Valor de la llista", "lg-deu": "Wert aus der Liste", "lg-eng": "List value", "lg-fra": "Valeur de la liste", "lg-ita": "Valore della lista", "lg-spa": "Valor de la lista"}'),
(15362434,	'dd308',	'dd2',	'null',	'si',	'si',	'no',	7,	'dd',	'no',	'',	NULL,	NULL,	'{"lg-spa": "utils"}'),
(15362435,	'dd194',	'dd2',	'null',	'si',	'si',	'si',	2,	'dd',	'no',	'',	'',	NULL,	'{"lg-spa": "tools"}'),
(15362436,	'dd302',	'dd308',	'null',	'si',	'si',	'no',	1,	'dd',	'no',	'',	NULL,	NULL,	'{"lg-spa": "widget"}'),
(15362437,	'dd982',	'dd957',	'dd247',	'no',	'si',	'si',	2,	'dd',	'no',	'',	'',	NULL,	'{"lg-cat": "Projecte", "lg-deu": "Projekt", "lg-eng": "Filter", "lg-fra": "Projet", "lg-ita": "Progetto", "lg-spa": "Proyecto"}'),
(15362438,	'dd986',	'dd985',	'dd8',	'no',	'si',	'si',	1,	'dd',	'no',	'',	'',	NULL,	'{"lg-cat": "Valor de la llista", "lg-deu": "Wert aus der Liste", "lg-eng": "List value", "lg-fra": "Valeur de la liste", "lg-ita": "Valore della lista", "lg-spa": "Valor de la lista"}'),
(15362439,	'dd145',	'dd540',	'dd395',	'no',	'si',	'si',	2,	'dd',	'si',	'',	'{"name":"ahora"}',	'{"name": "now"}',	'{"lg-cat": "Ara", "lg-deu": "Jetzt", "lg-ell": "τώρα", "lg-eng": "Now", "lg-fra": "Maintenant", "lg-ita": "Adesso", "lg-nep": "अब", "lg-spa": "Ahora"}'),
(15362440,	'dd538',	'dd785',	'dd392',	'no',	'si',	'si',	30,	'dd',	'si',	NULL,	NULL,	NULL,	'{"lg-deu": "Dateiimport", "lg-eng": "File import", "lg-fra": "Importation de fichiers", "lg-ita": "Importazione dei files", "lg-spa": "Importación de ficheros"}'),
(15362441,	'dd175',	'dd391',	'dd395',	'no',	'si',	'si',	10,	'dd',	'si',	'',	'{"name":"directorio_de_destino"}',	'{"name": "directorio_de_destino"}',	'{"lg-cat": "Directori de destí", "lg-deu": "Zielverzeichnis", "lg-ell": "Κατάλογο προορισμού", "lg-eng": "Target directory", "lg-fra": "Destination Annuaire", "lg-ita": "Cartella di destinazione", "lg-nep": "लक्ष्य निर्देशिका", "lg-spa": "Directorio de destino"}'),
(15362442,	'dd730',	'dd391',	'dd395',	'no',	'si',	'si',	22,	'dd',	'si',	'',	'{"name":"generar"}',	'{"name": "build"}',	'{"lg-cat": "Generar", "lg-deu": "Erstellen", "lg-ell": "παράγουν", "lg-eng": "Build", "lg-fra": "Générer", "lg-ita": "Generale", "lg-nep": "निर्माण गर्नुहोस्", "lg-spa": "Generar"}'),
(15362443,	'dd521',	'dd391',	'dd395',	'no',	'si',	'si',	70,	'dd',	'si',	'',	'{"name":"fragmento"}',	'{"name": "fragment"}',	'{"lg-cat": "fragment", "lg-deu": "Fragment, Auszug", "lg-ell": "τεμάχιο", "lg-eng": "fragment", "lg-fra": "fragment", "lg-ita": "Frammento", "lg-nep": "टुक्रा", "lg-spa": "fragmento"}'),
(15362444,	'dd172',	'dd391',	'dd395',	'no',	'si',	'si',	7,	'dd',	'si',	'',	'{"name":"que"}',	'{"name": "que"}',	'{"lg-cat": "Què", "lg-deu": "Was", "lg-ell": "τι", "lg-eng": "What", "lg-fra": "Quoi", "lg-ita": "Che cosa", "lg-nep": "के", "lg-spa": "Qué"}'),
(15362445,	'dd1119',	'dd1118',	'dd9',	'no',	'si',	'si',	1,	'dd',	'si',	'',	'',	NULL,	'{"lg-cat": "Tipologia recurs", "lg-deu": "Typologie Ressource", "lg-eng": "Resource typology", "lg-fra": "Typologie de ressources", "lg-ita": "Tipologia risorsa", "lg-spa": "Tipología recurso"}'),
(15362446,	'dd1074',	'dd63',	'dd1056',	'no',	'si',	'si',	5,	'dd',	'si',	'[{"dd635":"dd547"}]',	'',	NULL,	'{"lg-cat": "Quan", "lg-deu": "Wann", "lg-eng": "When", "lg-fra": "Quand ", "lg-spa": "Cuándo"}'),
(15362447,	'dd958',	'dd957',	'dd8',	'no',	'si',	'si',	1,	'dd',	'si',	'',	'',	NULL,	'{"lg-cat": "Valor de la llista", "lg-deu": "Wert aus der Liste", "lg-eng": "List value", "lg-fra": "Valeur de la liste", "lg-ita": "Valore della lista", "lg-spa": "Valor de la lista"}'),
(15362448,	'dd888',	'dd882',	'dd177',	'no',	'si',	'si',	3,	'dd',	'si',	'',	'',	NULL,	'{"lg-cat": "Nou", "lg-deu": "Neu", "lg-ell": "νέος", "lg-eng": "New Profession", "lg-fra": "Nouveau", "lg-ita": "Nuovo", "lg-spa": "Nuevo"}'),
(15362449,	'dd1117',	'dd137',	'dd6',	'no',	'si',	'si',	20,	'dd',	'si',	'[{"dd626":"dd963"}]',	'',	NULL,	'{"lg-cat": "Tipologia recurs", "lg-deu": "Typologie Ressource", "lg-eng": "Resource typology", "lg-fra": "Typologie de ressources", "lg-ita": "Tipologia risorsa", "lg-spa": "Tipología recurso"}'),
(15362450,	'dd266',	'dd1318',	'dd8',	'no',	'si',	'si',	6,	'dd',	'no',	'',	'',	NULL,	'{"lg-cat": "Relacions", "lg-deu": "Beziehungen", "lg-ell": "σχέσεις", "lg-eng": "Relations", "lg-fra": "Relations", "lg-ita": "Relazioni", "lg-spa": "Relaciones"}'),
(15362451,	'dd1713',	'dd1125',	'dd395',	'no',	'si',	'si',	5,	'dd',	'si',	'',	'{"name":"mapa"}',	'{"name": "mapa"}',	'{"lg-cat": "Mapa", "lg-deu": "Karte", "lg-ell": "χάρτης", "lg-eng": "Map", "lg-fra": "Carte ", "lg-ita": "Mappa", "lg-spa": "Mapa"}'),
(15362452,	'dd841',	'dd840',	'dd9',	'no',	'si',	'si',	1,	'dd',	'si',	'',	'',	NULL,	'{"lg-cat": "No realitzada / Realitzada / Lliurada", "lg-deu": "Nicht realisiert/überreicht", "lg-eng": "DVD copy", "lg-fra": "Pas fait/Donné/Délivré", "lg-ita": "Non realizzata / realizzata / consegnata", "lg-spa": "No realizada/Realizada/Entregada"}'),
(15362453,	'dd1209',	'dd1208',	'dd31',	'no',	'si',	'si',	1,	'dd',	'si',	'',	'',	NULL,	'{"lg-deu": "Kopfzeile", "lg-eng": "Header", "lg-fra": "Entête", "lg-spa": "Cabecera"}'),
(15362454,	'dd965',	'dd1313',	'dd183',	'no',	'si',	'si',	4,	'dd',	'si',	'',	'',	NULL,	'{"lg-cat": "Esborrar", "lg-deu": "Löschen", "lg-eng": "Delete", "lg-fra": "Supprimer", "lg-ita": "Cancellare", "lg-spa": "Borrar"}'),
(15362455,	'dd960',	'dd957',	'dd91',	'no',	'si',	'si',	3,	'dd',	'si',	'[{"dd9":"dd959"}]',	'',	NULL,	'{"lg-cat": "Llistat de registres", "lg-deu": "Liste der Einträge", "lg-eng": "Record listing", "lg-fra": "Liste des enregistrements", "lg-ita": "Elenco dei registri", "lg-spa": "Listado de registros"}'),
(15362456,	'dd979',	'dd976',	'dd91',	'no',	'si',	'si',	3,	'dd',	'no',	'[{"dd9":"dd978"}]',	'',	NULL,	'{"lg-cat": "Llistat de registres", "lg-deu": "Liste der Einträge", "lg-eng": "Record listing", "lg-fra": "Liste des enregistrements", "lg-ita": "Elenco dei registri", "lg-spa": "Listado de registros"}'),
(15362457,	'dd890',	'dd889',	'dd8',	'no',	'si',	'si',	1,	'dd',	'no',	'',	'',	NULL,	'{"lg-cat": "Valor de la llista", "lg-deu": "Wert aus der Liste", "lg-eng": "Quality of content", "lg-fra": "Valeur de la liste", "lg-ita": "Valore della lista", "lg-spa": "Valor de la lista"}'),
(15362458,	'dd815',	'dd810',	'dd247',	'no',	'si',	'si',	2,	'dd',	'no',	'',	'',	NULL,	'{"lg-cat": "Projecte", "lg-deu": "Projekt", "lg-eng": "Filter", "lg-fra": "Projet", "lg-ita": "Progetto", "lg-spa": "Proyecto"}'),
(15362459,	'dd136',	'dd42',	'dd8',	'no',	'si',	'si',	1,	'dd',	'si',	'',	'',	NULL,	'{"lg-cat": "Àrees", "lg-deu": "Wert aus der Liste", "lg-eng": "Areas", "lg-fra": "Valeur de la liste", "lg-ita": "Aree", "lg-spa": "Valor de la lista"}'),
(15362460,	'dd1072',	'dd63',	'dd1056',	'no',	'si',	'si',	3,	'dd',	'si',	'[{"dd634":"dd545"}]',	'',	NULL,	'{"lg-cat": "Què", "lg-deu": "Was", "lg-eng": "What", "lg-fra": "Quoi", "lg-spa": "Qué"}'),
(15362461,	'dd83',	'dd502',	'dd43',	'no',	'si',	'si',	2,	'dd',	'no',	'null',	'',	NULL,	'{"lg-cat": "Valor %", "lg-deu": "Wert %", "lg-ell": "Αξία %", "lg-eng": "Value %", "lg-fra": "Valeur %", "lg-ita": "Valore %", "lg-spa": "Valor %"}'),
(15362462,	'dd1028',	'dd6',	'null',	'si',	'si',	'si',	18,	'dd',	'no',	'',	'',	NULL,	'{"lg-spa": "component_stats"}'),
(15362463,	'dd776',	'dd391',	'dd395',	'no',	'si',	'si',	13,	'dd',	'si',	'',	'{"name":"seccion"}',	'{"name": "section"}',	'{"lg-cat": "secció", "lg-deu": "Sektion", "lg-ell": "τμήμα", "lg-eng": "section", "lg-fra": "Section", "lg-ita": "Sezione", "lg-nep": "खण्ड", "lg-spa": "sección"}'),
(15362464,	'dd105',	'dd391',	'dd395',	'no',	'si',	'si',	4,	'dd',	'si',	'',	'{"name":"modificado"}',	'{"name": "modified"}',	'{"lg-cat": "modificat", "lg-deu": "modifiziert", "lg-ell": "τροποποιημένα", "lg-eng": "modified", "lg-fra": "modifié", "lg-ita": "Modificato", "lg-nep": "परिमार्जित", "lg-spa": "modificado"}'),
(15362465,	'dd294',	'dd292',	'dd247',	'no',	'si',	'si',	2,	'dd',	'no',	NULL,	'',	NULL,	'{"lg-cat": "Projecte", "lg-deu": "Projekt", "lg-eng": "Project", "lg-fra": "Projet", "lg-ita": "Progetto", "lg-spa": "Proyecto"}'),
(15362466,	'dd295',	'dd292',	'dd91',	'no',	'si',	'si',	3,	'dd',	'si',	'[{"dd9":"dd296"}]',	'',	NULL,	'{"lg-cat": "Llistat", "lg-deu": "Liste", "lg-eng": "Llist", "lg-fra": "Liste", "lg-ita": "Elenco", "lg-spa": "Listado"}'),
(15362467,	'dd913',	'dd911',	'dd247',	'no',	'si',	'si',	2,	'dd',	'no',	'',	'',	NULL,	'{"lg-cat": "Projecte", "lg-deu": "Projekt", "lg-eng": "Project", "lg-fra": "Projet", "lg-ita": "Progetto", "lg-spa": "Proyecto"}'),
(15362468,	'dd914',	'dd912',	'dd9',	'no',	'si',	'si',	1,	'dd',	'no',	'',	'',	'null',	'{"lg-deu": "Wert", "lg-eng": "Value", "lg-fra": "Valeur", "lg-spa": "Value"}'),
(15362469,	'dd1214',	'dd1209',	'dd1041',	'no',	'si',	'si',	3,	'dd',	'si',	'[{"dd9":"dd967"}]',	'',	NULL,	'{"lg-deu": "Titel", "lg-eng": "Title", "lg-fra": "Titre", "lg-spa": "Título"}'),
(15362470,	'dd1215',	'dd1209',	'dd1041',	'no',	'si',	'si',	5,	'dd',	'si',	'[{"dd247":"dd364"}]',	'',	NULL,	'{"lg-deu": "Projekt", "lg-eng": "Projects", "lg-fra": "Projet", "lg-spa": "Proyecto"}'),
(15362471,	'dd301',	'dd299',	'dd247',	'no',	'si',	'si',	2,	'dd',	'no',	NULL,	NULL,	NULL,	'{"lg-cat": "Projecte", "lg-deu": "Projekt", "lg-eng": "Project", "lg-fra": "Projet", "lg-ita": "Progetto", "lg-spa": "Proyecto"}'),
(15362472,	'dd309',	'dd307',	'dd8',	'no',	'si',	'si',	1,	'dd',	'no',	NULL,	NULL,	NULL,	'{"lg-cat": "Espai de color", "lg-deu": "Farbbereich", "lg-eng": "Color space", "lg-fra": "Espace couleur", "lg-ita": "Spazio del Colore", "lg-spa": "Espacio de color"}'),
(15362473,	'dd1017',	'dd440',	'null',	'si',	'si',	'si',	12,	'dd',	'si',	'',	'',	NULL,	'{"lg-spa": "component_input_text_large"}'),
(15362474,	'dd363',	'dd137',	'dd6',	'no',	'si',	'si',	3,	'dd',	'no',	'[{"dd626":"dd963"}]',	NULL,	NULL,	'{"lg-cat": "Positiu / Negatiu", "lg-deu": "Positiv / Negativ", "lg-eng": "Positive / Negative", "lg-fra": "Positif / Négatif", "lg-spa": "Positivo / Negativo"}'),
(15362475,	'dd438',	'dd440',	'null',	'si',	'si',	'si',	19,	'dd',	'no',	'',	'',	NULL,	'{"lg-spa": "component_layout"}'),
(15362476,	'dd80',	'dd440',	'null',	'si',	'si',	'si',	27,	'dd',	'no',	'',	'',	NULL,	'{"lg-spa": "component_check_box"}'),
(15362477,	'dd311',	'dd307',	'dd247',	'no',	'si',	'si',	2,	'dd',	'no',	NULL,	NULL,	NULL,	'{"lg-cat": "Projecte", "lg-deu": "Projekt", "lg-eng": "Project", "lg-fra": "Projet", "lg-ita": "Progetto", "lg-spa": "Proyecto"}'),
(15362478,	'dd313',	'dd299',	'dd177',	'no',	'si',	'si',	4,	'dd',	'no',	NULL,	NULL,	NULL,	'{"lg-cat": "Nou", "lg-deu": "Neu", "lg-eng": "New", "lg-fra": "Nouveau", "lg-ita": "Nuovo", "lg-spa": "Nuevo"}'),
(15362479,	'dd840',	'dd839',	'dd8',	'no',	'si',	'si',	1,	'dd',	'si',	'',	'',	NULL,	'{"lg-cat": "Valor de la llista", "lg-deu": "Wert aus der Liste", "lg-eng": "DVD copy", "lg-fra": "Valeur de la liste", "lg-ita": "Valore della lista", "lg-spa": "Valor de la lista"}'),
(15362480,	'dd1121',	'dd1117',	'dd247',	'no',	'si',	'si',	2,	'dd',	'no',	'',	'',	NULL,	'{"lg-cat": "Projecte", "lg-deu": "Projekt", "lg-eng": "Filter", "lg-fra": "Projet", "lg-ita": "Progetto", "lg-spa": "Proyecto"}'),
(15362481,	'dd878',	'dd875',	'dd91',	'no',	'si',	'si',	5,	'dd',	'si',	'[{"dd9":"dd876"}]',	'',	NULL,	'{"lg-cat": "Llistat", "lg-deu": "Liste", "lg-eng": "List", "lg-fra": "Liste", "lg-ita": "Elenco", "lg-spa": "Listado"}'),
(15362482,	'dd257',	'dd229',	'dd227',	'no',	'si',	'si',	3,	'dd',	'no',	'[{"dd227":"dd134"}]',	'',	NULL,	'{"lg-cat": "email", "lg-deu": "E-Mail", "lg-ell": "Email", "lg-eng": "Email", "lg-fra": "Email", "lg-ita": "Email", "lg-nep": "इमेल", "lg-spa": "Email"}'),
(15362483,	'dd1029',	'dd1028',	'null',	'si',	'si',	'si',	4,	'dd',	'no',	'',	'',	NULL,	'{"lg-spa": "stats_pie"}'),
(15362484,	'dd410',	'dd64',	'dd247',	'no',	'si',	'si',	2,	'dd',	'no',	'',	'',	NULL,	'{"lg-cat": "Projecte", "lg-deu": "Projekt", "lg-eng": "Project", "lg-fra": "Projet", "lg-ita": "Progetto", "lg-nep": "परियोजना", "lg-spa": "Proyecto"}'),
(15362485,	'dd19',	'dd17',	'null',	'si',	'si',	'si',	2,	'dd',	'si',	'',	'',	NULL,	'{"lg-spa": "diffusion_section"}'),
(15362486,	'dd1743',	'dd17',	NULL,	'si',	'si',	'si',	4,	'dd',	'no',	NULL,	'',	NULL,	'{"lg-spa": "diffusion_element"}'),
(15362487,	'dd524',	'dd17',	'null',	'si',	'si',	'si',	5,	'dd',	'no',	'',	NULL,	NULL,	'{"lg-spa": "diffusion_element_alias"}'),
(15362488,	'dd757',	'dd391',	'dd395',	'no',	'si',	'si',	38,	'dd',	'si',	'',	'{"name":"herramienta"}',	'{"name": "herramienta"}',	'{"lg-cat": "Eina", "lg-deu": "Werkzeug", "lg-ell": "εργαλείο", "lg-eng": "Tool", "lg-fra": "Outil", "lg-ita": "Strumento", "lg-nep": "उपकरण", "lg-spa": "Herramienta"}'),
(15362489,	'dd759',	'dd391',	'dd395',	'no',	'si',	'si',	40,	'dd',	'si',	'',	'{"name":"rotar"}',	'{"name": "rotate"}',	'{"lg-cat": "Girar", "lg-deu": "Drehen", "lg-ell": "περιστρέψτε", "lg-eng": "Rotate", "lg-fra": "Rotation", "lg-ita": "Ruotare", "lg-spa": "Rotar"}'),
(15362490,	'dd775',	'dd391',	'dd395',	'no',	'si',	'si',	45,	'dd',	'si',	'',	'{"name":"etiqueta"}',	'{"name": "tag"}',	'{"lg-cat": "etiqueta", "lg-deu": "Label", "lg-ell": "επιγραφή", "lg-eng": "tag", "lg-fra": "libellé", "lg-ita": "Etichetta", "lg-spa": "etiqueta"}'),
(15362491,	'dd827',	'dd391',	'dd395',	'no',	'si',	'si',	52,	'dd',	'si',	'',	'{"name":"recurso"}',	'{"name": "recurso"}',	'{"lg-cat": "recurs", "lg-deu": "Ressource", "lg-ell": "πόρος", "lg-eng": "resource", "lg-fra": "ressource", "lg-ita": "Risorsa", "lg-spa": "recurso"}'),
(15362492,	'dd755',	'dd391',	'dd395',	'no',	'si',	'si',	36,	'dd',	'si',	'',	'{"name":"tecla"}',	'{"name": "tecla"}',	'{"lg-cat": "Tecla", "lg-deu": "Taste", "lg-ell": "κλειδί", "lg-eng": "keyboard key", "lg-fra": "Touche", "lg-ita": "Tastiera", "lg-nep": "किबोर्ड कुञ्जी", "lg-spa": "Tecla"}'),
(15362493,	'dd1090',	'dd692',	'dd395',	'no',	'si',	'si',	14,	'dd',	'si',	'',	'{"name":"carga"}',	'{"name": "carga"}',	'{"lg-cat": "Càrrega", "lg-deu": "Hochladen", "lg-ell": "φορτίο", "lg-eng": "Upload", "lg-fra": "Téléchargement", "lg-ita": "Caricamento", "lg-nep": "अपलोड गर्नुहोस्", "lg-spa": "Carga"}'),
(15362494,	'dd1251',	'dd381',	'dd58',	'no',	'si',	'si',	6,	'dd',	'no',	'[{"dd9":"dd385"},{"dd9":"dd393"}]',	NULL,	NULL,	'{"lg-cat": "Llistat de relacions", "lg-deu": "Liste der Beziehungen", "lg-eng": "Relation list", "lg-fra": "Liste de relations", "lg-ita": "Elenco relazioni", "lg-spa": "Listado de relaciones"}'),
(15362495,	'dd1229',	'dd1259',	NULL,	'si',	'si',	'si',	2,	'dd',	'no',	'',	'',	NULL,	'{"lg-spa": "table"}'),
(15362496,	'dd248',	'dd245',	NULL,	'si',	'si',	'si',	2,	'dd',	'si',	NULL,	NULL,	NULL,	'{"lg-spa": "rdf:subject"}'),
(15362497,	'dd246',	'dd245',	NULL,	'si',	'si',	'si',	1,	'dd',	'si',	NULL,	'',	NULL,	'{"lg-spa": "rdf:predicate"}'),
(15362498,	'dd233',	'dd251',	NULL,	'si',	'si',	'si',	3,	'dd',	'si',	NULL,	NULL,	NULL,	'{"lg-spa": "xml"}'),
(15362499,	'dd258',	'dd251',	NULL,	'si',	'si',	'si',	2,	'dd',	'si',	NULL,	'',	NULL,	'{"lg-spa": "body"}'),
(15362500,	'dd253',	'dd251',	NULL,	'si',	'si',	'si',	1,	'dd',	'si',	NULL,	'',	NULL,	'{"lg-spa": "head"}'),
(15362501,	'dd10',	'dd440',	'null',	'si',	'si',	'si',	29,	'dd',	'no',	'',	'',	NULL,	'{"lg-spa": "component_text_area"}'),
(15362502,	'dd709',	'dd6',	'null',	'si',	'si',	'si',	5,	'dd',	'si',	'',	'',	NULL,	'{"lg-spa": "section_tab"}'),
(15362503,	'dd143',	'dd6',	'null',	'si',	'si',	'si',	16,	'dd',	'no',	'',	'',	NULL,	'{"lg-spa": "section_group_div"}'),
(15362504,	'dd1129',	'dd6',	'null',	'si',	'si',	'si',	4,	'dd',	'si',	'',	'',	NULL,	'{"lg-spa": "exclude_elements"}'),
(15362505,	'dd235',	'dd234',	'dd177',	'no',	'si',	'si',	4,	'dd',	'si',	'',	NULL,	NULL,	'{"lg-cat": "Nou", "lg-deu": "Neues", "lg-ell": "νέο", "lg-eng": "New", "lg-fra": "Nouveau", "lg-ita": "Nuovo", "lg-spa": "Nuevo"}'),
(15362506,	'dd272',	'dd234',	'dd8',	'no',	'si',	'si',	3,	'dd',	'no',	NULL,	NULL,	NULL,	'{"lg-cat": "Permisos d''eines", "lg-deu": "Werkzeugbewilligungen", "lg-ell": "Δικαιώματα εργαλείου", "lg-eng": "Tool permissions", "lg-fra": "Permis d''outillage", "lg-ita": "Autorizzazioni degli strumenti", "lg-spa": "Permisos de herramientas"}'),
(15362507,	'dd327',	'dd319',	'dd395',	'no',	'si',	'si',	3,	'dd',	'si',	NULL,	'{
  "name": "tool_subtitles"
}',	'{"name": "tool_subtitles"}',	'{"lg-cat": "Subtítols", "lg-deu": "Untertitel", "lg-ell": "Υπότιτλοι", "lg-eng": "Subtitles", "lg-fra": "Sous-titres", "lg-ita": "Sottotitoli", "lg-spa": "Subtítulos"}'),
(15362508,	'dd250',	'dd245',	NULL,	'si',	'si',	'si',	3,	'dd',	'si',	NULL,	NULL,	NULL,	'{"lg-spa": "rdf:object"}'),
(15362509,	'dd282',	'dd537',	'dd395',	'no',	'si',	'si',	16,	'dd',	'si',	NULL,	'{"name":"conformar_cabeceras"}',	'{"name": "conform_headers"}',	'{"lg-cat": "Conformar capçaleres", "lg-deu": "Kopfzeilen anpassen", "lg-ell": "κεφαλίδα μορφή", "lg-eng": "Conform headers", "lg-ita": "Formare le intestazioni", "lg-spa": "Conformar cabeceras"}'),
(15362510,	'dd202',	'dd174',	'dd177',	'no',	'si',	'si',	4,	'dd',	'no',	NULL,	'',	NULL,	'{"lg-cat": "Nou", "lg-deu": "Neu", "lg-eng": "New", "lg-fra": "Nouveau", "lg-ita": "Nuovo", "lg-spa": "Nuevo"}'),
(15362511,	'dd879',	'dd875',	'dd8',	'no',	'si',	'si',	1,	'dd',	'si',	'',	'',	NULL,	'{"lg-cat": "Valor de la llista", "lg-deu": "Wert aus der Liste", "lg-eng": "List value", "lg-fra": "Valeur de la liste", "lg-ita": "Valore della lista", "lg-spa": "Valor de la lista"}'),
(15362512,	'dd892',	'dd889',	'dd247',	'no',	'si',	'si',	2,	'dd',	'no',	'',	'',	NULL,	'{"lg-cat": "Projecte", "lg-deu": "Projekt", "lg-eng": "Filter", "lg-fra": "Projet", "lg-ita": "Progetto", "lg-spa": "Proyecto"}'),
(15362513,	'dd307',	'dd137',	'dd6',	'no',	'si',	'si',	27,	'dd',	'no',	'[{"dd626":"dd963"}]',	NULL,	NULL,	'{"lg-cat": "Espai de color", "lg-deu": "Farbbereich", "lg-eng": "Colos space", "lg-fra": "Espace couleur", "lg-ita": "Spazio del Colore", "lg-spa": "Espacio de Color"}'),
(15362514,	'dd104',	'dd391',	'dd395',	'no',	'si',	'si',	3,	'dd',	'si',	'',	'{"name":"seleccionado"}',	'{"name": "seleccionado"}',	'{"lg-cat": "seleccionat", "lg-deu": "ausgewählt", "lg-ell": "επιλεγμένα", "lg-eng": "selected", "lg-fra": "sélectionné", "lg-ita": "Selezione", "lg-nep": "चयन गरियो", "lg-spa": "seleccionado"}'),
(15362515,	'dd56',	'dd30',	'dd183',	'no',	'si',	'si',	5,	'dd',	'no',	'null',	'',	NULL,	'{"lg-cat": "Esborrar", "lg-deu": "Löschen", "lg-ell": "σαφής διάταξη", "lg-eng": "Delete", "lg-fra": "Supprimer", "lg-ita": "Cancellare", "lg-spa": "Borrar"}'),
(15362516,	'dd1714',	'dd1707',	'dd1041',	'no',	'si',	'si',	1,	'dd',	'si',	'[{"dd749":"rsc29"}]',	'',	NULL,	'{"lg-deu": "Bild", "lg-eng": "Image", "lg-fra": "Image", "lg-spa": "Imagen"}'),
(15362517,	'dd1210',	'dd1707',	'dd1041',	'no',	'si',	'si',	4,	'dd',	'si',	'[{"dd247":"rsc28"}]',	'',	NULL,	'{"lg-deu": "Projekte", "lg-eng": "Projects", "lg-fra": "Projets", "lg-spa": "Projectos"}'),
(15362518,	'dd1715',	'dd1707',	'dd1041',	'no',	'si',	'si',	2,	'dd',	'si',	'[{"dd9":"rsc21"}]',	'',	NULL,	'{"lg-deu": "Code", "lg-eng": "Code", "lg-fra": "Code", "lg-spa": "Código"}'),
(15362519,	'dd6',	'dd4',	'null',	'si',	'si',	'si',	1,	'dd',	'no',	'null',	'',	NULL,	'{"lg-spa": "section"}'),
(15362520,	'dd877',	'dd875',	'dd247',	'no',	'si',	'si',	2,	'dd',	'no',	'',	'',	NULL,	'{"lg-cat": "Projecte", "lg-deu": "Projekt", "lg-eng": "Filter", "lg-fra": "Projet", "lg-ita": "Progetto", "lg-spa": "Proyecto"}'),
(15362521,	'dd1646',	'dd1137',	'dd347',	'no',	'si',	'si',	18,	'dd',	'no',	'[{"dd1229":"actv61"}]',	NULL,	NULL,	'{"lg-spa": "activities"}'),
(15362522,	'dd245',	'dd251',	NULL,	'si',	'si',	'si',	4,	'dd',	'si',	NULL,	NULL,	NULL,	'{"lg-spa": "rdf"}'),
(15362523,	'dd87',	'dd42',	'dd91',	'no',	'si',	'si',	2,	'dd',	'no',	'[{"dd9":"dd240"}]',	'',	NULL,	'{"lg-cat": "Llistat", "lg-deu": "Liste", "lg-ell": "Λίστα", "lg-eng": "List", "lg-fra": "Liste", "lg-ita": "Elenco", "lg-spa": "Listado"}'),
(15362524,	'dd18',	'dd17',	'null',	'si',	'si',	'si',	3,	'dd',	'no',	'',	'',	NULL,	'{"lg-spa": "diffusion_group"}'),
(15362525,	'dd532',	'dd528',	'dd247',	'no',	'si',	'si',	2,	'dd',	'no',	NULL,	NULL,	NULL,	'{"lg-cat": "Projecte", "lg-deu": "Projekt", "lg-eng": "Filtre", "lg-fra": "Projet", "lg-ita": "Progetto", "lg-spa": "Proyecto"}'),
(15362526,	'dd347',	'dd1259',	NULL,	'si',	'si',	'si',	3,	'dd',	'no',	NULL,	NULL,	NULL,	'{"lg-spa": "table_alias"}'),
(15362527,	'dd1098',	'dd692',	'dd395',	'no',	'si',	'si',	2,	'dd',	'si',	'',	'{"name":"estadisticas"}',	'{"name": "estadisticas"}',	'{"lg-cat": "Estadístiques", "lg-deu": "Statistiken", "lg-ell": "στατιστική", "lg-eng": "Stats", "lg-fra": "Statistiques", "lg-ita": "Statistiche", "lg-nep": "तथ्याङ्क", "lg-spa": "Estadísticas"}'),
(15362528,	'dd1078',	'dd391',	'dd395',	'no',	'si',	'si',	64,	'dd',	'si',	'',	'{"name":"total"}',	'{"name": "total"}',	'{"lg-cat": "Total", "lg-deu": "Total", "lg-ell": "συνολικός", "lg-eng": "Total", "lg-fra": "Total", "lg-ita": "Totale", "lg-nep": "कुल", "lg-spa": "Total"}'),
(15362529,	'dd196',	'dd193',	'dd8',	'no',	'si',	'si',	3,	'dd',	'si',	'',	'',	NULL,	'{"lg-cat": "Secció info", "lg-deu": "Sektion Info", "lg-ell": "Πληροφορίες τμήματος", "lg-eng": "Section info", "lg-fra": "Section d''information", "lg-ita": "Info sezione", "lg-spa": "Sección info"}'),
(15362530,	'dd1125',	'dd383',	'dd392',	'no',	'si',	'si',	1,	'dd',	'si',	'null',	'',	NULL,	'{"lg-cat": "Geolocalizació", "lg-deu": "Geolokalisation", "lg-eng": "Geolocation", "lg-fra": "Géolocalisation ", "lg-ita": "Geolocalizzazione", "lg-spa": "Geolocalización"}'),
(15362531,	'dd223',	'dd205',	'dd9',	'no',	'si',	'si',	1,	'dd',	'si',	NULL,	'',	NULL,	'{"lg-cat": "Processat textual", "lg-deu": "Textverarbeitung", "lg-eng": "Text processing", "lg-fra": "Traitement de texte", "lg-ita": "Processato testuale", "lg-spa": "Procesado textual"}'),
(15362532,	'dd127',	'dd99',	'dd9',	'no',	'si',	'si',	1,	'dd',	'si',	NULL,	'',	NULL,	'{"lg-cat": "Procés", "lg-deu": "Prozess", "lg-eng": "Process", "lg-fra": "Processus", "lg-ita": "Processo", "lg-spa": "Proceso"}'),
(15362533,	'dd1317',	'dd1313',	'dd91',	'no',	'si',	'si',	5,	'dd',	'si',	'[{"dd9":"dd1315"}]',	'',	NULL,	'{"lg-cat": "Llistat", "lg-deu": "Liste", "lg-eng": "List", "lg-fra": "Liste", "lg-ita": "Elenco", "lg-spa": "Listado"}'),
(15362534,	'dd655',	'dd1453',	'dd6',	'no',	'si',	'si',	5,	'dd',	'no',	'[{"dd6":"dd623"}]',	'',	'null',	'{"lg-cat": "Configuracions de recerques actuals", "lg-deu": "Aktuelle Suchkonfigurationen", "lg-eng": "Search presets temp", "lg-fra": "Paramètres de la recherches actuelles", "lg-ita": "Configurazioni delle ricerche attuali", "lg-spa": "Configuraciones de búsquedas actuales"}'),
(15362535,	'dd95',	'dd117',	NULL,	'si',	'si',	'si',	15,	'dd',	'no',	'',	'',	NULL,	'{"lg-spa": "menu"}'),
(15362536,	'dd36',	'dd117',	'null',	'si',	'si',	'si',	6,	'dd',	'no',	'',	'',	NULL,	'{"lg-spa": "area_publication"}'),
(15362537,	'dd111',	'dd906',	'dd395',	'no',	'si',	'si',	9,	'dd',	'si',	NULL,	'{"name":"number_page_of_total_pages"}',	'{"name": "number_page_of_total_pages"}',	'{"lg-cat": "Pàgina %s de %s", "lg-deu": "Seite %s von %s", "lg-ell": "Σελίδα %s από %s", "lg-eng": "Page %s of %s", "lg-fra": "Page %s de %s", "lg-ita": "Pagina %s di %s", "lg-spa": "Página %s de %s"}'),
(15362538,	'dd1745',	'dd906',	'dd395',	'no',	'si',	'si',	5,	'dd',	'si',	NULL,	'{"name":"nombre"}',	'{"name": "name"}',	'{"lg-cat": "Nom", "lg-deu": "Name", "lg-ell": "όνομα", "lg-eng": "Name", "lg-fra": "Prénom", "lg-ita": "Nome", "lg-nep": "नाम", "lg-spa": "Nombre"}'),
(15362539,	'dd63',	'dd70',	'dd1028',	'no',	'si',	'si',	2,	'dd',	'no',	'[{"dd6":"dd542"}]',	'',	NULL,	'{"lg-deu": "Aktivität", "lg-eng": "Activity", "lg-fra": "Activité", "lg-spa": "Actividad"}'),
(15362540,	'dd569',	'dd567',	'dd247',	'no',	'si',	'si',	2,	'dd',	'no',	'',	'',	NULL,	'{"lg-cat": "Projecte", "lg-deu": "Projekt", "lg-eng": "Filter", "lg-fra": "Projet", "lg-ita": "Progetto", "lg-spa": "Proyecto"}'),
(15362541,	'dd139',	'dd90',	'dd247',	'no',	'si',	'si',	2,	'dd',	'no',	NULL,	'',	NULL,	'{"lg-cat": "Projecte", "lg-deu": "Projekt", "lg-eng": "Filter", "lg-fra": "Projet", "lg-ita": "Progetto", "lg-spa": "Proyecto"}'),
(15362542,	'dd526',	'dd245',	'null',	'si',	'si',	'si',	4,	'dd',	'no',	'',	NULL,	NULL,	'{"lg-spa": "owl:Class"}'),
(15362543,	'dd211',	'dd208',	'dd247',	'no',	'si',	'si',	2,	'dd',	'no',	'',	'',	NULL,	'{"lg-cat": "Projecte", "lg-deu": "Projekt", "lg-eng": "Filter", "lg-fra": "Projet", "lg-ita": "Progetto", "lg-spa": "Proyecto"}'),
(15362544,	'dd212',	'dd208',	'dd91',	'no',	'si',	'si',	4,	'dd',	'si',	'[{"dd9":"dd210"}]',	'',	NULL,	'{"lg-cat": "Llistat", "lg-deu": "Liste", "lg-eng": "List", "lg-fra": "Liste", "lg-ita": "Elenco", "lg-spa": "Listado"}'),
(15362545,	'dd1718',	'dd234',	'dd8',	'no',	'si',	'si',	2,	'dd',	'si',	'',	'',	NULL,	'{"lg-cat": "Accés i permisos", "lg-deu": "Zugang und Berechtigungen", "lg-ell": "Πρόσβαση και δικαιώματα", "lg-eng": "Access and permissions", "lg-fra": "Accès et autorisations", "lg-ita": "Accesso e permessi", "lg-spa": "Acceso y permisos"}'),
(15362546,	'dd476',	'dd469',	'dd91',	'no',	'si',	'si',	3,	'dd',	'si',	'[{"dd9":"dd471"}]',	NULL,	NULL,	'{"lg-deu": "Liste", "lg-eng": "List", "lg-fra": "Liste", "lg-ita": "Elenco", "lg-spa": "Listado"}'),
(15362547,	'dd534',	'dd528',	'dd177',	'no',	'si',	'si',	3,	'dd',	'no',	NULL,	NULL,	NULL,	'{"lg-cat": "Nou", "lg-deu": "Neu", "lg-eng": "New", "lg-fra": "Nouveau", "lg-ita": "Nuovo", "lg-spa": "Nuevo"}'),
(15362548,	'dd533',	'dd528',	'dd91',	'no',	'si',	'si',	5,	'dd',	'si',	'[{"dd9":"dd531"}]',	NULL,	NULL,	'{"lg-cat": "Llistat", "lg-deu": "Liste", "lg-eng": "List", "lg-fra": "Liste", "lg-ita": "Elenco", "lg-spa": "Listado"}'),
(15362549,	'dd57',	'dd440',	'null',	'si',	'si',	'si',	28,	'dd',	'no',	'',	'',	NULL,	'{"lg-spa": "component_radio_button"}'),
(15362550,	'dd1040',	'dd906',	'dd395',	'no',	'si',	'si',	3,	'dd',	'si',	'null',	'{"name":"nueva_plantilla_vacia"}',	'{"name": "nueva_plantilla_vacia"}',	'{"lg-cat": "Nova plantilla buida", "lg-deu": "Neue leere Vorlage", "lg-ell": "Νέα άδειο πρότυπο", "lg-eng": "New empty template", "lg-fra": "Nouveau modèle vide", "lg-ita": "Nuovo modello vuoto", "lg-spa": "Nueva plantilla vacía"}'),
(15362551,	'dd121',	'dd906',	'dd395',	'no',	'si',	'si',	11,	'dd',	'si',	NULL,	'{"name":"total_pages"}',	'{"name": "total_pages"}',	'{"lg-cat": "Pàgines totals", "lg-deu": "Totale Seiten", "lg-ell": "συνολικές σελίδες", "lg-eng": "Total pages", "lg-fra": "Pages totales", "lg-ita": "Pagine totali", "lg-spa": "Páginas totales"}'),
(15362552,	'dd76',	'dd391',	'dd395',	'no',	'si',	'si',	77,	'dd',	'si',	NULL,	'{"name":"mostrar"}',	'{"name": "mostrar"}',	'{"lg-cat": "mostrar", "lg-deu": "Zeigen", "lg-ell": "επίδειξη", "lg-eng": "show", "lg-fra": "Afficher", "lg-ita": "Mostrare", "lg-nep": "देखाउनु", "lg-spa": "mostrar"}'),
(15362553,	'dd26',	'dd20',	'dd247',	'no',	'si',	'si',	3,	'dd',	'no',	'',	NULL,	NULL,	'{"lg-cat": "Projecte", "lg-deu": "Projekt", "lg-ell": "Έργο", "lg-eng": "Project", "lg-fra": "Projet", "lg-ita": "Progetto", "lg-spa": "Proyecto"}'),
(15362554,	'dd1221',	'dd6',	'null',	'si',	'si',	'si',	10,	'dd',	'si',	'',	'',	NULL,	'{"lg-spa": "button_import"}'),
(15362555,	'dd75',	'dd6',	'null',	'si',	'si',	'si',	11,	'dd',	'no',	'',	'',	NULL,	'{"lg-spa": "button_trigger"}'),
(15362556,	'dd463',	'dd460',	'dd247',	'no',	'si',	'si',	2,	'dd',	'no',	NULL,	NULL,	NULL,	'{"lg-deu": "Projekt", "lg-eng": "Project", "lg-fra": "Projet", "lg-ita": "Progetto", "lg-spa": "Proyecto"}'),
(15362557,	'dd464',	'dd460',	'dd91',	'no',	'si',	'si',	3,	'dd',	'si',	'[{"dd9":"dd462"}]',	NULL,	NULL,	'{"lg-deu": "Liste", "lg-eng": "List", "lg-fra": "Liste", "lg-ita": "Elenco", "lg-spa": "Listado"}'),
(15362558,	'dd389',	'dd383',	'dd392',	'no',	'si',	'si',	7,	'dd',	'si',	'',	'',	NULL,	'{"lg-deu": "Warnungen", "lg-eng": "Alerts", "lg-fra": "Alertes", "lg-ita": "Avvisi", "lg-spa": "Alertas"}'),
(15362559,	'dd79',	'dd440',	NULL,	'si',	'si',	'si',	9,	'dd',	'no',	NULL,	'',	NULL,	'{"lg-spa": "component_external"}'),
(15362560,	'dd161',	'dd147',	'dd395',	'no',	'si',	'si',	6,	'dd',	'si',	NULL,	'{"name":"para_revisar"}',	'{"name": "para_revisar"}',	'{"lg-cat": "Per revisar", "lg-deu": "Zu prüfen", "lg-ell": "για την αναθεώρηση", "lg-eng": "For review", "lg-fra": "Pour examiner", "lg-ita": "Per controllare", "lg-nep": "समीक्षाको लागि", "lg-spa": "Para revisar"}'),
(15362561,	'dd447',	'dd319',	'dd395',	'no',	'si',	'si',	7,	'dd',	'si',	'',	'{
  "name": "tool_tc"
}',	'{"name": "tool_tc"}',	'{"lg-cat": "Codis de temps", "lg-deu": "Zeitcodes", "lg-eng": "Time codes", "lg-fra": "Codes temporels", "lg-ita": "Codici temporali", "lg-spa": "Codigos de tiempo"}'),
(15362562,	'dd466',	'dd501',	'dd177',	'no',	'si',	'si',	4,	'dd',	'no',	NULL,	NULL,	NULL,	'{"lg-deu": "Neu", "lg-eng": "New", "lg-fra": "Nouveau", "lg-ita": "Nuovo", "lg-spa": "Nuevo"}'),
(15362563,	'dd786',	'dd537',	'dd395',	'no',	'si',	'si',	5,	'dd',	'si',	'',	'{
  "name": "tool_av_versions"
}',	'{"name": "tool_av_versions"}',	'{"lg-cat": "Fitxers d''àudio / vídeo", "lg-deu": "Audio/Video Dateien", "lg-ell": "Αρχεία ήχου / βίντεο", "lg-eng": "Files audio / video", "lg-fra": "Fichiers audio/vidéo", "lg-ita": "Files di audio/video", "lg-spa": "Ficheros de audio/video"}'),
(15362564,	'dd1734',	'dd390',	'dd395',	'no',	'si',	'si',	26,	'dd',	'si',	NULL,	'{"name":"mostrar_todos"}',	'{"name": "show_all"}',	'{"lg-cat": "Mostrar tots", "lg-deu": "Alle zeigen", "lg-ell": "Εμφάνιση όλων", "lg-eng": "Show all", "lg-fra": "Tout afficher", "lg-ita": "Mostrare tutti", "lg-nep": "सबै देखाऊ", "lg-spa": "Mostrar todos"}'),
(15362565,	'dd371',	'dd365',	'dd247',	'no',	'si',	'si',	2,	'dd',	'no',	NULL,	NULL,	NULL,	'{"lg-cat": "Projecte", "lg-deu": "Projekt", "lg-ell": "Έργο", "lg-eng": "Project", "lg-fra": "Projet", "lg-ita": "Progetto", "lg-spa": "Proyecto"}'),
(15362566,	'dd1747',	'dd440',	NULL,	'si',	'si',	'si',	36,	'dd',	'no',	'',	'',	NULL,	'{"lg-spa": "component_section_id"}'),
(15362567,	'dd9',	'dd440',	'null',	'si',	'si',	'si',	30,	'dd',	'no',	'',	'',	NULL,	'{"lg-spa": "component_input_text"}'),
(15362568,	'dd48',	'dd427',	'dd206',	'no',	'si',	'si',	6,	'dd',	'no',	'',	'',	NULL,	'{"lg-cat": "Fill", "lg-deu": "Unterbegriff", "lg-ell": "Γιος", "lg-eng": "Child", "lg-fra": "Enfant", "lg-ita": "Figlio", "lg-nep": "बच्चा", "lg-spa": "Hijo"}'),
(15362569,	'dd183',	'dd6',	'null',	'si',	'si',	'si',	6,	'dd',	'no',	'null',	'',	NULL,	'{"lg-spa": "button_delete"}'),
(15362570,	'dd434',	'dd6',	NULL,	'si',	'si',	'si',	14,	'dd',	'no',	NULL,	NULL,	NULL,	'{"lg-spa": "section_list_thesaurus_indexation"}'),
(15362571,	'dd125',	'dd6',	'null',	'si',	'si',	'si',	15,	'dd',	'no',	'',	'',	NULL,	'{"lg-spa": "section_tool"}'),
(15362572,	'dd58',	'dd6',	'null',	'si',	'si',	'si',	21,	'dd',	'no',	'',	'',	NULL,	'{"lg-spa": "relation_list"}'),
(15362573,	'dd338',	'dd342',	'dd395',	'no',	'si',	'si',	12,	'dd',	'si',	NULL,	'{
  "name": "build_structure_css"
}',	'{"name": "build_structure_css"}',	'{"lg-cat": "Generar estructura css", "lg-deu": "CSS-Struktur erstellen", "lg-eng": "Build structure css", "lg-fra": "Générer une structure css", "lg-ita": "Creare struttura css", "lg-spa": "Generar estructura css"}'),
(15362574,	'dd346',	'dd342',	'dd395',	'no',	'si',	'si',	5,	'dd',	'si',	NULL,	'{
  "name": "section_tipo"
}',	'{"name": "section_tipo"}',	'{"lg-cat": "Tipus de la secció", "lg-deu": "Typ der Sektion", "lg-eng": "Section tipo", "lg-fra": "Type de section", "lg-ita": "Tipo della sezione", "lg-nep": "खण्ड टिपो", "lg-spa": "Tipo de la sección"}'),
(15362575,	'dd1722',	'dd6',	NULL,	'si',	'si',	'si',	9,	'dd',	'no',	'',	NULL,	NULL,	'{"lg-spa": "button_print"}'),
(15362576,	'dd503',	'dd502',	'dd9',	'no',	'si',	'si',	1,	'dd',	'si',	NULL,	NULL,	NULL,	'{"lg-cat": "Estat", "lg-deu": "Zustand", "lg-ell": "κατάσταση", "lg-eng": "State", "lg-fra": "État ", "lg-ita": "Stato", "lg-spa": "Estado"}'),
(15362577,	'dd494',	'dd493',	'dd9',	'no',	'si',	'si',	1,	'dd',	'si',	NULL,	NULL,	NULL,	'{"lg-cat": "Rol", "lg-deu": "Rolle", "lg-ell": "ρόλος", "lg-eng": "Rol", "lg-fra": "Rôle", "lg-ita": "Ruolo", "lg-spa": "Rol"}'),
(15362578,	'dd502',	'dd501',	'dd8',	'no',	'si',	'si',	1,	'dd',	'no',	NULL,	NULL,	NULL,	'{"lg-cat": "Identificació", "lg-deu": "Identifizierung", "lg-ell": "αναγνώριση", "lg-eng": "Identification", "lg-fra": "Identification", "lg-ita": "Identificazione", "lg-spa": "Identificación"}'),
(15362579,	'dd505',	'dd501',	'dd247',	'no',	'si',	'si',	3,	'dd',	'no',	NULL,	NULL,	NULL,	'{"lg-cat": "Projecte", "lg-deu": "Projekt", "lg-ell": "Έργο", "lg-eng": "Project", "lg-fra": "Projet", "lg-ita": "Progetto", "lg-spa": "Proyecto"}'),
(15362580,	'dd490',	'dd427',	'dd206',	'no',	'si',	'si',	5,	'dd',	'no',	NULL,	NULL,	NULL,	'{"lg-cat": "Estructuració", "lg-deu": "Strukturierung", "lg-ell": "δόμηση", "lg-eng": "Structuration", "lg-fra": "Structure", "lg-ita": "Strutturazione", "lg-spa": "Estructuración"}'),
(15362581,	'dd456',	'dd449',	'dd395',	'no',	'si',	'si',	9,	'dd',	'si',	NULL,	'{"name":"municipio"}',	'{"name": "municipio"}',	'{"lg-cat": "Municipi", "lg-deu": "Gemeinde", "lg-ell": "δήμος", "lg-eng": "Municipality", "lg-fra": "Municipalité", "lg-ita": "Comune", "lg-nep": "नगरपालिका", "lg-spa": "Municipio"}'),
(15362582,	'dd458',	'dd449',	'dd395',	'no',	'si',	'si',	11,	'dd',	'si',	NULL,	'{"name":"informantes"}',	'{"name": "informantes"}',	'{"lg-cat": "Informants", "lg-deu": "Informanten", "lg-ell": "πληροφοριοδότες", "lg-eng": "Informants", "lg-fra": "Informateurs", "lg-ita": "Informatori", "lg-spa": "Informantes"}'),
(15362583,	'dd317',	'dd342',	'dd395',	'no',	'si',	'si',	9,	'dd',	'si',	NULL,	'{
  "name": "usuarios_activos"
}',	'{"name": "usuarios_activos"}',	'{"lg-cat": "Usuaris actius", "lg-deu": "Aktive Benutzer/innen", "lg-eng": "Active users", "lg-fra": "Utilisateurs actifs", "lg-ita": "Utenti attivi", "lg-spa": "Usuarios activos"}'),
(15362584,	'dd430',	'dd342',	'dd395',	'no',	'si',	'si',	13,	'dd',	'no',	'null',	'{"name":"hacer_backup"}',	'{"name": "make_backup"}',	'{"lg-cat": "Fer còpia de seguretat", "lg-deu": "Sicherheitskopie machen", "lg-eng": "Make backup", "lg-fra": "Faire une copie de sécurité", "lg-ita": "Creare copia di sicurezza", "lg-spa": "Hacer copia de seguridad"}'),
(15362585,	'dd138',	'dd440',	NULL,	'si',	'si',	'si',	8,	'dd',	'si',	'',	'',	NULL,	'{"lg-spa": "component_score"}'),
(15362586,	'dd365',	'rsc480',	'dd6',	'no',	'si',	'si',	5,	'dd',	'no',	'[{"dd626":"dd22"}]',	NULL,	'{"color": "#e4b387"}',	'{"lg-cat": "Estats civils", "lg-deu": "Zivilstände", "lg-ell": "οικογενειακή κατάσταση", "lg-eng": "Civil states", "lg-fra": "États civils", "lg-ita": "Stati civili", "lg-spa": "Estados civiles"}'),
(15362587,	'dd227',	'dd440',	'null',	'si',	'si',	'si',	24,	'dd',	'no',	'',	'',	NULL,	'{"lg-spa": "component_email"}'),
(15362588,	'dd350',	'dd245',	NULL,	'si',	'si',	'si',	5,	'dd',	'no',	NULL,	NULL,	NULL,	'{"lg-spa": "owl:ObjectProperty"}'),
(15362589,	'dd432',	'dd440',	NULL,	'si',	'si',	'si',	40,	'dd',	'no',	NULL,	NULL,	NULL,	'{"lg-spa": "component_relation_index"}'),
(15362590,	'dd32',	'dd207',	'dd4',	'no',	'si',	'si',	7,	'dd',	'no',	'null',	NULL,	NULL,	'{"lg-cat": "Auxiliars", "lg-deu": "Hilfsmittel", "lg-ell": "Βοηθητικό", "lg-eng": "Auxiliary", "lg-fra": "Auxiliaires", "lg-ita": "Ausiliari", "lg-nep": "सहायक", "lg-spa": "Auxiliares"}'),
(15362591,	'dd605',	'dd427',	'dd206',	'no',	'si',	'si',	12,	'dd',	'no',	'',	NULL,	NULL,	'{"lg-cat": "Referència", "lg-deu": "Referenz", "lg-eng": "Reference", "lg-fra": "Référence", "lg-ita": "Riferimento", "lg-spa": "Referencia"}'),
(15362592,	'dd1219',	'dd1553',	'dd395',	'no',	'si',	'si',	2,	'dd',	'si',	'',	'{
  "name": "idioma_de_origen"
}',	'{"name": "idioma_de_origen"}',	'{"lg-cat": "Llengua d''origen", "lg-deu": "Ursprungssprache", "lg-ell": "γλώσσα πηγής", "lg-eng": "Source lang", "lg-fra": "Langue d''origine", "lg-ita": "lingua d''origine", "lg-spa": "Idioma de origen"}'),
(15362593,	'dd480',	'dd449',	'dd395',	'no',	'si',	'si',	1,	'dd',	'si',	NULL,	'{"name":"personas"}',	'{"name": "persons"}',	'{"lg-deu": "Personen", "lg-ell": "άνθρωποι", "lg-eng": "Persons", "lg-fra": "Personnes", "lg-ita": "Persone", "lg-nep": "मानिसहरू", "lg-spa": "Personas"}'),
(15362594,	'dd1375',	'dd659',	'dd395',	'no',	'si',	'si',	17,	'dd',	'si',	NULL,	'{
  "name": "children_recursive"
}',	'{"name": "children_recursive"}',	'{"lg-cat": "Fills", "lg-deu": "Unterbegriffe", "lg-ell": "Παιδιά", "lg-eng": "Children", "lg-fra": "Enfants", "lg-ita": "Bambini", "lg-nep": "बच्चाहरु", "lg-spa": "Hijos"}'),
(15362595,	'dd690',	'dd622',	'dd1235',	'no',	'si',	'si',	4,	'dd',	'si',	'[{"dd1747":"ww16"}]',	'{"varchar":64,"process_dato":"diffusion_sql::map_to_terminoID"}',	NULL,	'{"lg-spa": "term_id"}'),
(15362596,	'dd1321',	'dd1318',	'dd247',	'no',	'si',	'si',	2,	'dd',	'no',	'',	'',	NULL,	'{"lg-cat": "Projecte", "lg-deu": "Projekt", "lg-ell": "Έργο", "lg-eng": "Project", "lg-fra": "Projet", "lg-ita": "Progetto", "lg-spa": "Proyecto"}'),
(15362597,	'dd851',	'dd1631',	'dd247',	'no',	'si',	'si',	10,	'dd',	'no',	NULL,	NULL,	NULL,	'{"lg-deu": "Projekt", "lg-eng": "Project", "lg-fra": "Projet", "lg-ita": "Progetto", "lg-spa": "Proyecto"}'),
(15362598,	'dd853',	'dd622',	'dd1231',	'no',	'si',	'si',	12,	'dd',	'no',	'[{"dd442":"ww50"}]',	'{"process_dato":"diffusion_sql::resolve_component_value","process_dato_arguments":{"component_method":"get_dato"}}',	NULL,	'{"lg-spa": "body_references"}'),
(15362599,	'dd949',	'dd939',	'dd9',	'no',	'si',	'si',	3,	'dd',	'no',	NULL,	'{
  "css": {
    ".wrap_component": {
      "mixin": [
        ".vertical"
      ],
      "style": {
        "width": "30%"
      }
    }
  }
}',	'{"css": {".wrap_component": {"mixin": [".vertical"], "style": {"width": "30%"}}}}',	'{"lg-deu": "Typ des Datums", "lg-eng": "Data type", "lg-fra": "Type d''organisme", "lg-ita": "Tipo di dato", "lg-spa": "Tipo de dato"}'),
(15362600,	'dd1338',	'dd73',	'dd177',	'no',	'si',	'si',	7,	'dd',	'no',	NULL,	NULL,	NULL,	'{"lg-deu": "Neu", "lg-eng": "New", "lg-fra": "Nouveau", "lg-spa": "Nuevo"}'),
(15362601,	'dd1339',	'dd73',	'dd183',	'no',	'si',	'si',	8,	'dd',	'no',	NULL,	NULL,	NULL,	'{"lg-deu": "Löschen", "lg-eng": "Delete", "lg-fra": "Supprimer", "lg-spa": "Borrar"}'),
(15362602,	'dd1133',	'dd1132',	'dd8',	'no',	'si',	'si',	1,	'dd',	'si',	'',	NULL,	'{"css": {".content_data": {"grid-template-columns": "repeat(10, 1fr)"}}}',	'{"lg-cat": "Valor de la llista", "lg-deu": "Wert aus der Liste", "lg-ell": "αναγνώριση", "lg-eng": "Collection / archive", "lg-fra": "Valeur de la liste", "lg-ita": "Valore della lista", "lg-spa": "Valor de la lista"}'),
(15362603,	'dd1222',	'dd1207',	'dd97',	'no',	'si',	'si',	1,	'dd',	'no',	'[{"dd9":"dd1204"},{"dd9":"dd896"},{"dd6":"dd1197"}]',	NULL,	NULL,	'{"lg-spa": "view_single_line"}'),
(15362604,	'dd1661',	'dd692',	'dd395',	'no',	'si',	'si',	20,	'dd',	'si',	NULL,	'{"name":"error"}',	'{"name": "error"}',	'{"lg-cat": "Error", "lg-deu": "Fehler", "lg-ell": "Λάθος", "lg-eng": "Error", "lg-eus": "Errorea", "lg-fra": "Erreur", "lg-ita": "Errore", "lg-nep": "त्रुटि", "lg-por": "Erro", "lg-spa": "Error"}'),
(15362605,	'dd805',	'dd1631',	'dd9',	'no',	'si',	'si',	6,	'dd',	'no',	NULL,	'{"multi_value":true,"css":{".wrap_component":{"mixin":[".vertical"],"style":{"width":"20%"}}}}',	'{"css": {".wrap_component": {"mixin": [".vertical"], "style": {"width": "20%"}}}, "multi_value": true}',	'{"lg-deu": "Andere Referenzen", "lg-eng": "Other References", "lg-fra": "Autres références", "lg-ita": "Altri riferimenti", "lg-spa": "Otras Referencias"}'),
(15362606,	'dd800',	'dd32',	'dd6',	'no',	'si',	'si',	5,	'dd',	'no',	'[{"dd626":"dd481"}]',	NULL,	'{"color": "#e4b387"}',	'{"lg-cat": "Processos", "lg-deu": "Prozesse", "lg-eng": "Processes", "lg-fra": "Processus", "lg-ita": "Processi", "lg-spa": "Processos"}'),
(15362607,	'dd1525',	'dd1132',	'dd183',	'no',	'si',	'si',	4,	'dd',	'no',	'null',	NULL,	NULL,	'{"lg-cat": "Esborrar", "lg-deu": "Löschen", "lg-ell": "Διαγραφή", "lg-eng": "Delete", "lg-fra": "Supprimer", "lg-ita": "Cancellare", "lg-spa": "Borrar"}'),
(15362608,	'dd769',	'dd751',	'dd1233',	'no',	'si',	'si',	1,	'dd',	'si',	'[{"dd339":"rsc20"}]',	'{"info":"For construct the ENUM value of the field, it need to be changed from the -dato- (without language) to the final -enum- value, dato:enumvalue","data_to_be_used":"dato","enum":{"1":"si","2":"no"},"exclude_column":true}',	NULL,	'{"lg-spa": "publication"}'),
(15362609,	'dd1594',	'dd1592',	'dd352',	'no',	'si',	'si',	2,	'dd',	'no',	NULL,	'{"css":{".wrap_component":{"style":{"display":"none"}}}}',	'{"css": {".wrap_component": {"mixin": [".vertical", ".line_left"], "style": {"width": "50%"}}}, "source": {"records_mode": "list", "request_config": [{"sqo": {"section_tipo": [{"source": "self"}]}, "show": {"ddo_map": [{"tipo": "dd156", "parent": "self", "section_tipo": "self"}]}}]}}',	'{"lg-cat": "Fills", "lg-deu": "Unterbegriffe", "lg-ell": "απόγονος", "lg-eng": "Children", "lg-fra": "Enfants", "lg-ita": "Figli", "lg-spa": "Hijos"}'),
(15362610,	'dd1541',	'dd461',	'dd9',	'no',	'si',	'si',	2,	'dd',	'si',	NULL,	NULL,	NULL,	'{"lg-deu": "Definition", "lg-eng": "Definition", "lg-fra": "Définition ", "lg-spa": "Definición"}'),
(15362611,	'dd1663',	'dd137',	'dd6',	'no',	'si',	'si',	34,	'dd',	'no',	'[{"dd626":"dd963"}]',	'',	NULL,	'{"lg-cat": "Tipologia de nombre normalitzat", "lg-deu": "Typologie der Standardnummer", "lg-eng": "Type of standard number", "lg-fra": "Typologie de numéro standard", "lg-ita": "Tipologia di numero normalizzato", "lg-spa": "Tipología de número normalizado"}'),
(15362612,	'dd1542',	'dd460',	'dd177',	'no',	'si',	'si',	4,	'dd',	'si',	NULL,	NULL,	NULL,	'{"lg-cat": "Nou", "lg-deu": "Neu", "lg-eng": "New", "lg-fra": "Nouveau", "lg-spa": "Nuevo"}'),
(15362613,	'dd859',	'dd821',	'dd183',	'no',	'si',	'si',	4,	'dd',	'no',	NULL,	NULL,	NULL,	'{"lg-deu": "Löschen", "lg-eng": "Delete", "lg-fra": "Supprimer", "lg-ita": "Cancellare", "lg-spa": "Borrar"}'),
(15362614,	'dd952',	'dd938',	'dd91',	'no',	'si',	'si',	2,	'dd',	'si',	'[{"dd9":"dd949"},{"dd10":"dd950"}]',	NULL,	NULL,	'{"lg-deu": "Liste der Datumstypen", "lg-eng": "Data types list", "lg-fra": "Liste des types de données", "lg-ita": "Elenco dei tipi di dati", "lg-spa": "Lista de tipos de datos"}'),
(15362615,	'dd332',	'dd319',	'dd395',	'no',	'si',	'si',	5,	'dd',	'si',	NULL,	'{"name":"auto_rebobinado"}',	'{"name": "auto_rewind"}',	'{"lg-cat": "Auto-rebobinat", "lg-deu": "Auto-Reverse", "lg-ell": "Αυτόματη επαναφορά", "lg-eng": "Auto-rewind", "lg-fra": "Rembobinage automatique", "lg-ita": "Auto-riavvolto", "lg-spa": "Auto-rebobinado"}'),
(15362616,	'dd954',	'dd938',	'dd183',	'no',	'si',	'si',	4,	'dd',	'no',	NULL,	NULL,	NULL,	'{"lg-deu": "Löschen", "lg-eng": "Delete", "lg-fra": "Supprimer", "lg-ita": "Cancellare", "lg-spa": "Borrar"}'),
(15362617,	'dd1579',	'dd319',	'dd395',	'no',	'si',	'si',	8,	'dd',	'si',	NULL,	'{"name":"seconds_abbr"}',	'{"name": "seconds_abbr"}',	'{"lg-cat": "Seg.", "lg-deu": "Sek.", "lg-eng": "Sec.", "lg-fra": "Sec.", "lg-spa": "Seg."}'),
(15362618,	'dd956',	'dd809',	'dd97',	'no',	'si',	'si',	1,	'dd',	'si',	'[{"dd6":"dd821"},{"dd9":"dd826"},{"dd9":"dd828"},{"dd10":"dd845"}]',	NULL,	NULL,	'{"lg-spa": "view_single_line"}'),
(15362619,	'dd1371',	'dd1532',	'dd43',	'no',	'si',	'si',	3,	'dd',	'no',	'null',	NULL,	NULL,	'{"lg-eng": "Process", "lg-spa": "Proceso"}'),
(15362620,	'dd1521',	'dd32',	'dd6',	'no',	'si',	'si',	3,	'dd',	'no',	'[{"dd626":"dd1533"}]',	NULL,	NULL,	'{"lg-cat": "Activitat d''usuaris", "lg-deu": "Benutzeraktivität", "lg-eng": "User activity", "lg-fra": "Activité de l''utilisateur", "lg-nep": "प्रयोगकर्ता गतिविधि", "lg-spa": "Actividad de usuarios"}'),
(15362621,	'dd540',	'dd785',	'dd392',	'no',	'si',	'si',	11,	'dd',	'si',	NULL,	NULL,	NULL,	'{"lg-deu": "Time Machine", "lg-eng": "Time Machine", "lg-fra": "La machine à remonter le temps", "lg-ita": "Macchina del tempo", "lg-spa": "Time Machine"}'),
(15362622,	'dd1234',	'dd1229',	'null',	'si',	'si',	'si',	5,	'dd',	'si',	'',	'',	NULL,	'{"lg-spa": "field_date"}'),
(15362623,	'dd1230',	'dd1229',	'null',	'si',	'si',	'si',	1,	'dd',	'si',	'',	'',	NULL,	'{"lg-spa": "field_int"}'),
(15362624,	'dd1326',	'dd1325',	'dd9',	'no',	'si',	'si',	3,	'dd',	'no',	NULL,	'{"css":{".wrap_component":{"mixin":[".vertical"],"style":{"width":"20%"}}}}',	'{"css": {".wrapper_component": {"grid-column": "span 2"}}}',	'{"lg-deu": "Werzeugbezeichnung", "lg-eng": "Tool name", "lg-fra": "Nom de l''outil", "lg-spa": "Nombre de la herramienta"}'),
(15362625,	'dd523',	'dd1229',	NULL,	'si',	'si',	'si',	8,	'dd',	'si',	NULL,	NULL,	NULL,	'{"lg-spa": "field_boolean"}'),
(15362626,	'dd516',	'dd137',	'dd6',	'no',	'si',	'si',	31,	'dd',	'si',	'[{"dd626":"dd963"}]',	NULL,	NULL,	'{"lg-cat": "Processos de restauració", "lg-deu": "Wiederherstellungsprozesse", "lg-ell": "Διαδικασίες αποκατάστασης", "lg-eng": "Restoration processes", "lg-fra": "Processus de restauration", "lg-ita": "Processi di restaurazione", "lg-spa": "Procesos de restauración"}'),
(15362627,	'dd911',	'dd137',	'dd6',	'no',	'si',	'si',	16,	'dd',	'no',	'[{"dd626":"dd963"}]',	NULL,	NULL,	'{"lg-deu": "CSS-Klassen", "lg-eng": "CSS classes", "lg-fra": "Classes CSS", "lg-spa": "clases CSS"}'),
(15362628,	'dd1408',	'dd1391',	'dd592',	'no',	'si',	'si',	14,	'dd',	'no',	'[{"dd6":"rsc176"},{"dd339":"rsc20"},{"dd9":"rsc21"},{"dd9":"rsc23"},{"dd1018":"rsc37"}]',	'{"css":{".wrap_component":{"mixin":[".vertical",".line_top"]}}}',	'{"css": {".wrapper_component": {"grid-column": "span 5"}}}',	'{"lg-deu": "PDF", "lg-eng": "PDF", "lg-fra": "PDF", "lg-spa": "PDF"}'),
(15362629,	'dd264',	'dd1137',	'dd1229',	'no',	'si',	'si',	10,	'dd',	'no',	'[{"dd6":"dd1197"}]',	'',	NULL,	'{"lg-spa": "example"}'),
(15362630,	'dd255',	'dd229',	'dd9',	'no',	'si',	'si',	1,	'dd',	'si',	'[{"dd9":"dd132"}]',	'',	NULL,	'{"lg-cat": "Usuari", "lg-deu": "Benutzername", "lg-ell": "χρήστη", "lg-eng": "Username", "lg-fra": "Utilisateur", "lg-ita": "Utente", "lg-nep": "प्रयोगकर्ता नाम", "lg-spa": "Usuario"}'),
(15362631,	'dd975',	'dd1308',	'dd183',	'no',	'si',	'si',	4,	'dd',	'no',	NULL,	NULL,	NULL,	'{"lg-cat": "Esborrar", "lg-deu": "Löschen", "lg-eng": "Delete", "lg-fra": "Supprimer", "lg-ita": "Cancellare", "lg-spa": "Borrar"}'),
(15362632,	'dd602',	'dd600',	'dd1232',	'no',	'si',	'si',	3,	'dd',	'no',	'[{"dd580":"dd596"}]',	NULL,	NULL,	'{"lg-spa": "data"}'),
(15362633,	'dd603',	'dd600',	'dd1235',	'no',	'si',	'si',	2,	'dd',	'no',	'[{"dd9":"dd594"}]',	'{"varchar":128}',	NULL,	'{"lg-spa": "name"}'),
(15362634,	'dd333',	'dd319',	'dd395',	'no',	'si',	'si',	6,	'dd',	'si',	NULL,	'{"name":"insertar_etiqueta"}',	'{"name": "insert_tag"}',	'{"lg-cat": "Inserir etiqueta", "lg-deu": "Label einfügen", "lg-ell": "ένθετο ετικέτας", "lg-eng": "Insert tag", "lg-fra": "Insérer une étiquette", "lg-ita": "Inserire etichetta", "lg-spa": "Insertar etiqueta"}'),
(15362635,	'dd984',	'dd1631',	'',	'no',	'si',	'si',	9,	'dd',	'no',	NULL,	NULL,	NULL,	'{"lg-spa": "component_order (antes con el tipo dd605)"}'),
(15362636,	'dd1272',	'dd1198',	'dd247',	'no',	'si',	'si',	7,	'dd',	'no',	NULL,	NULL,	NULL,	'{"lg-deu": "Projekt", "lg-eng": "Project", "lg-fra": "Projet", "lg-spa": "Proyecto"}'),
(15362637,	'dd1345',	'dd1343',	'dd9',	'no',	'si',	'si',	2,	'dd',	'no',	NULL,	'{
  "css": {
    ".wrap_component": {
      "mixin": [
        ".vertical"
      ],
      "style": {
        "width": "90%"
      }
    }
  }
}',	'{"css": {".wrap_component": {"mixin": [".vertical"], "style": {"width": "90%"}}}}',	'{"lg-deu": "Modell", "lg-eng": "Model", "lg-fra": "Modèle", "lg-spa": "Modelo"}'),
(15362638,	'dd1346',	'dd1342',	'dd247',	'no',	'si',	'si',	2,	'dd',	'no',	NULL,	NULL,	NULL,	'{"lg-deu": "Projekt", "lg-eng": "Project", "lg-fra": "Projet", "lg-spa": "Proyecto"}'),
(15362639,	'dd381',	'rsc480',	'dd6',	'no',	'si',	'si',	7,	'dd',	'no',	'[{"dd626":"dd22"}]',	NULL,	'{"color": "#e4b387"}',	'{"lg-cat": "Sindicats", "lg-deu": "Gewerkschaften", "lg-ell": "συνδικάτα", "lg-eng": "Syndicate", "lg-fra": "Syndicats", "lg-ita": "Sindicati", "lg-spa": "Sindicatos"}'),
(15362640,	'dd408',	'rsc480',	'dd6',	'no',	'si',	'si',	8,	'dd',	'no',	'[{"dd626":"dd22"}]',	NULL,	'{"color": "#e4b387"}',	'{"lg-cat": "Religions", "lg-deu": "Religionen", "lg-ell": "θρησκείες", "lg-eng": "Religions", "lg-fra": "Religions", "lg-ita": "Religioni", "lg-spa": "Religiones"}'),
(15362641,	'dd910',	'dd622',	'dd1231',	'no',	'si',	'si',	24,	'dd',	'no',	'[{"dd592":"ww29"}]',	'{"process_dato":"diffusion_sql::resolve_value","process_dato_arguments":{"split_string_value":" | ","output":"merged","target_component_tipo":"rsc35"}}',	NULL,	'{"lg-spa": "audiovisual_resolved"}'),
(15362642,	'dd675',	'dd427',	'dd206',	'no',	'si',	'si',	9,	'dd',	'si',	NULL,	NULL,	NULL,	'{"lg-cat": "filtre", "lg-deu": "Filter", "lg-ell": "Φίλτρο", "lg-eng": "Filter", "lg-fra": "Filtre ", "lg-ita": "Filtro", "lg-nep": "फिल्टर गर्नुहोस्", "lg-spa": "Filtro"}'),
(15362643,	'dd1347',	'dd1342',	'dd91',	'no',	'si',	'si',	3,	'dd',	'no',	'[{"dd9":"dd1345"}]',	NULL,	NULL,	'{"lg-deu": "Liste", "lg-eng": "List", "lg-fra": "Liste", "lg-spa": "Listado"}'),
(15362644,	'dd469',	'dd137',	'dd6',	'no',	'si',	'si',	29,	'dd',	'no',	'[{"dd626":"dd963"}]',	NULL,	NULL,	'{"lg-cat": "Tipus de via", "lg-deu": "Typen von Pfaden", "lg-eng": "Types of tracks", "lg-fra": "Types de voies", "lg-ita": "Tipi di vie", "lg-spa": "Tipos de vías"}'),
(15362645,	'dd861',	'dd137',	'dd6',	'no',	'si',	'si',	13,	'dd',	'si',	'[{"dd626":"dd963"}]',	NULL,	NULL,	'{"lg-cat": "Gènere", "lg-deu": "Geschlecht", "lg-eng": "Gender", "lg-fra": "Genre ", "lg-ita": "Genere", "lg-spa": "Género"}'),
(15362646,	'dd527',	'dd1229',	NULL,	'si',	'si',	'si',	10,	'dd',	'si',	NULL,	NULL,	NULL,	'{"lg-spa": "field_datetime"}'),
(15362647,	'dd874',	'dd785',	'dd395',	'no',	'si',	'si',	6,	'dd',	'si',	'null',	'{
  "name": "tool_update_cache"
}',	'{"name": "tool_update_cache"}',	'{"lg-cat": "Actualitzar caché", "lg-deu": "Cache aktualisieren", "lg-ell": "ενημερωμένη cache", "lg-eng": "Update cache", "lg-fra": "Actualiser la mémoire cache", "lg-ita": "Aggiornare", "lg-nep": "क्यास अपडेट गर्नुहोस्", "lg-spa": "Actualizar caché"}'),
(15362648,	'dd126',	'dd153',	'dd8',	'no',	'si',	'si',	2,	'dd',	'no',	'',	NULL,	'{"css": {".content_data": {"grid-template-columns": "1fr 3fr"}}}',	'{"lg-cat": "Expedient", "lg-deu": "Dossier", "lg-ell": "ρεκόρ", "lg-eng": "Expedient", "lg-fra": "Dossier", "lg-ita": "Dossier", "lg-spa": "Expediente"}'),
(15362649,	'dd1701',	'dd785',	'dd395',	'no',	'si',	'si',	8,	'dd',	'si',	'',	'{"name":"tool_portal"}',	'{"name": "tool_portal"}',	'{"lg-cat": "Portal", "lg-deu": "Portal", "lg-ell": "πύλη", "lg-eng": "Portal", "lg-fra": "Portail", "lg-ita": "Portale", "lg-spa": "Portal"}'),
(15362650,	'dd78',	'dd154',	'dd530',	'no',	'si',	'si',	8,	'dd',	'no',	'[{"dd6":"rsc194"},{"dd9":"rsc85"},{"dd9":"rsc86"}]',	'{"css":{".wrap_component":{"mixin":[".vertical",".line_top"],"style":{}}}}',	'{"css": {".wrapper_component": {"grid-column": "6 / span 5"}}}',	'{"lg-cat": "Altres responsables", "lg-deu": "Andere Verantwortliche", "lg-ell": "άλλοι αξιωματούχοι", "lg-eng": "Others responsible", "lg-fra": "Autres responsables", "lg-ita": "Altri responsabili", "lg-spa": "Otros responsables"}'),
(15362651,	'dd732',	'dd555',	'dd557',	'no',	'si',	'si',	4,	'dd',	'no',	NULL,	NULL,	NULL,	'{"lg-deu": "Aktiv", "lg-eng": "Active", "lg-fra": "Actif", "lg-ita": "Attivo", "lg-spa": "Activo"}'),
(15362652,	'dd4',	'dd117',	'null',	'si',	'si',	'si',	1,	'dd',	'no',	'null',	'',	NULL,	'{"lg-spa": "area"}'),
(15362653,	'dd124',	'dd117',	'null',	'si',	'si',	'si',	4,	'dd',	'no',	'',	'',	NULL,	'{"lg-spa": "area_tool"}'),
(15362654,	'dd231',	'dd117',	'null',	'si',	'si',	'si',	7,	'dd',	'no',	'',	'',	NULL,	'{"lg-spa": "area_admin"}'),
(15362655,	'dd357',	'dd117',	'null',	'si',	'si',	'si',	8,	'dd',	'no',	'',	'',	NULL,	'{"lg-spa": "area_resource"}'),
(15362656,	'dd50',	'dd117',	NULL,	'si',	'si',	'si',	3,	'dd',	'no',	'',	'',	NULL,	'{"lg-spa": "area_thesaurus", "lg21710": "css_label_grey_bg_50"}'),
(15362657,	'dd962',	'dd813',	'dd97',	'no',	'si',	'si',	1,	'dd',	'si',	'[{"dd6":"dd867"},{"dd9":"dd871"},{"dd11":"dd872"},{"dd10":"dd897"}]',	NULL,	NULL,	'{"lg-spa": "view_single_line"}'),
(15362658,	'dd536',	'dd785',	'dd392',	'no',	'si',	'si',	12,	'dd',	'si',	NULL,	NULL,	NULL,	'{"lg-deu": "Strukturierung", "lg-eng": "Structuring", "lg-fra": "Structuration", "lg-ita": "Strutturazione", "lg-spa": "Structuracion"}'),
(15362659,	'dd518',	'dd517',	'dd9',	'no',	'si',	'si',	1,	'dd',	'si',	NULL,	NULL,	NULL,	'{"lg-cat": "Procés de restauració", "lg-deu": "Wiederherstellungsprozess", "lg-ell": "Διαδικασία αποκατάστασης", "lg-eng": "Restoration Process", "lg-fra": "Processus de restauration", "lg-ita": "Processo di restaurazione", "lg-spa": "Proceso de restauración"}'),
(15362660,	'dd733',	'dd732',	'dd576',	'no',	'si',	'si',	1,	'dd',	'no',	NULL,	NULL,	NULL,	'{"lg-cat": "!", "lg-deu": "!", "lg-ell": "!", "lg-eng": "!", "lg-fra": "!", "lg-spa": "!"}'),
(15362661,	'dd1416',	'dd1100',	'dd183',	'no',	'si',	'si',	8,	'dd',	'no',	NULL,	'',	'null',	'{"lg-deu": "Löschen", "lg-eng": "Delete", "lg-fra": "Supprimer", "lg-spa": "Borrar"}'),
(15362662,	'dd517',	'dd516',	'dd8',	'no',	'si',	'si',	1,	'dd',	'no',	NULL,	NULL,	NULL,	'{"lg-cat": "Identificació", "lg-deu": "Identifizierung", "lg-ell": "αναγνώριση", "lg-eng": "Identification", "lg-fra": "Identification", "lg-ita": "Identificazione", "lg-spa": "Identificación"}'),
(15362663,	'dd992',	'dd942',	'dd183',	'no',	'si',	'si',	4,	'dd',	'no',	NULL,	NULL,	NULL,	'{"lg-cat": "Esborrar", "lg-deu": "Löschen", "lg-eng": "Delete", "lg-fra": "Supprimer", "lg-ita": "Cancellare", "lg-spa": "Borrar"}'),
(15362664,	'dd519',	'dd516',	'dd91',	'no',	'si',	'si',	2,	'dd',	'no',	'[{"dd9":"dd518"}]',	NULL,	NULL,	'{"lg-cat": "Llistat", "lg-deu": "Liste", "lg-ell": "λίστα", "lg-eng": "List", "lg-fra": "Liste", "lg-ita": "Elenco", "lg-spa": "Listado"}'),
(15362665,	'dd511',	'dd536',	'dd395',	'no',	'si',	'si',	6,	'dd',	'si',	NULL,	'{"name":"enfoque"}',	'{"name": "approach"}',	'{"lg-cat": "Enfocament", "lg-deu": "Fokus", "lg-eng": "Approach", "lg-fra": "Approche", "lg-ita": "Impostazione", "lg-spa": "Enfoque"}'),
(15362666,	'dd993',	'dd942',	'dd58',	'no',	'si',	'si',	6,	'dd',	'no',	'[{"dd9":"dd944"}]',	NULL,	NULL,	'{"lg-cat": "Llista relacions", "lg-deu": "Liste Beziehungen", "lg-eng": "Relation list", "lg-fra": "Liste de relations", "lg-ita": "Elenco relazioni", "lg-spa": "Listado relaciones"}'),
(15362667,	'dd84',	'dd785',	'dd395',	'no',	'si',	'si',	22,	'dd',	'si',	NULL,	'{"name":"tool_diffusion"}',	'{"name": "tool_diffusion"}',	'{"lg-cat": "Publicar", "lg-deu": "Veröffentlichen", "lg-ell": "δημοσιεύω", "lg-eng": "Publish", "lg-fra": "Publier", "lg-ita": "Pubblicare", "lg-nep": "प्रकाशित गर्नुहोस्", "lg-spa": "Publicar"}'),
(15362668,	'dd750',	'dd733',	'dd80',	'no',	'si',	'si',	1,	'dd',	'no',	'[{"dd6":"dd562"},{"dd9":"dd565"}]',	NULL,	NULL,	'{"lg-deu": "Aktiv", "lg-eng": "Asset", "lg-fra": "Actif", "lg-ita": "Attivo", "lg-spa": "Activo"}'),
(15362669,	'dd677',	'dd383',	'dd392',	'no',	'si',	'si',	9,	'dd',	'si',	NULL,	NULL,	NULL,	'{"lg-deu": "Thesaurus", "lg-eng": "Thesaurus", "lg-fra": "thésaurus ", "lg-ita": "Thesaurus", "lg-spa": "thesauro"}'),
(15362670,	'dd286',	'dd785',	'dd395',	'no',	'si',	'si',	26,	'dd',	'si',	NULL,	'{"name":"elementos_activos"}',	'{"name": "active_elements"}',	'{"lg-cat": "elements actius", "lg-deu": "Aktive Elemente", "lg-ell": "ενεργά στοιχεία", "lg-eng": "active elements", "lg-fra": "éléments actifs", "lg-ita": "Elementi attivi", "lg-spa": "elementos activos"}'),
(15362671,	'dd498',	'dd562',	'dd177',	'no',	'si',	'si',	4,	'dd',	'si',	'',	'',	NULL,	'{"lg-cat": "Nou", "lg-deu": "Neu", "lg-eng": "New", "lg-fra": "Nouveau", "lg-ita": "Nuovo", "lg-spa": "Nuevo"}'),
(15362672,	'dd572',	'dd562',	'dd91',	'no',	'si',	'si',	2,	'dd',	'no',	'[{"dd9":"dd565"},{"dd43":"dd566"}]',	NULL,	NULL,	'{"lg-cat": "Llistat", "lg-deu": "Liste", "lg-ell": "λίστα", "lg-eng": "List", "lg-fra": "Liste", "lg-ita": "Elenco", "lg-spa": "Listado"}'),
(15362673,	'dd576',	'dd557',	NULL,	'si',	'si',	'si',	1,	'dd',	'si',	NULL,	NULL,	NULL,	'{"lg-spa": "dataframe"}'),
(15362674,	'dd557',	'dd556',	NULL,	'si',	'si',	'si',	1,	'dd',	'si',	NULL,	NULL,	NULL,	'{"lg-spa": "dataframe_type"}'),
(15362675,	'dd577',	'dd558',	'dd576',	'no',	'si',	'si',	1,	'dd',	'no',	NULL,	NULL,	NULL,	'{"lg-cat": "?", "lg-deu": "?", "lg-ell": "?", "lg-eng": "?", "lg-fra": "?", "lg-spa": "?"}'),
(15362676,	'dd1228',	'dd264',	'dd1231',	'no',	'si',	'si',	2,	'dd',	'no',	'[{"dd9":"dd1204"}]',	NULL,	NULL,	'{"lg-spa": "description"}'),
(15362677,	'dd319',	'dd785',	'dd392',	'no',	'si',	'si',	33,	'dd',	'si',	NULL,	NULL,	NULL,	'{"lg-deu": "Transkription", "lg-ell": "μεταγραφή", "lg-eng": "Transcription", "lg-fra": "Transciption", "lg-ita": "Trascrizione", "lg-nep": "ट्रान्सक्रिप्शन", "lg-spa": "Transcripción"}'),
(15362678,	'dd1107',	'dd1101',	'dd1231',	'no',	'si',	'si',	3,	'dd',	'no',	'[{"dd9":"dd797"}]',	NULL,	NULL,	'{"lg-spa": "class"}'),
(15362679,	'dd1108',	'dd1101',	'dd1231',	'no',	'si',	'si',	4,	'dd',	'no',	'[{"dd11":"dd798"}]',	NULL,	NULL,	'{"lg-spa": "extend"}'),
(15362680,	'dd1109',	'dd1101',	'dd1231',	'no',	'si',	'si',	5,	'dd',	'no',	'[{"dd10":"dd801"}]',	NULL,	NULL,	'{"lg-spa": "description"}'),
(15362681,	'dd448',	'dd785',	'dd395',	'no',	'si',	'si',	37,	'dd',	'si',	'',	'{"name":"imprimir"}',	'{"name": "print"}',	'{"lg-cat": "Imprimir", "lg-deu": "Drucken", "lg-ell": "Εκτύπωση", "lg-eng": "Print", "lg-fra": "Imprimer", "lg-ita": "Stampare", "lg-nep": "छाप्नुहोस्", "lg-spa": "Imprimir"}'),
(15362682,	'dd1003',	'dd1000',	'dd8',	'no',	'si',	'si',	1,	'dd',	'no',	NULL,	NULL,	'{"css": {".content_data": {"grid-template-columns": "repeat(10, 1fr)"}}}',	'{"lg-cat": "Identificaicó", "lg-deu": "Identifizierung", "lg-eng": "Identification", "lg-fra": "Identification", "lg-ita": "Identificazione", "lg-spa": "Identifiación"}'),
(15362683,	'dd673',	'dd659',	'dd395',	'no',	'si',	'si',	14,	'dd',	'si',	NULL,	'{"name":"mayor_que"}',	'{"name": "greater_than"}',	'{"lg-cat": "Major que", "lg-deu": "Grösser als", "lg-ell": "Περισσότερο από", "lg-eng": "Greater than", "lg-fra": "Supérieur à", "lg-ita": "Media", "lg-nep": "भन्दा ठुलो", "lg-spa": "Mayor que"}'),
(15362684,	'dd650',	'dd785',	'dd395',	'no',	'si',	'si',	42,	'dd',	'si',	'',	'{"name":"opciones_de_busqueda"}',	'{"name": "search_options"}',	'{"lg-cat": "Opcions de cerca", "lg-deu": "Suchoptionen", "lg-ell": "Επιλογές αναζήτησης", "lg-eng": "Search options", "lg-fra": "Options de recherche", "lg-ita": "Opzioni di ricerca", "lg-nep": "खोज विकल्प", "lg-spa": "Opciones de búsqueda"}'),
(15362685,	'dd5',	'dd1',	'dd3',	'no',	'si',	'si',	9,	'dd',	'no',	'',	NULL,	NULL,	'{"lg-eng": "Ontology", "lg-spa": "Ontología"}'),
(15362686,	'dd1356',	'dd785',	'dd395',	'no',	'si',	'si',	52,	'dd',	'si',	NULL,	'{"name":"desglose"}',	'{"name": "breakdown"}',	'{"lg-cat": "Desglossament", "lg-deu": "Aufschlüsselung", "lg-ell": "Επαθε βλάβη", "lg-eng": "Break down", "lg-fra": "Décomposition", "lg-nep": "तोड्नुहोस्", "lg-spa": "Desglose"}'),
(15362687,	'dd1357',	'dd785',	'dd395',	'no',	'si',	'si',	53,	'dd',	'si',	NULL,	'{"name":"estandar"}',	'{"name": "standard"}',	'{"lg-cat": "Estàndard", "lg-deu": "Standard", "lg-ell": "Πρότυπο", "lg-eng": "Standard", "lg-fra": "Norme", "lg-spa": "Estándar"}'),
(15362688,	'dd595',	'dd585',	'dd1017',	'no',	'si',	'si',	4,	'dd',	'si',	NULL,	'{
  "css": {
    ".wrap_component": {
      "mixin": [
        ".vertical"
      ],
      "style": {
        "width": "50%"
      }
    }
  }
}',	'{"css": {".wrap_component": {"mixin": [".vertical"], "style": {"width": "50%"}}}}',	'{"lg-cat": "Observacons", "lg-deu": "Beobachtungen", "lg-ell": "Παρατηρήσεις", "lg-eng": "Observations", "lg-fra": "Observations", "lg-ita": "Osservazioni", "lg-spa": "Observaciones"}'),
(15362689,	'dd585',	'dd477',	'dd8',	'no',	'si',	'si',	1,	'dd',	'no',	NULL,	NULL,	NULL,	'{"lg-cat": "General", "lg-deu": "Allgemein", "lg-ell": "Γενικά", "lg-eng": "General", "lg-fra": "Général", "lg-ita": "Generale", "lg-spa": "General"}'),
(15362690,	'dd467',	'dd89',	'dd206',	'no',	'si',	'si',	2,	'dd',	'no',	NULL,	NULL,	NULL,	'{"lg-cat": "Bidireccional", "lg-deu": "Bidirektional", "lg-ell": "Αμφίδρομος", "lg-eng": "Bidirectional", "lg-fra": "Bidirectionnel", "lg-ita": "Bidirezionale", "lg-spa": "Bidireccional"}'),
(15362691,	'dd621',	'dd89',	'dd206',	'no',	'si',	'si',	3,	'dd',	'no',	NULL,	NULL,	NULL,	'{"lg-cat": "Multidireccional", "lg-deu": "Multidirektional", "lg-ell": "Πολυδιάστατη", "lg-eng": "Multidirectional", "lg-fra": "Multidirectionnel", "lg-ita": "Multidirezionale", "lg-spa": "Multidireccional"}'),
(15362692,	'dd610',	'dd785',	'dd395',	'no',	'si',	'no',	70,	'dd',	'no',	'null',	'{"name":"tool_import_rdf"}',	'{"name": "tool_import_rdf"}',	'{"lg-cat": "Importar RDF", "lg-deu": "RDF importieren", "lg-eng": "Import RDF", "lg-fra": "Importer RDF", "lg-ita": "Importa RDF", "lg-spa": "Importar RDF"}'),
(15362693,	'dd1365',	'dd785',	'dd395',	'no',	'si',	'si',	78,	'dd',	'si',	'null',	'{"name":"updating"}',	'{"name": "updating"}',	'{"lg-cat": "Actualizant", "lg-deu": "Aktualisierung von", "lg-eng": "Updating", "lg-fra": "Mise à jour", "lg-ita": "Aggiornamento", "lg-spa": "Actualizando"}'),
(15362694,	'dd1062',	'dd785',	'dd395',	'no',	'si',	'si',	1,	'dd',	'si',	'null',	'{
  "name": "items"
}',	'{"name": "items"}',	'{"lg-cat": "Ítems", "lg-deu": "Elemente", "lg-ell": "Στοιχεία", "lg-eng": "Items", "lg-fra": "Éléments", "lg-ita": "Elementi", "lg-nep": "वस्तुहरू", "lg-spa": "Elementos"}'),
(15362695,	'dd184',	'dd785',	'dd395',	'no',	'si',	'si',	7,	'dd',	'no',	'null',	'{
  "name": "tool_calendar"
}',	'{"name": "tool_calendar"}',	'{"lg-cat": "Calendari", "lg-deu": "Kalender", "lg-ell": "ημερολόγιο", "lg-eng": "Calendar", "lg-fra": "Calendrier", "lg-ita": "Calendario", "lg-nep": "पात्रो", "lg-spa": "Calendario"}'),
(15362696,	'dd906',	'dd785',	'dd392',	'no',	'si',	'si',	14,	'dd',	'no',	'null',	'',	NULL,	'{"lg-deu": "Werkzeug Drucken", "lg-ell": "εργαλείο εκτύπωσης", "lg-eng": "tool print", "lg-fra": "Impression de l''outil", "lg-ita": "Strumento stampare", "lg-spa": "Tool imprimir"}'),
(15362697,	'dd1553',	'dd785',	'dd395',	'no',	'si',	'si',	17,	'dd',	'si',	NULL,	'{
  "name": "tool_translation"
}',	'{"name": "tool_translation"}',	'{"lg-cat": "Traducció", "lg-deu": "Übersetzung", "lg-eng": "Translation", "lg-fra": "Traduction", "lg-ita": "Traduzione", "lg-nep": "अनुवाद", "lg-spa": "Traducción"}'),
(15362698,	'dd789',	'dd785',	'dd395',	'no',	'si',	'si',	19,	'dd',	'si',	'',	'{"name":"tool_indexation"}',	'{"name": "tool_indexation"}',	'{"lg-ara": "الفهرسة", "lg-cat": "Indexació", "lg-deu": "Indexierung", "lg-ell": "ευρετηρίαση", "lg-eng": "Indexation", "lg-fra": "Indexation", "lg-ita": "Indicizzazione", "lg-nep": "अनुक्रमणिका", "lg-spa": "Indexación"}'),
(15362699,	'dd288',	'dd785',	'dd395',	'no',	'si',	'si',	27,	'dd',	'si',	NULL,	'{
  "name": "elementos_desactivos"
}',	'{"name": "elementos_desactivos"}',	'{"lg-cat": "elements desactius", "lg-deu": "Inaktive Elemente", "lg-ell": "απενεργοποιείται στοιχεία", "lg-eng": "inactive elements", "lg-fra": "éléments désactivés", "lg-ita": "Elementi disattivi", "lg-spa": "elementos desactivos"}'),
(15362700,	'dd289',	'dd785',	'dd395',	'no',	'si',	'si',	28,	'dd',	'si',	NULL,	'{
  "name": "tool_export"
}',	'{"name": "tool_export"}',	'{"lg-cat": "Exportar", "lg-deu": "Exportieren", "lg-ell": "εξαγωγή", "lg-eng": "Export", "lg-fra": "Exporter", "lg-ita": "Esportare", "lg-spa": "Exportar"}'),
(15362701,	'dd326',	'dd785',	'dd395',	'no',	'si',	'si',	31,	'dd',	'si',	NULL,	'{
  "name": "tool_import_bibtex"
}',	'{"name": "tool_import_bibtex"}',	'{"lg-cat": "Importar de BibTex", "lg-deu": "Aus BibTex importieren", "lg-ell": "Εισαγωγής BibTex", "lg-eng": "Import from BibTex", "lg-fra": "Importer de BibTex", "lg-ita": "Importare da BibTex", "lg-spa": "Importar de BibTex"}'),
(15362702,	'dd1650',	'dd390',	'dd395',	'no',	'si',	'si',	41,	'dd',	'si',	NULL,	'{"name":"inspector"}',	'{"name": "inspector"}',	'{"lg-cat": "Inspector", "lg-deu": "Inspektor", "lg-ell": "Επιθεωρητής", "lg-eng": "Inspector", "lg-fra": "Inspecteur", "lg-ita": "Ispettore", "lg-nep": "इन्स्पेक्टर", "lg-por": "Inspetor", "lg-spa": "Inspector"}'),
(15362703,	'dd579',	'dd785',	'dd395',	'no',	'si',	'si',	40,	'dd',	'si',	NULL,	'{"name":"selected_text"}',	'{"name": "selected_text"}',	'{"lg-cat": "text seleccionat", "lg-deu": "Ausgwählter Text", "lg-ell": "Επιλεγμένο κείμενο", "lg-eng": "Selected text", "lg-fra": "Texte sélectionné", "lg-ita": "Testo selezionato", "lg-spa": "Texto seleccionado"}'),
(15362704,	'dd653',	'dd785',	'dd395',	'no',	'si',	'si',	45,	'dd',	'si',	NULL,	'{"name":"o"}',	'{"name": "or"}',	'{"lg-cat": "o", "lg-deu": "Oder", "lg-ell": "ή", "lg-eng": "or", "lg-fra": "ou", "lg-ita": "o", "lg-nep": "वा", "lg-spa": "o"}'),
(15362705,	'dd1530',	'dd1535',	'dd635',	'no',	'si',	'si',	4,	'dd',	'no',	NULL,	NULL,	NULL,	'{"lg-deu": "Datum", "lg-eng": "Date", "lg-fra": "Date", "lg-spa": "Fecha"}'),
(15362706,	'dd1480',	'dd785',	'dd395',	'no',	'si',	'si',	62,	'dd',	'si',	'null',	'{
  "name": "tool_docu"
}',	'{"name": "tool_docu"}',	'{"lg-cat": "Documentació", "lg-deu": "Dokumentation", "lg-ell": "Τεκμηρίωση", "lg-eng": "Documentation", "lg-fra": "Documentation ", "lg-ita": "Documentazione", "lg-spa": "Documentación"}'),
(15362707,	'dd1548',	'dd785',	'dd395',	'no',	'si',	'si',	65,	'dd',	'si',	NULL,	'{
  "name": "tool_note"
}',	'{"name": "tool_watermark"}',	'{"lg-cat": "Notes", "lg-deu": "Anmerkungen", "lg-eng": "Notes", "lg-fra": "Notes", "lg-spa": "Notas"}'),
(15362708,	'dd1007',	'dd1003',	'dd9',	'no',	'si',	'si',	3,	'dd',	'no',	NULL,	'{"css":{".wrap_component":{"mixin":[".vertical",".line_top"],"style":{"width":"25%"}}}}',	'{"css": {".wrapper_component.edit": {"grid-column": "span 3"}}}',	'{"lg-cat": "Acrònim", "lg-deu": "Akronym", "lg-ell": "Ακρωνύμιο", "lg-eng": "Acronym", "lg-fra": "Acronyme", "lg-ita": "Acronimo", "lg-spa": "Acrónimo"}'),
(15362709,	'dd1737',	'dd390',	'dd395',	'no',	'si',	'si',	28,	'dd',	'si',	NULL,	'{"name":"ir_al_fragmento"}',	'{"name": "ir_al_fragmento"}',	'{"lg-cat": "Anar a fragment", "lg-deu": "Gehe zum Auszug", "lg-ell": "Πηγαίνετε στο τεμάχιο", "lg-eng": "Go to fragment", "lg-fra": "Aller à l''extrait", "lg-ita": "Andare al frammento", "lg-nep": "टुक्रामा जानुहोस्", "lg-spa": "Ir al fragmento"}'),
(15362710,	'dd908',	'dd867',	'dd177',	'no',	'si',	'si',	3,	'dd',	'no',	NULL,	NULL,	NULL,	'{"lg-deu": "Neu", "lg-eng": "New", "lg-fra": "Nouveau", "lg-ita": "Nuovo", "lg-spa": "Nuevo"}'),
(15362711,	'dd1011',	'dd1010',	'dd8',	'no',	'si',	'si',	1,	'dd',	'no',	NULL,	NULL,	NULL,	'{"lg-cat": "Identificació", "lg-deu": "Identifizierung", "lg-eng": "Identification", "lg-fra": "Identification", "lg-ita": "Identificazione", "lg-spa": "Identificación"}'),
(15362712,	'dd1012',	'dd1011',	'dd1747',	'no',	'si',	'si',	1,	'dd',	'no',	NULL,	'{
  "css": {
    ".wrap_component": {
      "mixin": [
        ".vertical",
        ".inverse"
      ],
      "style": {
        "width": "10%",
        "border-bottom-right-radius": "10px"
      }
    }
  }
}',	'{"css": {".wrap_component": {"mixin": [".vertical", ".inverse"], "style": {"width": "10%", "border-bottom-right-radius": "10px"}}}}',	'{"lg-cat": "Id", "lg-deu": "Id", "lg-ell": "Id", "lg-eng": "Id", "lg-fra": "Id", "lg-ita": "Id", "lg-spa": "Id"}'),
(15362713,	'dd1013',	'dd1011',	'dd9',	'no',	'si',	'si',	2,	'dd',	'no',	NULL,	'{
  "css": {
    ".wrap_component": {
      "mixin": [
        ".vertical",
        ".line_top"
      ],
      "style": {
        "width": "25%"
      }
    }
  }
}',	'{"css": {".wrap_component": {"mixin": [".vertical", ".line_top"], "style": {"width": "25%"}}}}',	'{"lg-cat": "Nom", "lg-deu": "Name", "lg-ell": "Ονομα", "lg-eng": "Name", "lg-fra": "Prénom", "lg-ita": "Nome", "lg-spa": "Nombre"}'),
(15362714,	'dd659',	'dd383',	'dd392',	'no',	'si',	'si',	8,	'dd',	'si',	NULL,	NULL,	NULL,	'{"lg-deu": "Suchen", "lg-eng": "Search operators", "lg-fra": "recherches", "lg-ita": "Ricerche", "lg-spa": "búsquedas"}'),
(15362715,	'dd678',	'dd677',	'dd395',	'no',	'si',	'si',	1,	'dd',	'si',	NULL,	'{
  "name": "abv_scope_note"
}',	'{"name": "abv_scope_note"}',	'{"lg-cat": "NA", "lg-deu": "SH", "lg-ell": "Σε", "lg-eng": "SN", "lg-fra": "NA", "lg-ita": "NA", "lg-spa": "NA"}'),
(15362716,	'dd680',	'dd677',	'dd395',	'no',	'si',	'si',	3,	'dd',	'si',	NULL,	'{
  "name": "abv_narrowed_term"
}',	'{"name": "abv_narrowed_term"}',	'{"lg-cat": "TE", "lg-deu": "BB", "lg-ell": "ΠΟ", "lg-eng": "NT", "lg-fra": "TE", "lg-ita": "TE", "lg-spa": "TE"}'),
(15362717,	'dd679',	'dd677',	'dd395',	'no',	'si',	'si',	2,	'dd',	'si',	NULL,	'{
  "name": "abv_broader_term"
}',	'{"name": "abv_broader_term"}',	'{"lg-cat": "TG", "lg-deu": "AB", "lg-ell": "ΕΟ", "lg-eng": "BT", "lg-fra": "TG", "lg-ita": "TG", "lg-spa": "TG"}'),
(15362718,	'dd681',	'dd677',	'dd395',	'no',	'si',	'si',	4,	'dd',	'si',	NULL,	'{
  "name": "abv_related_term"
}',	'{"name": "abv_related_term"}',	'{"lg-cat": "TR", "lg-deu": "VB", "lg-ell": "ΣΟ", "lg-eng": "RT", "lg-fra": "TR", "lg-ita": "TR", "lg-spa": "TR"}'),
(15362719,	'dd669',	'dd659',	'dd395',	'no',	'si',	'si',	10,	'dd',	'si',	NULL,	'{"name":"entre"}',	'{"name": "between"}',	'{"lg-cat": "Entre", "lg-deu": "Zwischen", "lg-ell": "μεταξύ", "lg-eng": "Between", "lg-fra": "Entre", "lg-ita": "Tra", "lg-nep": "बीचमा", "lg-spa": "Entre"}'),
(15362720,	'dd682',	'dd677',	'dd395',	'no',	'si',	'si',	5,	'dd',	'si',	NULL,	'{
  "name": "abv_use_for"
}',	'{"name": "abv_use_for"}',	'{"lg-cat": "UP", "lg-deu": "VF", "lg-ell": "XΓ", "lg-eng": "USE", "lg-fra": "UP", "lg-ita": "UP", "lg-spa": "UP"}'),
(15362721,	'dd667',	'dd659',	'dd395',	'no',	'si',	'si',	8,	'dd',	'si',	NULL,	'{"name":"acaba_con"}',	'{"name": "end_with"}',	'{"lg-cat": "Acaba amb", "lg-deu": "Endet mit", "lg-ell": "Τερματισμός με", "lg-eng": "Ends with", "lg-fra": "Terminer avec", "lg-ita": "Termina", "lg-nep": "संग समाप्त हुन्छ", "lg-spa": "Acaba con"}'),
(15362722,	'dd661',	'dd659',	'dd395',	'no',	'si',	'si',	2,	'dd',	'si',	NULL,	'{"name":"campo_vacio"}',	'{"name": "empty"}',	'{"lg-cat": "Buit", "lg-deu": "Leer", "lg-ell": "Άδειασμα", "lg-eng": "Empty", "lg-fra": "Vide", "lg-ita": "Vuoto", "lg-nep": "खाली", "lg-spa": "Vacío"}'),
(15362723,	'dd668',	'dd659',	'dd395',	'no',	'si',	'si',	9,	'dd',	'si',	NULL,	'{"name":"literal"}',	'{"name": "literal"}',	'{"lg-cat": "Literal", "lg-deu": "Literal", "lg-ell": "Λίγο", "lg-eng": "Literal", "lg-fra": "Littéral", "lg-ita": "Letterale", "lg-nep": "शाब्दिक", "lg-spa": "Literal"}'),
(15362724,	'dd187',	'dd539',	'dd395',	'no',	'si',	'si',	3,	'dd',	'si',	'',	'{
  "name": "original"
}',	'{"name": "original"}',	'{"lg-cat": "Original", "lg-deu": "Original", "lg-ell": "πρωτότυπο", "lg-eng": "Original", "lg-fra": "Original", "lg-ita": "Originale", "lg-spa": "Original"}'),
(15362725,	'dd670',	'dd659',	'dd395',	'no',	'si',	'si',	11,	'dd',	'si',	NULL,	'{"name":"secuencia"}',	'{"name": "sequence"}',	'{"lg-cat": "Sequeència", "lg-deu": "Sequenz", "lg-ell": "Ακολουθία", "lg-eng": "Sequence", "lg-fra": "Séquence", "lg-ita": "Sequenza", "lg-nep": "अनुक्रम", "lg-spa": "Secuencia"}'),
(15362726,	'dd662',	'dd659',	'dd395',	'no',	'si',	'si',	3,	'dd',	'si',	NULL,	'{"name":"similar_a"}',	'{"name": "similar_to"}',	'{"lg-cat": "Similar a", "lg-deu": "Ähnlich wie", "lg-ell": "Παρόμοια με", "lg-eng": "Similar to", "lg-fra": "Similaire à", "lg-ita": "Simile a", "lg-nep": "जस्तै", "lg-spa": "Similar a"}'),
(15362727,	'dd811',	'dd810',	'dd8',	'no',	'si',	'si',	1,	'dd',	'si',	'',	'',	NULL,	'{"lg-cat": "Valor de la llista", "lg-deu": "Wert aus der Liste", "lg-eng": "List value", "lg-fra": "Valeur de la liste", "lg-ita": "Valore della lista", "lg-spa": "Valor de la lista"}'),
(15362728,	'dd1153',	'dd1101',	'dd1231',	'no',	'si',	'si',	16,	'dd',	'no',	'[{"dd592":"dd813"}]',	NULL,	NULL,	'{"lg-spa": "property"}'),
(15362729,	'dd1275',	'dd1276',	'dd1747',	'no',	'si',	'si',	1,	'dd',	'no',	'null',	NULL,	NULL,	'{"lg-deu": "ID", "lg-eng": "ID", "lg-fra": "ID", "lg-spa": "ID"}'),
(15362730,	'dd638',	'dd194',	'null',	'si',	'si',	'si',	2,	'dd',	'no',	'',	'',	NULL,	'{"lg-spa": "locator"}'),
(15362731,	'dd606',	'dd35',	'dd4',	'no',	'si',	'si',	2,	'dd',	'si',	NULL,	NULL,	NULL,	'{"lg-deu": "Dokumentenerbe", "lg-eng": "Documentary heritage", "lg-fra": "Patrimoine documentaire", "lg-ita": "Patrimonio documentario", "lg-spa": "Patrimonio documental"}'),
(15362732,	'dd626',	'dd638',	'null',	'si',	'si',	'si',	1,	'dd',	'si',	'',	'',	NULL,	'{"lg-spa": "matrix_table"}'),
(15362733,	'dd1348',	'dd1342',	'dd177',	'no',	'si',	'si',	4,	'dd',	'no',	NULL,	NULL,	NULL,	'{"lg-deu": "Neu", "lg-eng": "New", "lg-fra": "Nouveau", "lg-spa": "Nuevo"}'),
(15362734,	'dd167',	'dd391',	'dd395',	'no',	'si',	'si',	6,	'dd',	'si',	'',	'{"name":"proyecto"}',	'{"name": "project"}',	'{"lg-cat": "Projecte", "lg-deu": "Projekt", "lg-ell": "σχέδιο", "lg-eng": "Project", "lg-fra": "Projet", "lg-ita": "Progetto", "lg-nep": "परियोजना", "lg-spa": "Proyecto"}'),
(15362735,	'dd1281',	'dd1266',	'dd177',	'no',	'si',	'si',	3,	'dd',	'no',	NULL,	NULL,	NULL,	'{"lg-deu": "Neu", "lg-eng": "New", "lg-fra": "Nouveau", "lg-spa": "Nuevo"}'),
(15362736,	'dd817',	'dd800',	'dd91',	'no',	'si',	'si',	2,	'dd',	'no',	'[{"dd9":"dd796"},{"dd9":"dd797"},{"dd10":"dd801"}]',	NULL,	NULL,	'{"lg-deu": "Liste", "lg-eng": "List", "lg-fra": "Lista", "lg-spa": "Lista"}'),
(15362737,	'dd819',	'dd800',	'dd183',	'no',	'si',	'si',	4,	'dd',	'no',	NULL,	NULL,	NULL,	'{"lg-deu": "Löschen", "lg-eng": "Delete", "lg-fra": "Supprimer", "lg-ita": "Cancellare", "lg-spa": "Borrar"}'),
(15362738,	'dd720',	'dd391',	'dd395',	'no',	'si',	'si',	84,	'dd',	'si',	NULL,	'{
  "name": "loading"
}',	'{"name": "loading"}',	'{"lg-cat": "Carregant...", "lg-deu": "Lädt…", "lg-ell": "Φόρτωση...", "lg-eng": "Loading...", "lg-fra": "Téléchargement…", "lg-ita": "Caricando...", "lg-nep": "लोड हुँदै...", "lg-spa": "Cargando..."}'),
(15362739,	'dd545',	'dd548',	'dd634',	'no',	'si',	'si',	5,	'dd',	'no',	'[{"dd6":"dd42"},{"dd9":"dd240"}]',	NULL,	'{"show_interface": {"tools": false, "read_only": true}}',	'{"lg-cat": "Què", "lg-deu": "Was", "lg-ell": "τι", "lg-eng": "What", "lg-fra": "Quoi", "lg-ita": "Cosa", "lg-spa": "Qué"}'),
(15362740,	'dd1331',	'dd1582',	'dd57',	'no',	'si',	'si',	1,	'dd',	'no',	'[{"dd6":"dd64"},{"dd9":"dd62"}]',	'{"css":{".wrap_component":{"mixin":[".vertical"],"style":{"width":"15%"}}}}',	'{"css": {".wrapper_component": {"grid-column": "span 2"}}}',	'{"lg-deu": "Inspektor/in", "lg-eng": "Shown in inspector", "lg-fra": "Inspecteur", "lg-spa": "Inspector"}'),
(15362741,	'dd818',	'dd800',	'dd177',	'no',	'si',	'si',	3,	'dd',	'no',	NULL,	NULL,	NULL,	'{"lg-deu": "Neu", "lg-eng": "New", "lg-fra": "Nouveau", "lg-ita": "Nuovo", "lg-spa": "Nuevo"}'),
(15362742,	'dd716',	'dd391',	'dd395',	'no',	'si',	'si',	82,	'dd',	'si',	NULL,	'{
  "name": "field"
}',	'{"name": "field"}',	'{"lg-cat": "camp:", "lg-deu": "Feld:", "lg-ell": "αγρός:", "lg-eng": "field:", "lg-fra": "champ :", "lg-ita": "Campo:", "lg-nep": "क्षेत्र:", "lg-spa": "campo:"}'),
(15362743,	'dd1158',	'dd1102',	'dd1231',	'no',	'si',	'si',	2,	'dd',	'no',	'[{"dd9":"dd826"}]',	NULL,	NULL,	'{"lg-spa": "name"}'),
(15362744,	'dd767',	'dd751',	'dd1232',	'no',	'si',	'si',	3,	'dd',	'si',	'[{"dd10":"rsc38"}]',	NULL,	NULL,	'{"lg-spa": "description"}'),
(15362745,	'dd1159',	'dd1102',	'dd1231',	'no',	'si',	'si',	3,	'dd',	'no',	'[{"dd9":"dd828"}]',	NULL,	NULL,	'{"lg-spa": "signature"}'),
(15362746,	'dd1654',	'dd391',	'dd395',	'no',	'si',	'si',	100,	'dd',	'si',	NULL,	'{"name":"full_screen"}',	'{"name": "full_screen"}',	'{"lg-cat": "Pantalla completa", "lg-deu": "Ganzer Bildschirm", "lg-ell": "ΠΛΗΡΗΣ ΟΘΟΝΗ", "lg-eng": "Full screen", "lg-ita": "A schermo intero", "lg-nep": "पूर्ण स्क्रिन", "lg-spa": "Pantalla completa"}'),
(15362747,	'dd1160',	'dd1102',	'dd1231',	'no',	'si',	'si',	4,	'dd',	'no',	'[{"dd580":"dd829"}]',	NULL,	NULL,	'{"lg-spa": "result"}'),
(15362748,	'dd148',	'dd1324',	'dd91',	'no',	'si',	'si',	1,	'dd',	'no',	'[{"dd57":"dd1354"},{"dd9":"dd1326"},{"dd9":"dd799"},{"dd10":"dd612"},{"dd9":"dd1327"},{"dd9":"dd1328"},{"dd80":"dd1330"},{"dd57":"dd1331"},{"dd57":"dd1332"},{"dd57":"dd1333"}]',	'',	NULL,	'{"lg-deu": "Liste", "lg-eng": "List", "lg-fra": "Liste", "lg-spa": "Listado"}'),
(15362749,	'dd1465',	'dd1390',	'dd9',	'no',	'si',	'si',	9,	'dd',	'no',	NULL,	'{"multi_value":true,"css":{".wrap_component":{"mixin":[".vertical"],"style":{"width":"40%"}}}}',	'{"css": {".wrapper_component": {"grid-column": "span 2"}}}',	'{"lg-deu": "CSS Modifier", "lg-eng": "CSS modificator", "lg-fra": "css modification", "lg-spa": "css modificador"}'),
(15362750,	'dd1161',	'dd1102',	'dd1231',	'no',	'si',	'si',	5,	'dd',	'no',	'[{"dd10":"dd845"}]',	NULL,	NULL,	'{"lg-spa": "description"}'),
(15362751,	'dd1031',	'dd1026',	'dd247',	'no',	'si',	'si',	3,	'dd',	'no',	NULL,	'{
  "css": {
    ".wrap_component": {
      "mixin": [
        ".vertical"
      ],
      "style": {
        "width": "50%"
      }
    }
  }
}',	'{"css": {".wrap_component": {"mixin": [".vertical"], "style": {"width": "50%"}}}}',	'{"lg-cat": "Projecte", "lg-deu": "Projekt", "lg-ell": "Έργο", "lg-eng": "Project", "lg-fra": "Projet", "lg-ita": "Progetto", "lg-spa": "Proyecto"}'),
(15362752,	'dd1162',	'dd1102',	'dd1231',	'no',	'si',	'si',	6,	'dd',	'no',	'[{"dd9":"dd847"}]',	NULL,	NULL,	'{"lg-spa": "param"}'),
(15362753,	'dd1445',	'dd1390',	'dd57',	'no',	'si',	'si',	6,	'dd',	'no',	'[{"dd6":"dd64"},{"dd9":"dd62"}]',	'{
  "dato_default": [
    {
      "section_id": "1",
      "section_tipo": "dd64"
    }
  ],
  "css": {
    ".wrap_component": {
      "mixin": [
        ".vertical"
      ],
      "style": {
        "width": "13%",
        "opacity": "0.2"
      }
    }
  }
}',	'null',	'{"lg-deu": "Deskriptor", "lg-eng": "Descriptor", "lg-fra": "Descripteur", "lg-spa": "Descriptor"}'),
(15362754,	'dd929',	'dd918',	'dd635',	'no',	'si',	'si',	4,	'dd',	'no',	NULL,	'{
  "css": {
    ".wrap_component": {
      "style": {
        "width": "15%"
      }
    }
  }
}',	'{"css": {".wrap_component": {"style": {"width": "15%"}}}}',	'{"lg-deu": "Datum der Erstellung", "lg-eng": "Creation date", "lg-fra": "Date de création ", "lg-ita": "Data creazione", "lg-spa": "Fecha creación"}'),
(15362755,	'dd1163',	'dd1102',	'dd1231',	'no',	'si',	'si',	7,	'dd',	'no',	'[{"dd530":"dd848"}]',	NULL,	NULL,	'{"lg-spa": "param_data"}'),
(15362756,	'dd1656',	'dd391',	'dd395',	'no',	'si',	'si',	102,	'dd',	'si',	NULL,	'{"name":"ontology"}',	'{"name": "ontology"}',	'{"lg-deu": "Ontologie", "lg-ell": "Οντολογία", "lg-eng": "Ontology", "lg-fra": "Ontologie", "lg-ita": "Ontologia", "lg-nep": "ओन्टोलजी", "lg-por": "Ontologia", "lg-spa": "Ontología"}'),
(15362757,	'dd1164',	'dd1102',	'dd1231',	'no',	'si',	'si',	8,	'dd',	'no',	'[{"dd580":"dd849"}]',	NULL,	NULL,	'{"lg-spa": "example"}'),
(15362758,	'dd1590',	'dd193',	'dd204',	'no',	'si',	'si',	9,	'dd',	'si',	NULL,	NULL,	NULL,	'{"lg-eng": "Install", "lg-fra": "Installation", "lg-nep": "स्थापना गर्नुहोस्", "lg-spa": "Instalación"}'),
(15362759,	'dd1657',	'dd391',	'dd395',	'no',	'si',	'si',	103,	'dd',	'si',	NULL,	'{"name":"developer"}',	'{"name": "developer"}',	'{"lg-cat": "Desenvolupador", "lg-deu": "Entwicklerin", "lg-ell": "Προγραμματιστής", "lg-eng": "Developer", "lg-fra": "Développeur", "lg-nep": "विकासकर्ता", "lg-por": "Desenvolvedor", "lg-spa": "Desarrollador"}'),
(15362760,	'dd1274',	'dd1266',	'dd247',	'no',	'si',	'si',	4,	'dd',	'no',	NULL,	NULL,	NULL,	'{"lg-deu": "Projekt", "lg-eng": "Project", "lg-fra": "Projet", "lg-spa": "Proyecto"}'),
(15362761,	'dd1167',	'dd1103',	'dd1231',	'no',	'si',	'si',	3,	'dd',	'no',	'[{"dd11":"dd872"}]',	NULL,	NULL,	'{"lg-spa": "data_type"}'),
(15362762,	'dd822',	'dd1558',	'dd8',	'no',	'si',	'si',	2,	'dd',	'no',	NULL,	NULL,	NULL,	'{"lg-cat": "Relacions", "lg-deu": "Beziehungen", "lg-ell": "σχέσεων", "lg-eng": "Relations", "lg-fra": "Relations", "lg-ita": "Relazioni", "lg-nep": "सम्बन्धहरू", "lg-spa": "Relaciones"}'),
(15362763,	'dd37',	'dd2',	'null',	'si',	'si',	'si',	4,	'dd',	'no',	'',	NULL,	NULL,	'{"lg-spa": "external_ontologies"}'),
(15362764,	'dd935',	'dd917',	'dd177',	'no',	'si',	'si',	3,	'dd',	'no',	NULL,	NULL,	NULL,	'{"lg-deu": "Neu", "lg-eng": "New", "lg-fra": "Nouveau", "lg-ita": "Nuovo", "lg-spa": "Nuevo"}'),
(15362765,	'dd1706',	'dd15',	'dd19',	'no',	'si',	'si',	2,	'dd',	'si',	'[{"dd6":"rsc170"}]',	'',	NULL,	'{"lg-deu": "Bild", "lg-eng": "Image", "lg-fra": "Image", "lg-spa": "Imagen"}'),
(15362766,	'dd936',	'dd917',	'dd183',	'no',	'si',	'si',	4,	'dd',	'no',	NULL,	NULL,	NULL,	'{"lg-deu": "Löschen", "lg-eng": "Delete", "lg-fra": "Supprimer", "lg-ita": "Cancellare", "lg-spa": "Borrar"}'),
(15362767,	'dd1169',	'dd1103',	'dd1231',	'no',	'si',	'si',	5,	'dd',	'no',	'[{"dd10":"dd897"}]',	NULL,	NULL,	'{"lg-spa": "description"}'),
(15362768,	'dd772',	'dd622',	'dd1231',	'no',	'si',	'si',	10,	'dd',	'si',	'[{"dd442":"ww49"}]',	'{"process_dato":"diffusion_sql::resolve_component_value","process_dato_arguments":{"component_method":"get_dato"}}',	NULL,	'{"lg-spa": "abstract_references"}'),
(15362769,	'dd1038',	'dd1010',	'dd91',	'no',	'si',	'si',	2,	'dd',	'si',	'[{"dd9":"dd1013"},{"dd11":"dd1037"},{"dd11":"dd1016"}]',	NULL,	NULL,	'{"lg-cat": "Llistat", "lg-deu": "Liste", "lg-ell": "Λίστα", "lg-eng": "List", "lg-fra": "Liste", "lg-ita": "Elenco", "lg-spa": "Listado"}'),
(15362770,	'dd1455',	'dd1454',	'dd6',	'no',	'si',	'si',	4,	'dd',	'no',	'[{"dd626":"dd22"}]',	'',	'null',	'{"lg-cat": "Categoríes de protecció", "lg-deu": "Schutzkategorien", "lg-eng": "Protection categories", "lg-fra": "Catégories de protection", "lg-spa": "Categorías de protección"}'),
(15362771,	'dd950',	'dd939',	'dd10',	'no',	'si',	'si',	5,	'dd',	'si',	NULL,	'{
  "css": {
    ".wrap_component": {
      "mixin": [
        ".vertical"
      ],
      "style": {
        "width": "100%"
      }
    }
  }
}',	'{"css": {".wrap_component": {"mixin": [".vertical"], "style": {"width": "100%"}}}}',	'{"lg-deu": "Beschreibung", "lg-eng": "Description", "lg-fra": "Description", "lg-ita": "Descrizione", "lg-spa": "Descripción"}'),
(15362772,	'dd1173',	'dd1104',	'dd1231',	'no',	'si',	'si',	2,	'dd',	'no',	'[{"dd9":"dd921"}]',	NULL,	NULL,	'{"lg-spa": "version"}'),
(15362773,	'dd267',	'dd153',	'dd441',	'no',	'si',	'si',	4,	'dd',	'no',	'',	'{"thesaurus":{"term":"dd156","parent":"dd1593","children":"dd1594"}}',	'{"thesaurus": {"term": "dd156", "parent": "dd1593", "children": "dd1594"}}',	'{"lg-cat": "Mapa de la secció", "lg-deu": "Karte der Sektion", "lg-eng": "Section map", "lg-fra": "carte de la section", "lg-ita": "Mappa della sezione", "lg-spa": "Mapa de la sección"}'),
(15362774,	'dd1039',	'dd1010',	'dd177',	'no',	'si',	'si',	3,	'dd',	'no',	NULL,	NULL,	NULL,	'{"lg-cat": "Nou", "lg-deu": "Neu", "lg-ell": "Νέος", "lg-eng": "New", "lg-fra": "Nouveau", "lg-ita": "Nuovo", "lg-spa": "Nuevo"}'),
(15362775,	'dd329',	'dd342',	'dd395',	'no',	'si',	'si',	10,	'dd',	'no',	NULL,	'{
  "name": "tool_administration"
}',	'{"name": "tool_administration"}',	'{"lg-cat": "Eina d''administració", "lg-deu": "Administrationswerkzeug", "lg-eng": "Administration tool", "lg-fra": "Outil d''administration", "lg-ita": "Strumento d''amministrazione", "lg-spa": "Herramienta de administración"}'),
(15362776,	'dd1639',	'dd390',	'dd395',	'no',	'si',	'si',	39,	'dd',	'si',	NULL,	'{"name":"remove_filter"}',	'{"name": "remove_filter"}',	'{"lg-cat": "Traieu el filtre", "lg-deu": "Filter entfernen", "lg-eng": "Remove filter", "lg-fra": "Supprimer le filtre", "lg-ita": "Rimuovi filtro", "lg-nep": "फिल्टर हटाउनुहोस्", "lg-por": "Remover filtro", "lg-spa": "Eliminar filtro"}'),
(15362777,	'dd1172',	'dd1104',	'dd1234',	'no',	'si',	'si',	3,	'dd',	'no',	'[{"dd635":"dd929"}]',	NULL,	NULL,	'{"lg-spa": "creation_date"}'),
(15362778,	'dd1322',	'dd1318',	'dd91',	'no',	'si',	'si',	5,	'dd',	'si',	'[{"dd9":"dd1320"}]',	'',	NULL,	'{"lg-cat": "Llistat", "lg-deu": "Liste", "lg-ell": "λίστα", "lg-eng": "List", "lg-fra": "Liste", "lg-ita": "Elenco", "lg-spa": "Listado"}'),
(15362779,	'dd797',	'dd773',	'dd9',	'no',	'si',	'si',	3,	'dd',	'no',	'null',	NULL,	'{"css": {".wrapper_component": {"grid-column": "span 4"}}}',	'{"lg-cat": "Fitxer", "lg-deu": "File", "lg-eng": "File", "lg-fra": "Fichier", "lg-ita": "Data", "lg-spa": "Fichero"}'),
(15362780,	'dd149',	'dd440',	'null',	'si',	'si',	'si',	18,	'dd',	'no',	'',	'',	NULL,	'{"lg-spa": "component_security_access"}'),
(15362781,	'dd52',	'dd440',	NULL,	'si',	'si',	'si',	37,	'dd',	'no',	NULL,	'',	NULL,	'{"lg-spa": "component_info"}'),
(15362782,	'dd491',	'dd440',	NULL,	'si',	'si',	'si',	47,	'dd',	'no',	NULL,	NULL,	NULL,	'{"lg-spa": "component_relation_struct"}'),
(15362783,	'dd1174',	'dd1104',	'dd1234',	'no',	'si',	'si',	4,	'dd',	'no',	'[{"dd635":"dd930"}]',	NULL,	NULL,	'{"lg-spa": "end_date"}'),
(15362784,	'dd1179',	'dd1178',	'dd8',	'no',	'si',	'si',	1,	'dd',	'no',	NULL,	NULL,	NULL,	'{"lg-deu": "Allgemeine Informationen", "lg-eng": "General information", "lg-fra": "Information générale", "lg-ita": "Informazione generale", "lg-spa": "Información general"}'),
(15362785,	'dd1287',	'dd1286',	'dd1231',	'no',	'si',	'si',	3,	'dd',	'no',	'[{"dd10":"dd1277"}]',	NULL,	NULL,	'{"lg-spa": "description"}'),
(15362786,	'dd808',	'dd807',	'dd97',	'no',	'si',	'si',	1,	'dd',	'si',	'[{"dd6":"dd821"},{"dd9":"dd826"},{"dd9":"dd828"},{"dd10":"dd845"}]',	NULL,	NULL,	'{"lg-spa": "view_single_line"}'),
(15362787,	'dd1175',	'dd1104',	'dd1231',	'no',	'si',	'si',	5,	'dd',	'no',	'[{"dd9":"dd931"}]',	NULL,	NULL,	'{"lg-spa": "reference"}'),
(15362788,	'dd1286',	'dd1137',	'dd1229',	'no',	'si',	'si',	5,	'dd',	'si',	'[{"dd6":"dd1266"}]',	NULL,	NULL,	'{"lg-spa": "tld"}'),
(15362789,	'dd615',	'dd1229',	NULL,	'si',	'si',	'si',	11,	'dd',	'no',	NULL,	NULL,	NULL,	'{"lg-spa": "field_point"}'),
(15362790,	'dd1285',	'dd1286',	'dd1231',	'no',	'si',	'si',	2,	'dd',	'si',	'[{"dd9":"dd1288"}]',	NULL,	NULL,	'{"lg-spa": "tld"}'),
(15362791,	'dd1176',	'dd1104',	'dd1231',	'no',	'si',	'si',	6,	'dd',	'no',	'[{"dd580":"dd932"}]',	NULL,	NULL,	'{"lg-spa": "example"}'),
(15362792,	'dd1177',	'dd1104',	'dd1231',	'no',	'si',	'si',	7,	'dd',	'no',	'[{"dd10":"dd933"}]',	NULL,	NULL,	'{"lg-spa": "version_notes"}'),
(15362793,	'dd821',	'dd771',	'dd6',	'no',	'si',	'si',	1,	'dd',	'no',	'[{"dd626":"dd963"}]',	NULL,	NULL,	'{"lg-deu": "Methoden", "lg-eng": "Methods", "lg-fra": "Méthodes", "lg-ita": "Metodi", "lg-spa": "Métodos"}'),
(15362794,	'dd867',	'dd771',	'dd6',	'no',	'si',	'si',	2,	'dd',	'no',	'[{"dd626":"dd963"}]',	NULL,	NULL,	'{"lg-deu": "Eigenschaften", "lg-eng": "Properties", "lg-fra": "Propriétés", "lg-ita": "Proprietà", "lg-spa": "Propiedades"}'),
(15362795,	'dd845',	'dd1631',	'dd10',	'no',	'si',	'si',	6,	'dd',	'si',	NULL,	'{"css":{".wrap_component":{"mixin":[".vertical"],"style":{"width":"100%"}}}}',	'{"css": {".wrap_component": {"mixin": [".vertical"], "style": {"width": "100%"}}}}',	'{"lg-deu": "Beschreibung", "lg-eng": "Description", "lg-fra": "Description", "lg-ita": "Descrizione", "lg-spa": "Descripción"}'),
(15362796,	'dd770',	'dd1',	'dd609',	'no',	'si',	'si',	10,	'dd',	'si',	NULL,	NULL,	NULL,	'{"lg-ara": "تطوير", "lg-cat": "Desenvolupament", "lg-deu": "Entwicklung", "lg-eng": "Development", "lg-fra": "Développement", "lg-ita": "Elaborazione", "lg-nep": "विकास", "lg-spa": "Desarrollo"}'),
(15362797,	'dd230',	'dd117',	'null',	'si',	'si',	'si',	14,	'dd',	'no',	'',	'',	NULL,	'{"lg-spa": "login"}'),
(15362798,	'dd940',	'dd939',	'dd1747',	'no',	'si',	'si',	1,	'dd',	'no',	NULL,	'{
  "css": {
    ".wrap_component": {
      "mixin": [
        ".vertical",
        ".inverse"
      ],
      "style": {
        "width": "10%",
        "border-bottom-right-radius": "10px"
      }
    }
  }
}',	'{"css": {".wrap_component": {"mixin": [".vertical", ".inverse"], "style": {"width": "10%", "border-bottom-right-radius": "10px"}}}}',	'{"lg-deu": "Id", "lg-eng": "Id", "lg-fra": "Id", "lg-ita": "Id", "lg-spa": "Id"}'),
(15362799,	'dd814',	'dd773',	'dd247',	'no',	'si',	'si',	5,	'dd',	'no',	NULL,	NULL,	NULL,	'{"lg-cat": "Projecte", "lg-deu": "Projekt", "lg-eng": "Project", "lg-fra": "Projet", "lg-ita": "Progetto", "lg-spa": "Proyecto"}'),
(15362800,	'dd1460',	'dd1455',	'dd91',	'no',	'si',	'si',	5,	'dd',	'no',	'[{"dd9":"dd1458"}]',	'',	'null',	'{"lg-cat": "Llistat", "lg-deu": "Liste", "lg-eng": "List", "lg-fra": "Liste", "lg-spa": "Listado"}'),
(15362801,	'dd1183',	'dd1179',	'dd9',	'no',	'si',	'si',	4,	'dd',	'si',	NULL,	'{
  "css": {
    ".wrap_component": {
      "mixin": [
        ".vertical"
      ],
      "style": {
        "width": "35%"
      }
    }
  }
}',	'{"css": {".wrap_component": {"mixin": [".vertical"], "style": {"width": "35%"}}}}',	'{"lg-deu": "Beschreibung", "lg-eng": "Description", "lg-fra": "Description", "lg-ita": "Descrizione", "lg-spa": "Descripción"}'),
(15362802,	'dd1461',	'dd1455',	'dd177',	'no',	'si',	'si',	3,	'dd',	'no',	NULL,	'',	'null',	'{"lg-cat": "Nou", "lg-deu": "Neu", "lg-eng": "New", "lg-fra": "Nouveau", "lg-spa": "Nuevo"}'),
(15362803,	'dd1254',	'dd622',	'dd1231',	'no',	'si',	'si',	26,	'dd',	'no',	'[{"dd592":"ww31"}]',	'{"data_to_be_used":"dato"}',	NULL,	'{"lg-spa": "other_images"}'),
(15362804,	'dd1191',	'dd1101',	'dd1231',	'no',	'si',	'si',	21,	'dd',	'no',	'[{"dd11":"dd1188"}]',	NULL,	NULL,	'{"lg-spa": "typlogy"}'),
(15362805,	'dd1193',	'dd1137',	'dd347',	'no',	'si',	'si',	2,	'dd',	'no',	'[{"dd1229":"dd600"}]',	NULL,	NULL,	'{"lg-spa": "template_map"}'),
(15362806,	'dd1194',	'dd1137',	'dd347',	'no',	'si',	'si',	11,	'dd',	'no',	'[{"dd6":"hierarchy1"},{"dd1229":"hierarchy79"}]',	NULL,	NULL,	'{"lg-spa": "hierarchy"}'),
(15362807,	'dd1462',	'dd1455',	'dd247',	'no',	'si',	'si',	2,	'dd',	'no',	NULL,	'',	'null',	'{"lg-cat": "Projecte", "lg-deu": "Projekt", "lg-eng": "Project", "lg-fra": "Projet", "lg-spa": "Proyecto"}'),
(15362808,	'dd976',	'dd137',	'dd6',	'no',	'si',	'si',	18,	'dd',	'no',	'[{"dd626":"dd963"}]',	'',	NULL,	'{"lg-cat": "Relació aspecte", "lg-deu": "Bildformat", "lg-eng": "Aspect ratio", "lg-fra": "Rapport d''aspect", "lg-ita": "Relazione aspetto", "lg-spa": "Relación aspecto"}'),
(15362809,	'dd1386',	'dd1192',	'dd1231',	'no',	'si',	'si',	10,	'dd',	'si',	'[{"dd9":"dd1465"}]',	'{
  "data_to_be_used": "dato"
}',	NULL,	'{"lg-spa": "css_mod"}'),
(15362810,	'dd1463',	'dd1455',	'dd581',	'no',	'si',	'si',	6,	'dd',	'no',	NULL,	'',	'null',	'{"lg-cat": "Darrers canvis", "lg-deu": "Letzte Änderungen", "lg-eng": "Last changes", "lg-fra": "Dernières modifications", "lg-spa": "Ulitmos cambios"}'),
(15362811,	'dd1186',	'dd1178',	'dd177',	'no',	'si',	'si',	3,	'dd',	'no',	NULL,	NULL,	NULL,	'{"lg-deu": "Neu", "lg-eng": "New", "lg-fra": "Nouveau", "lg-ita": "Nuovo", "lg-spa": "Nuevo"}'),
(15362812,	'dd1387',	'dd1192',	'dd1231',	'no',	'si',	'si',	13,	'dd',	'si',	'[{"dd318":"dd1402"}]',	'',	'null',	'{"lg-spa": "abstract"}'),
(15362813,	'dd1096',	'dd1076',	'dd18',	'no',	'si',	'si',	1,	'dd',	'si',	NULL,	'',	'null',	'{"lg-spa": "Web Dédalo"}'),
(15362814,	'dd1187',	'dd1178',	'dd183',	'no',	'si',	'si',	4,	'dd',	'no',	NULL,	NULL,	NULL,	'{"lg-deu": "Löschen", "lg-eng": "Delete", "lg-fra": "Supprimer", "lg-ita": "Cancellare", "lg-spa": "Borrar"}'),
(15362815,	'dd200',	'dd196',	'dd11',	'no',	'si',	'si',	1,	'dd',	'no',	'[{"dd6":"dd128"},{"dd9":"dd132"},{"dd9":"dd452"},{"dd1747":"dd330"}]',	'',	NULL,	'{"lg-cat": "Creat per l&#039;usuari", "lg-deu": "Durch Benutzer erstellt", "lg-ell": "Δημιουργήθηκε από το χρήστη", "lg-eng": "Created by user", "lg-fra": "Créé par un utilisateur", "lg-ita": "Creato per utente", "lg-nep": "प्रयोगकर्ता द्वारा बनाईएको", "lg-spa": "Creado por usuario"}'),
(15362816,	'dd596',	'dd585',	'dd580',	'no',	'si',	'si',	5,	'dd',	'no',	NULL,	'{"css":{".wrap_component":{"mixin":[".vertical"],"style":{"width":"100%","height":"75vh"}}}}',	NULL,	'{"lg-cat": "Configuració", "lg-deu": "Konfiguration", "lg-ell": "Διαμόρφωση", "lg-eng": "Configuration", "lg-fra": "Configuration", "lg-ita": "Configurazione", "lg-spa": "Configuración"}'),
(15362817,	'dd513',	'dd128',	'dd58',	'no',	'si',	'si',	4,	'dd',	'no',	'[{"dd9":"dd132"},{"dd10":"dd135"}]',	'',	NULL,	'{"lg-cat": "Llistat de relacions", "lg-deu": "Liste der Beziehungen", "lg-eng": "Relation list", "lg-fra": "Liste des relations", "lg-ita": "Lista delle relazioni", "lg-spa": "Lista de relaciones"}'),
(15362818,	'dd477',	'dd1453',	'dd6',	'no',	'si',	'si',	1,	'dd',	'no',	NULL,	'',	'null',	'{"lg-cat": "Plantilles web", "lg-deu": "Web-Vorlagen", "lg-ell": "Πρότυπα ιστού", "lg-eng": "Web templates", "lg-fra": "Modèles web", "lg-ita": "Modelli web", "lg-spa": "Plantillas web"}'),
(15362819,	'dd1102',	'dd1137',	'dd1229',	'no',	'si',	'si',	7,	'dd',	'no',	'[{"dd6":"dd821"}]',	NULL,	NULL,	'{"lg-spa": "method"}'),
(15362820,	'dd801',	'dd773',	'dd10',	'no',	'si',	'si',	4,	'dd',	'si',	NULL,	NULL,	'{"css": {".wrapper_component": {"grid-column": "span 10"}}}',	'{"lg-deu": "Beschreibung", "lg-eng": "Description", "lg-fra": "Description", "lg-ita": "Descrizione", "lg-spa": "Descripción"}'),
(15362821,	'dd1329',	'dd1631',	'dd57',	'no',	'si',	'si',	13,	'dd',	'no',	'[{"dd6":"dd64"},{"dd9":"dd62"}]',	'{"css":{".wrap_component":{"mixin":[".vertical"],"style":{"width":"15%"}}}}',	'{"css": {".wrap_component": {"mixin": [".vertical"], "style": {"width": "15%"}}}}',	'{"lg-deu": "freigegebene Werkzeuge", "lg-eng": "Tools allowed", "lg-fra": "Outils autorisés", "lg-spa": "Tools allowed"}'),
(15362822,	'dd1204',	'dd1198',	'dd9',	'no',	'si',	'si',	3,	'dd',	'si',	NULL,	'{
  "css": {
    ".wrap_component": {
      "mixin": [
        ".vertical"
      ],
      "style": {
        "width": "65%"
      }
    }
  }
}',	'{"css": {".wrap_component": {"mixin": [".vertical"], "style": {"width": "65%"}}}}',	'{"lg-deu": "Beschreibung", "lg-eng": "Description", "lg-fra": "Description", "lg-ita": "Descrizione", "lg-spa": "Descripción"}'),
(15362823,	'dd849',	'dd1631',	'dd580',	'no',	'si',	'si',	9,	'dd',	'no',	NULL,	'{"css":{".wrap_component":{"mixin":[".vertical"],"style":{"width":"100%","height":"25vh"}}}}',	'{"css": {".wrap_component": {"mixin": [".vertical"], "style": {"width": "100%", "height": "25vh"}}}}',	'{"lg-deu": "Beispiel", "lg-eng": "Example", "lg-fra": "Exemple", "lg-ita": "Esempio", "lg-spa": "Ejemplo"}'),
(15362824,	'dd1202',	'dd1198',	'dd1747',	'no',	'si',	'si',	1,	'dd',	'no',	NULL,	'{
  "css": {
    ".wrap_component": {
      "mixin": [
        ".vertical",
        ".inverse"
      ],
      "style": {
        "width": "10%",
        "border-bottom-right-radius": "10px"
      }
    }
  }
}',	'{"css": {".wrap_component": {"mixin": [".vertical", ".inverse"], "style": {"width": "10%", "border-bottom-right-radius": "10px"}}}}',	'{"lg-deu": "Id", "lg-eng": "Id", "lg-fra": "Id", "lg-ita": "Id", "lg-spa": "Id"}'),
(15362825,	'dd896',	'dd1198',	'dd9',	'no',	'si',	'si',	4,	'dd',	'no',	NULL,	'{
  "css": {
    ".wrap_component": {
      "mixin": [
        ".vertical"
      ],
      "style": {
        "width": "15%"
      }
    }
  }
}',	'{"css": {".wrap_component": {"mixin": [".vertical"], "style": {"width": "15%"}}}}',	'{"lg-deu": "Referenz", "lg-eng": "Reference", "lg-fra": "Référence", "lg-ita": "Riferimento", "lg-spa": "Referencia"}'),
(15362826,	'dd871',	'dd868',	'dd9',	'no',	'si',	'si',	3,	'dd',	'no',	NULL,	'{
  "css": {
    ".wrap_component": {
      "mixin": [
        ".vertical"
      ],
      "style": {
        "width": "35%"
      }
    }
  }
}',	'{"css": {".wrap_component": {"mixin": [".vertical"], "style": {"width": "35%"}}}}',	'{"lg-deu": "Name", "lg-eng": "Name", "lg-fra": "Prénom", "lg-ita": "Nome", "lg-spa": "Nombre"}'),
(15362827,	'dd1205',	'dd1198',	'dd580',	'no',	'si',	'si',	6,	'dd',	'no',	NULL,	'{
  "css": {
    ".wrap_component": {
      "mixin": [
        ".vertical"
      ],
      "style": {
        "width": "100%",
        "height": "40vh"
      }
    }
  }
}',	'{"css": {".wrap_component": {"mixin": [".vertical"], "style": {"width": "100%", "height": "40vh"}}}}',	'{"lg-deu": "Beschreibung Beispiel", "lg-eng": "Example description", "lg-fra": "Exemple de description", "lg-ita": "Descrizione esempio", "lg-spa": "Descripción ejemplo"}'),
(15362828,	'dd155',	'dd154',	'dd9',	'no',	'si',	'si',	3,	'dd',	'no',	'',	'{"css":{".wrap_component":{"mixin":[".vertical"],"style":{"width":"20%"}},".content_data":{"style":{}}}}',	'{"css": {".wrapper_component": {"grid-column": "span 3"}}}',	'{"lg-cat": "Codi del projecte", "lg-deu": "Projektcode", "lg-ell": "Κωδικός έργου", "lg-eng": "Project code", "lg-fra": "Code du projet", "lg-ita": "Codice del progetto", "lg-spa": "Código del proyecto"}'),
(15362829,	'dd42',	'dd137',	'dd6',	'no',	'si',	'si',	2,	'dd',	'no',	'[{"dd626":"dd963"}]',	'',	NULL,	'{"lg-cat": "Events d&#039;activitat", "lg-deu": "Aktivitätsereignisse", "lg-eng": "Activity events", "lg-fra": "Activités récentes", "lg-ita": "Eventi di attività", "lg-spa": "Eventos de actividad"}'),
(15362830,	'dd1241',	'dd922',	'dd58',	'no',	'si',	'si',	6,	'dd',	'no',	'[{"dd9":"dd924"}]',	NULL,	NULL,	'{"lg-cat": "Llistat relacions", "lg-deu": "Liste Beziehungen", "lg-eng": "Relation list", "lg-fra": "Liste de relations", "lg-ita": "Elenco relazioni", "lg-spa": "Listado relaciones"}'),
(15362831,	'dd635',	'dd440',	'null',	'si',	'si',	'si',	4,	'dd',	'si',	'',	'',	NULL,	'{"lg-spa": "component_date"}'),
(15362832,	'dd66',	'dd440',	'null',	'si',	'si',	'si',	2,	'dd',	'si',	'',	'',	NULL,	'{"lg-spa": "component_geolocation"}'),
(15362833,	'dd580',	'dd440',	NULL,	'si',	'si',	'si',	48,	'dd',	'no',	NULL,	NULL,	NULL,	'{"lg-spa": "component_json"}'),
(15362834,	'dd686',	'dd440',	NULL,	'si',	'si',	'si',	49,	'dd',	'si',	NULL,	NULL,	NULL,	'{"lg-spa": "component_svg"}'),
(15362835,	'dd1391',	'dd1100',	'dd8',	'no',	'si',	'si',	2,	'dd',	'si',	NULL,	NULL,	'{"css": {".content_data": {"grid-template-columns": "repeat(10, 1fr)"}}}',	'{"lg-deu": "Allgemein", "lg-eng": "General", "lg-fra": "Général", "lg-spa": "General"}'),
(15362836,	'dd1379',	'dd147',	'dd395',	'no',	'si',	'si',	18,	'dd',	'si',	NULL,	'{
  "name": "references"
}',	'{"name": "references"}',	'{"lg-cat": "Referències", "lg-deu": "Referenzen", "lg-eng": "References", "lg-fra": "Références", "lg-nep": "सन्दर्भहरू", "lg-spa": "Referencias"}'),
(15362837,	'dd271',	'dd196',	'dd635',	'no',	'si',	'si',	5,	'dd',	'no',	'null',	'{
  "date_mode": "date",
  "info": "Component data is stored as date time but managed as date for search"
}',	'{"info": "Component data is stored as date time but managed as date for search", "date_mode": "date"}',	'{"lg-cat": "Primera publicació", "lg-deu": "Erste Publikation", "lg-ell": "πρώτη δημοσίευση", "lg-eng": "First publication", "lg-fra": "Première publication", "lg-ita": "Prima pubblicazione", "lg-nep": "पहिलो प्रकाशन", "lg-spa": "Primera publicación"}'),
(15362838,	'dd1392',	'dd1100',	'dd8',	'no',	'si',	'si',	3,	'dd',	'si',	NULL,	'',	'null',	'{"lg-deu": "Beziehungen", "lg-eng": "Relations", "lg-fra": "Relations", "lg-spa": "Relaciones"}'),
(15362839,	'dd562',	'dd137',	'dd6',	'no',	'si',	'si',	32,	'dd',	'no',	'[{"dd626":"dd963"}]',	NULL,	NULL,	'{"lg-cat": "Marc de dada actiu", "lg-deu": "Aktiver Dataframe", "lg-ell": "Ενεργό πλαίσιο δεδομένων", "lg-eng": "Dataframe active", "lg-fra": "Cadre de données des actifs", "lg-ita": "Quadro del dato attivo", "lg-spa": "Marco de dato activo"}'),
(15362840,	'dd269',	'dd74',	'null',	'si',	'si',	'si',	1,	'dd',	'no',	'',	NULL,	NULL,	'{"lg-spa": "list_head"}'),
(15362841,	'dd1206',	'dd614',	'null',	'si',	'si',	'no',	12,	'dd',	'no',	'',	NULL,	NULL,	'{"lg-spa": "diffusion_mupreva_ficha_fm"}'),
(15362842,	'dd1352',	'dd1302',	'dd1235',	'no',	'si',	'si',	5,	'dd',	'no',	'[{"dd592":"dd1275"}]',	'{
  "varchar": 4000
}',	'{"varchar": 4000}',	'{"lg-spa": "video"}'),
(15362843,	'dd270',	'dd74',	'null',	'si',	'si',	'si',	2,	'dd',	'no',	'',	NULL,	NULL,	'{"lg-spa": "list_row"}'),
(15362844,	'dd64',	'dd137',	'dd6',	'no',	'si',	'si',	1,	'dd',	'no',	'[{"dd626":"dd963"}]',	'',	NULL,	'{"lg-cat": "Sí / No", "lg-deu": "Ja/Nein", "lg-ell": "Ναι/Όχι", "lg-eng": "Yes/No", "lg-fra": "Oui/Non", "lg-ita": "Si/No", "lg-nep": "हो होइन", "lg-spa": "Si/No"}'),
(15362845,	'dd1304',	'dd1302',	'dd1231',	'no',	'si',	'si',	2,	'dd',	'no',	'[{"dd9":"dd1276"}]',	NULL,	NULL,	'{"lg-spa": "name"}'),
(15362846,	'dd790',	'dd1553',	'dd395',	'no',	'si',	'si',	1,	'dd',	'si',	'',	'{
  "name": "tool_lang"
}',	'{"name": "tool_lang"}',	'{"lg-cat": "Llenguatge", "lg-deu": "Sprache", "lg-ell": "γλώσσα", "lg-eng": "Language", "lg-fra": "Langage", "lg-ita": "Linguaggio", "lg-spa": "Lenguaje"}'),
(15362847,	'dd208',	'dd137',	'dd6',	'no',	'si',	'si',	11,	'dd',	'si',	'[{"dd626":"dd963"}]',	'',	NULL,	'{"lg-cat": "Tipologia d''activitats", "lg-deu": "Typologie der Aktivitäten", "lg-eng": "Type of activities", "lg-fra": "Typologie des activités", "lg-ita": "Tipologia di attività", "lg-spa": "Tipología de actividades"}'),
(15362848,	'dd1305',	'dd1302',	'dd1231',	'no',	'si',	'si',	3,	'dd',	'no',	'[{"dd11":"dd1288"}]',	NULL,	NULL,	'{"lg-spa": "video_type"}'),
(15362849,	'dd1306',	'dd1302',	'dd1231',	'no',	'si',	'si',	4,	'dd',	'no',	'[{"dd10":"dd1277"}]',	NULL,	NULL,	'{"lg-spa": "description"}'),
(15362850,	'dd354',	'dd322',	'dd4',	'no',	'si',	'si',	2,	'dd',	'si',	'',	'',	NULL,	'{"lg-cat": "Patrimoni Artístic", "lg-deu": "Künstlerisches Erbe", "lg-eng": "Artistic heritage", "lg-eus": "Ondare artistiko", "lg-fra": "Patrimoine artistique", "lg-ita": "Patrimonio artistico", "lg-spa": "Patrimonio Artístico"}'),
(15362851,	'dd1244',	'dd1453',	'dd6',	'no',	'si',	'si',	6,	'dd',	'si',	'[{"dd6":"dd623"}]',	'',	'null',	'{"lg-cat": "Configuracions de visualització", "lg-deu": "Visualisierungskonfigurationen", "lg-eng": "Layout map (request config) presets", "lg-fra": "Paramètres d''affichage", "lg-ita": "Configurazioni di visualizzazione", "lg-spa": "Configuraciones de visualización"}'),
(15362852,	'dd833',	'dd137',	'dd6',	'no',	'si',	'si',	12,	'dd',	'no',	'[{"dd626":"dd963"}]',	'',	NULL,	'{"lg-cat": "Difusió", "lg-deu": "Verbreitung", "lg-eng": "Diffusion", "lg-fra": "Diffusion", "lg-ita": "Diffusione", "lg-spa": "Difusión"}'),
(15362853,	'dd1294',	'dd1293',	'dd1235',	'no',	'si',	'si',	7,	'dd',	'no',	'[{"dd592":"rsc88"}]',	'{
  "varchar": 4000
}',	'{"varchar": 4000}',	'{"lg-spa": "image"}'),
(15362854,	'dd1293',	'dd1137',	'dd1229',	'no',	'si',	'si',	14,	'dd',	'no',	'[{"dd6":"dd1290"}]',	'',	NULL,	'{"lg-spa": "team"}'),
(15362855,	'dd1307',	'dd1137',	'dd347',	'no',	'si',	'si',	16,	'dd',	'no',	'[{"dd1229":"rsc275"}]',	NULL,	NULL,	'{"lg-spa": "audiovisual"}'),
(15362856,	'dd1101',	'dd1137',	'dd1229',	'no',	'si',	'si',	6,	'dd',	'no',	'[{"dd6":"dd772"}]',	NULL,	NULL,	'{"lg-spa": "component"}'),
(15362857,	'dd1295',	'dd1293',	'dd1231',	'no',	'si',	'si',	2,	'dd',	'si',	'[{"dd9":"rsc85"}]',	NULL,	NULL,	'{"lg-spa": "name"}'),
(15362858,	'dd1296',	'dd1293',	'dd1231',	'no',	'si',	'si',	3,	'dd',	'no',	'[{"dd9":"rsc86"}]',	NULL,	NULL,	'{"lg-spa": "surname"}'),
(15362859,	'dd1258',	'dd1137',	'dd1229',	'no',	'si',	'si',	12,	'dd',	'no',	'[{"dd6":"dd1241"}]',	NULL,	NULL,	'{"lg-spa": "projects"}'),
(15362860,	'dd1374',	'dd785',	'dd395',	'no',	'si',	'si',	59,	'dd',	'si',	NULL,	'{"name":"diameter"}',	'{"name": "diameter"}',	'{"lg-cat": "Diàmetre", "lg-deu": "Durchmesser", "lg-ell": "Διάμετρος", "lg-eng": "Diameter", "lg-fra": "Diamètre", "lg-ita": "Diametro", "lg-spa": "Diámetro"}'),
(15362861,	'dd1297',	'dd1293',	'dd1231',	'no',	'si',	'si',	4,	'dd',	'no',	'[{"dd530":"rsc94"}]',	NULL,	NULL,	'{"lg-spa": "profession"}'),
(15362862,	'dd689',	'dd622',	'dd1235',	'no',	'si',	'si',	5,	'dd',	'si',	'[{"dd9":"ww11"}]',	'{"varchar":255}',	NULL,	'{"lg-spa": "term"}'),
(15362863,	'dd1298',	'dd1293',	'dd1231',	'no',	'si',	'si',	5,	'dd',	'no',	'[{"dd530":"rsc95"}]',	NULL,	NULL,	'{"lg-spa": "job_title"}'),
(15362864,	'dd1299',	'dd1293',	'dd1231',	'no',	'si',	'si',	6,	'dd',	'no',	'[{"dd10":"rsc99"}]',	NULL,	NULL,	'{"lg-spa": "observations"}'),
(15362865,	'dd1261',	'dd1258',	'dd1231',	'no',	'si',	'si',	2,	'dd',	'no',	'[{"dd9":"dd1254"}]',	NULL,	NULL,	'{"lg-spa": "name"}'),
(15362866,	'dd1262',	'dd1258',	'dd1231',	'no',	'si',	'si',	3,	'dd',	'no',	'[{"dd500":"dd1256"}]',	NULL,	NULL,	'{"lg-spa": "site"}'),
(15362867,	'dd1290',	'dd449',	'dd395',	'no',	'si',	'si',	13,	'dd',	'si',	'null',	'{
  "name": "code"
}',	'{"name": "code"}',	'{"lg-cat": "Codi", "lg-deu": "Code", "lg-eng": "Code", "lg-fra": "Code", "lg-spa": "Código"}'),
(15362868,	'dd1300',	'dd1293',	'dd1233',	'no',	'si',	'si',	1,	'dd',	'no',	'[{"dd339":"rsc279"}]',	'{
  "info": "For construct the ENUM value of the field, it need to be changed from the -dato- (without language) to the final -enum- value, dato:enumvalue",
  "data_to_be_used": "dato",
  "enum": {
    "1": "true",
    "2": "false"
  }
}',	'{"enum": {"1": "true", "2": "false"}, "info": "For construct the ENUM value of the field, it need to be changed from the -dato- (without language) to the final -enum- value, dato:enumvalue", "data_to_be_used": "dato"}',	'{"lg-spa": "publication"}'),
(15362869,	'dd1263',	'dd1258',	'dd1231',	'no',	'si',	'si',	4,	'dd',	'si',	'[{"dd10":"dd1255"}]',	NULL,	NULL,	'{"lg-spa": "descripton"}'),
(15362870,	'dd157',	'dd154',	'dd530',	'no',	'si',	'si',	5,	'dd',	'no',	'[{"dd6":"dd1318"},{"dd9":"dd1320"}]',	'{"limit":1,"css":{".wrap_component":{"mixin":[".width_50",".vertical",".line_top"],"style":{"clear":"left"}},".label":{"style":{}},".content_data":{"style":{}}}}',	'{"css": {".wrapper_component": {"grid-column": "span 2"}}, "limit": 1}',	'{"lg-cat": "Tipologia", "lg-deu": "Typologie", "lg-ell": "τυπολογία", "lg-eng": "Typology", "lg-fra": "Typologie", "lg-ita": "Tipologia", "lg-spa": "Tipología"}'),
(15362871,	'dd482',	'dd73',	'dd8',	'no',	'si',	'si',	3,	'dd',	'no',	'null',	NULL,	'{"css": {".content_data": {"grid-template-columns": "repeat(10, 10%)"}}}',	'{"lg-deu": "Ontologie", "lg-ell": "Οντολογία", "lg-eng": "Ontology", "lg-fra": "Ontologie", "lg-ita": "Ontologia", "lg-spa": "Ontología"}'),
(15362872,	'dd1265',	'dd622',	'dd1231',	'no',	'si',	'si',	33,	'dd',	'no',	'[{"dd10":"ww45"}]',	NULL,	NULL,	'{"lg-spa": "space_frame"}'),
(15362873,	'dd1324',	'dd32',	'dd6',	'no',	'si',	'si',	4,	'dd',	'no',	'[{"dd6":"dd73"}]',	NULL,	NULL,	'{"lg-deu": "Werkzeugverzeichnis", "lg-eng": "Registered tools", "lg-fra": "Enregistrement des outils", "lg-nep": "दर्ता उपकरणहरू", "lg-spa": "Registro de herramientas"}'),
(15362874,	'dd1264',	'dd1258',	'dd1235',	'no',	'si',	'si',	5,	'dd',	'no',	'[{"dd592":"dd1257"}]',	'{
  "varchar": 4000
}',	'{"varchar": 4000}',	'{"lg-spa": "project_images"}'),
(15362875,	'dd1266',	'dd770',	'dd6',	'no',	'si',	'si',	4,	'dd',	'no',	'[{"dd626":"dd963"}]',	NULL,	NULL,	'{"lg-deu": "TLD", "lg-eng": "TLD", "lg-fra": "TLD", "lg-spa": "TLD"}'),
(15362876,	'dd203',	'dd137',	'dd6',	'no',	'si',	'si',	23,	'dd',	'si',	'[{"dd626":"dd963"}]',	'',	NULL,	'{"lg-cat": "Processos de tractament textual", "lg-deu": "Textverarbeitungsprozesse", "lg-eng": "Word processing processes", "lg-fra": "Procédés de traitement de texte", "lg-ita": "Processi del trattamento del testo", "lg-spa": "Procesos de tratamiento de texto"}'),
(15362877,	'dd460',	'dd137',	'dd6',	'no',	'si',	'si',	28,	'dd',	'no',	'[{"dd626":"dd963"}]',	NULL,	NULL,	'{"lg-cat": "Unitats de Mesura", "lg-deu": "Masseinheiten", "lg-eng": "Measurement units", "lg-fra": "Unités de mesures", "lg-ita": "Unità di misura", "lg-spa": "Unidades de Medida"}'),
(15362878,	'dd594',	'dd585',	'dd9',	'no',	'si',	'si',	3,	'dd',	'no',	NULL,	'{
  "css": {
    ".wrap_component": {
      "mixin": [
        ".vertical"
      ],
      "style": {
        "width": "30%"
      }
    }
  }
}',	'{"css": {".wrap_component": {"mixin": [".vertical"], "style": {"width": "30%"}}}}',	'{"lg-cat": "Nom", "lg-deu": "Name", "lg-ell": "Όνομα", "lg-eng": "Name", "lg-fra": "Prénom", "lg-ita": "Nome", "lg-spa": "Nombre"}'),
(15362879,	'dd1493',	'dd1137',	'dd347',	'no',	'si',	'si',	4,	'dd',	'si',	'[{"dd1229":"dd1472"},{"dd6":"dd1560"}]',	NULL,	NULL,	'{"lg-spa": "ontology_commons"}'),
(15362880,	'dd903',	'dd1198',	'dd580',	'no',	'si',	'si',	5,	'dd',	'no',	NULL,	'{
  "css": {
    ".wrap_component": {
      "mixin": [
        ".vertical"
      ],
      "style": {
        "width": "100%",
        "height": "40vh"
      }
    }
  }
}',	'{"css": {".wrap_component": {"mixin": [".vertical"], "style": {"width": "100%", "height": "40vh"}}}}',	'{"lg-deu": "Beispiel", "lg-eng": "Example", "lg-fra": "Exemple ", "lg-ita": "Esempio", "lg-spa": "Ejemplo"}'),
(15362881,	'dd1199',	'dd1197',	'dd91',	'no',	'si',	'si',	2,	'dd',	'no',	'[{"dd9":"dd1204"},{"dd9":"dd896"}]',	'{
  "css": {
    ".column_dd1204": {
      "style": {
        "width": "75%"
      }
    },
    ".column_dd896": {
      "style": {
        "width": "25%"
      }
    }
  }
}',	'{"css": {".column_dd896": {"style": {"width": "25%"}}, ".column_dd1204": {"style": {"width": "75%"}}}}',	'{"lg-deu": "Liste der Beispiele", "lg-eng": "Examples list", "lg-fra": "Liste d''exemples", "lg-ita": "Elenco degli esempi", "lg-spa": "Lista de ejemplos"}'),
(15362882,	'dd691',	'dd622',	'dd1235',	'no',	'si',	'si',	6,	'dd',	'si',	'[{"dd9":"ww12"}]',	'{"varchar":128}',	NULL,	'{"lg-spa": "web_path"}'),
(15362883,	'dd701',	'dd622',	'dd1235',	'no',	'si',	'si',	7,	'dd',	'si',	'[{"dd11":"ww13"}]',	'{"varchar":255}',	NULL,	'{"lg-spa": "template_name"}'),
(15362884,	'dd702',	'dd622',	'dd1231',	'no',	'si',	'si',	8,	'dd',	'si',	'[{"dd9":"ww18"}]',	NULL,	NULL,	'{"lg-spa": "title"}'),
(15362885,	'dd636',	'dd622',	'dd1231',	'no',	'si',	'si',	23,	'dd',	'si',	'[{"dd58":"ww40"}]',	'{"process_dato":"diffusion_sql::resolve_value","process_dato_arguments":{"target_component_tipo":"hierarchy40","component_method":"get_dato"}}',	NULL,	'{"lg-spa": "indexations_related"}'),
(15362886,	'dd703',	'dd622',	'dd1231',	'no',	'si',	'si',	9,	'dd',	'si',	'[{"dd318":"ww20"}]',	NULL,	NULL,	'{"lg-spa": "abstract"}'),
(15362887,	'dd704',	'dd622',	'dd1231',	'no',	'si',	'si',	11,	'dd',	'si',	'[{"dd318":"ww21"}]',	NULL,	NULL,	'{"lg-spa": "body"}'),
(15362888,	'dd712',	'dd622',	'dd1231',	'no',	'si',	'si',	18,	'dd',	'si',	'[{"dd592":"ww22"}]',	'{"data_to_be_used":"dato"}',	NULL,	'{"lg-spa": "image"}'),
(15362889,	'dd1184',	'dd1179',	'dd247',	'no',	'si',	'si',	5,	'dd',	'no',	NULL,	'{
  "css": {
    ".wrap_component": {
      "mixin": [
        ".vertical"
      ],
      "style": {
        "width": "30%"
      }
    }
  }
}',	'{"css": {".wrap_component": {"mixin": [".vertical"], "style": {"width": "30%"}}}}',	'{"lg-deu": "Projekt", "lg-eng": "Project", "lg-fra": "Projet", "lg-ita": "Progetto", "lg-spa": "Proyecto"}'),
(15362890,	'dd1482',	'dd1473',	'dd9',	'no',	'si',	'si',	4,	'dd',	'no',	NULL,	'{"read_only":"read_only","css":{".wrap_component":{"mixin":[".vertical"],"style":{"width":"30%","background-color":"#FFE2AB","border-right":"1px solid #d0d0d0"}}}}',	'{"css": {".wrapper_component": {"grid-column": "span 2"}}}',	'{"lg-deu": "tld", "lg-eng": "tld", "lg-fra": "tld", "lg-spa": "tld"}'),
(15362891,	'dd1500',	'dd770',	'dd6',	'no',	'si',	'si',	2,	'dd',	'no',	'[{"dd626":"dd963"},{"dd6":"dd1558"}]',	NULL,	'{"color": "#28946c"}',	'{"lg-deu": "Ontologie", "lg-eng": "Ontology", "lg-fra": "Ontologie", "lg-nep": "ओन्टोलजी", "lg-spa": "Ontología"}'),
(15362892,	'dd1417',	'dd1192',	'dd1231',	'no',	'si',	'si',	12,	'dd',	'si',	'[{"dd9":"dd1401"}]',	'',	'null',	'{"lg-spa": "title"}'),
(15362893,	'dd1410',	'dd1392',	'dd429',	'no',	'si',	'si',	1,	'dd',	'no',	'[{"dd352":"dd1409"}]',	'{"css":{".wrap_component":{"mixin":[".vertical"],"style":{"width":"25%"}}}}',	'{"source": {"records_mode": "list", "request_config": [{"sqo": {"section_tipo": [{"source": "self"}]}, "show": {"ddo_map": [{"tipo": "dd1399", "parent": "self", "section_tipo": "self", "value_with_parents": true}, {"tipo": "dd1401", "parent": "self", "section_tipo": "hierarchy1"}]}}]}}',	'{"lg-deu": "Vater", "lg-eng": "Parent", "lg-fra": "Père", "lg-spa": "Padre"}'),
(15362894,	'dd869',	'dd868',	'dd1747',	'no',	'si',	'si',	1,	'dd',	'no',	NULL,	'{
  "css": {
    ".wrap_component": {
      "mixin": [
        ".vertical",
        ".inverse"
      ],
      "style": {
        "width": "10%",
        "border-bottom-right-radius": "10px"
      }
    }
  }
}',	'{"css": {".wrap_component": {"mixin": [".vertical", ".inverse"], "style": {"width": "10%", "border-bottom-right-radius": "10px"}}}}',	'{"lg-deu": "Id", "lg-eng": "Id", "lg-fra": "Id", "lg-ita": "Id", "lg-spa": "Id"}'),
(15362895,	'dd1180',	'dd1179',	'dd1747',	'no',	'si',	'si',	1,	'dd',	'no',	NULL,	'{
  "css": {
    ".wrap_component": {
      "mixin": [
        ".vertical",
        ".inverse"
      ],
      "style": {
        "width": "10%",
        "border-bottom-right-radius": "10px"
      }
    }
  }
}',	'{"css": {".wrap_component": {"mixin": [".vertical", ".inverse"], "style": {"width": "10%", "border-bottom-right-radius": "10px"}}}}',	'{"lg-deu": "Id", "lg-eng": "Id", "lg-fra": "Id", "lg-ita": "Id", "lg-spa": "Id"}'),
(15362896,	'dd1243',	'dd637',	'dd1747',	'no',	'si',	'si',	1,	'dd',	'no',	NULL,	'{"css":{".wrap_component":{"mixin":[".vertical",".inverse"],"style":{"width":"10%","border-bottom-right-radius":"10px"}}}}',	NULL,	'{"lg-cat": "Id", "lg-deu": "Id", "lg-eng": "Id", "lg-fra": "Id", "lg-ita": "Id", "lg-spa": "Id"}'),
(15362897,	'dd1344',	'dd1343',	'dd1747',	'no',	'si',	'si',	1,	'dd',	'no',	NULL,	'{
  "css": {
    ".wrap_component": {
      "mixin": [
        ".vertical",
        ".inverse"
      ],
      "style": {
        "width": "10%",
        "border-bottom-right-radius": "8px"
      }
    }
  }
}',	'{"css": {".wrap_component": {"mixin": [".vertical", ".inverse"], "style": {"width": "10%", "border-bottom-right-radius": "8px"}}}}',	'{"lg-deu": "Id", "lg-eng": "Id", "lg-fra": "Id", "lg-spa": "Id"}'),
(15362898,	'dd591',	'dd585',	'dd1747',	'no',	'si',	'si',	1,	'dd',	'no',	NULL,	'{
  "css": {
    ".wrap_component": {
      "mixin": [
        ".vertical",
        ".inverse"
      ],
      "style": {
        "width": "10%",
        "border-bottom-right-radius": "8px",
        "background-color": "rgb(255, 164, 61)"
      }
    }
  }
}',	'{"css": {".wrap_component": {"mixin": [".vertical", ".inverse"], "style": {"width": "10%", "background-color": "rgb(255, 164, 61)", "border-bottom-right-radius": "8px"}}}}',	'{"lg-cat": "Id", "lg-deu": "Id", "lg-ell": "Id", "lg-eng": "Id", "lg-fra": "Id", "lg-ita": "Id", "lg-spa": "Id"}'),
(15362899,	'dd604',	'dd363',	'dd8',	'no',	'si',	'si',	1,	'dd',	'no',	NULL,	'',	'null',	'{"lg-deu": "Wert aus der Liste", "lg-eng": "Value of the list", "lg-fra": "Valeur de la liste", "lg-spa": "Valor de la lista"}'),
(15362900,	'dd554',	'dd1553',	'dd395',	'no',	'si',	'si',	4,	'dd',	'si',	NULL,	'{
  "name": "tool_lang_multi"
}',	'{"name": "tool_lang_multi"}',	'{"lg-cat": "Multi-llenguatge", "lg-deu": "Mehrsprachig", "lg-eng": "Multi-language", "lg-fra": "Multi-langues", "lg-ita": "Multi-linguaggio", "lg-spa": "Multi-lenguaje"}'),
(15362901,	'dd216',	'dd785',	'dd395',	'no',	'si',	'si',	18,	'dd',	'si',	'',	'{"name":"numero_recurso"}',	'{"name": "numero_recurso"}',	'{"lg-cat": "Nombre del recurs", "lg-deu": "Ressourcennummer", "lg-ell": "Resource αριθμό", "lg-eng": "Number of resource", "lg-fra": "Numéro de ressource", "lg-ita": "Numero della risorsa", "lg-spa": "Número del recurso"}'),
(15362902,	'dd651',	'dd785',	'dd395',	'no',	'si',	'si',	43,	'dd',	'si',	NULL,	'{"name":"campos"}',	'{"name": "fields"}',	'{"lg-cat": "Camps", "lg-deu": "Felder", "lg-ell": "Πεδία", "lg-eng": "Fields", "lg-fra": "Champs", "lg-ita": "Campi", "lg-nep": "क्षेत्रहरू", "lg-spa": "Campos"}'),
(15362903,	'dd1477',	'dd1473',	'dd9',	'no',	'si',	'si',	7,	'dd',	'si',	NULL,	'{"css":{".wrap_component":{"mixin":[".vertical",".line_top"],"style":{"width":"85%"}}}}',	'{"css": {".wrapper_component": {"grid-column": "span 4"}}}',	'{"lg-deu": "Begriff", "lg-eng": "Term", "lg-fra": "Terme", "lg-spa": "Término"}'),
(15362904,	'dd1483',	'dd1473',	'dd9',	'no',	'si',	'si',	5,	'dd',	'no',	NULL,	'{"read_only":"read_only","css":{".wrap_component":{"mixin":[".vertical"],"style":{"width":"15%","background-color":"#FFE2AB","border-right":"1px solid #d0d0d0"}}}}',	'{"css": {".wrapper_component": {"grid-column": "span 2"}}}',	'{"lg-deu": "Id", "lg-eng": "Id", "lg-fra": "Id", "lg-spa": "id"}'),
(15362905,	'dd1384',	'dd363',	'dd247',	'no',	'si',	'si',	2,	'dd',	'no',	NULL,	NULL,	NULL,	'{"lg-deu": "Projekt", "lg-eng": "Project", "lg-fra": "Projet", "lg-spa": "Proyecto"}'),
(15362906,	'dd1385',	'dd363',	'dd91',	'no',	'si',	'si',	3,	'dd',	'no',	'[{"dd9":"dd1383"}]',	'',	'null',	'{"lg-deu": "Liste", "lg-eng": "List", "lg-fra": "Listé", "lg-spa": "Llistado"}'),
(15362907,	'dd1560',	'dd770',	'dd6',	'no',	'si',	'si',	3,	'dd',	'si',	'[{"dd626":"dd963"},{"dd6":"dd1558"}]',	NULL,	NULL,	'{"lg-deu": "Gemeinsame Ontologie", "lg-eng": "Ontology commons", "lg-fra": "Ontologie commune", "lg-spa": "Ontology commons"}'),
(15362908,	'dd771',	'dd1631',	'dd4',	'no',	'si',	'si',	2,	'dd',	'si',	NULL,	NULL,	NULL,	'{"lg-deu": "Dokumentation", "lg-eng": "Documentation", "lg-fra": "Documentation", "lg-ita": "Documentazione", "lg-spa": "Documentación"}'),
(15362909,	'dd1100',	'dd770',	'dd6',	'no',	'si',	'si',	7,	'dd',	'no',	'[{"dd626":"dd425"}]',	'',	'null',	'{"lg-deu": "web dedalo", "lg-eng": "web dedalo", "lg-fra": "Dedalo web", "lg-spa": "web dedalo"}'),
(15362910,	'dd1060',	'dd363',	'dd177',	'no',	'si',	'si',	4,	'dd',	'no',	'null',	'',	'null',	'{"lg-cat": "Nou", "lg-deu": "Neu", "lg-ell": "Νέος", "lg-eng": "New", "lg-fra": "Nouveau", "lg-ita": "Nuovo", "lg-spa": "Nuevo"}'),
(15362911,	'dd1354',	'dd1325',	'dd57',	'no',	'si',	'si',	2,	'dd',	'no',	'[{"dd6":"dd64"},{"dd9":"dd62"}]',	'{"dato_default":[{"section_id":"1","section_tipo":"dd64"}],"css":{".wrap_component":{"mixin":[".vertical"],"style":{"width":"20%"}}}}',	'{"css": {".wrapper_component": {"grid-column": "span 1"}}, "dato_default": [{"section_id": "1", "section_tipo": "dd64"}]}',	'{"lg-deu": "Aktiv", "lg-eng": "Active", "lg-fra": "Actif", "lg-spa": "Activo"}'),
(15362912,	'dd600',	'dd348',	'dd1229',	'no',	'si',	'si',	2,	'dd',	'si',	'[{"dd6":"dd477"}]',	'',	'null',	'{"lg-spa": "template_map"}'),
(15362913,	'dd640',	'dd637',	'dd57',	'no',	'si',	'si',	8,	'dd',	'no',	'[{"dd6":"dd64"},{"dd9":"dd62"}]',	'{"dato_default":{"section_id":"2","section_tipo":"dd64"},"css":{".wrap_component":{"mixin":[".vertical"],"style":{"width":"15%"}}}}',	'{"dato_default": {"section_id": "2", "section_tipo": "dd64"}}',	'{"lg-cat": "Públic", "lg-deu": "öffentlich", "lg-eng": "Public", "lg-fra": "Public", "lg-ita": "Pubblico", "lg-spa": "Público"}'),
(15362914,	'dd60',	'dd7',	'dd1743',	'no',	'si',	'si',	2,	'dd',	'no',	'',	'{
  "diffusion": {
    "class_name": "diffusion_section_stats"
  }
}',	'{"diffusion": {"class_name": "diffusion_section_stats"}}',	'{"lg-deu": "Statistiken", "lg-spa": "Estadísticas"}'),
(15362915,	'dd1436',	'dd1453',	'dd6',	'no',	'si',	'si',	2,	'dd',	'si',	'[{"dd6":"dd477"}]',	'',	'null',	'{"lg-cat": "Rendeadors web", "lg-deu": "Web-Renderer", "lg-eng": "Web renderers", "lg-fra": "Concepteurs de sites web", "lg-spa": "Rendeadores web"}'),
(15362916,	'dd1245',	'dd1244',	'dd91',	'no',	'si',	'si',	1,	'dd',	'si',	'[{"dd9":"dd1242"},{"dd9":"dd642"},{"dd11":"dd654"},{"dd9":"dd1246"}]',	'',	'null',	'{"lg-deu": "Liste", "lg-eng": "List", "lg-fra": "Liste", "lg-ita": "Elenco", "lg-spa": "List"}'),
(15362917,	'dd1476',	'dd1473',	'dd10',	'no',	'si',	'si',	13,	'dd',	'si',	'null',	'{"css":{".wrap_component":{"mixin":[".vertical"],"style":{"width":"100%"}}}}',	'{"css": {".wrapper_component": {"grid-column": "span 10"}, ".wrapper_component >.content_data": {"max-height": "30rem"}}}',	'{"lg-deu": "Beobachtungen", "lg-eng": "Observations", "lg-fra": "Observations", "lg-spa": "Observaciones"}'),
(15362918,	'dd1337',	'dd1325',	'dd247',	'no',	'si',	'si',	11,	'dd',	'no',	NULL,	'{"css":{".wrap_component":{"mixin":[".vertical"],"style":{"width":"20%"}}}}',	'{"css": {".wrap_component": {"style": {"width": "20%"}}}}',	'{"lg-deu": "Projekt", "lg-eng": "Project", "lg-fra": "Projet", "lg-spa": "Proyecto"}'),
(15362919,	'dd1550',	'dd785',	'dd395',	'no',	'si',	'si',	67,	'dd',	'si',	NULL,	'{"name":"tool_import_marc21"}',	'{"name": "tool_import_marc21"}',	'{"lg-cat": "Importar MARC 21", "lg-deu": "MARC 21 importieren", "lg-eng": "Import MARC 21", "lg-fra": "Importer MARC 21", "lg-spa": "Importar MARC 21"}'),
(15362920,	'dd1328',	'dd1325',	'dd9',	'no',	'si',	'si',	6,	'dd',	'no',	NULL,	'{"css":{".wrap_component":{"mixin":[".vertical"],"style":{"width":"10%"}}}}',	'{"css": {".wrapper_component": {"grid-column": "span 1"}}}',	'{"lg-deu": "Minimale Dédalo-Version", "lg-eng": "Dédalo version minimum", "lg-fra": "Version minimale de Dédalo", "lg-spa": "Versión Dédalo mínima"}'),
(15362921,	'dd1327',	'dd1325',	'dd9',	'no',	'si',	'si',	5,	'dd',	'no',	NULL,	'{"css":{".wrap_component":{"mixin":[".vertical"],"style":{"width":"10%"}}}}',	'{"css": {".wrapper_component": {"grid-column": "span 1"}}}',	'{"lg-deu": "Version", "lg-eng": "Version", "lg-fra": "Version", "lg-spa": "Versión"}'),
(15362922,	'dd1353',	'dd1325',	'dd580',	'no',	'si',	'si',	10,	'dd',	'no',	NULL,	'{"css":{".wrap_component":{"mixin":[".vertical"],"style":{"width":"70%","height":"80vh"}}}}',	'{"css": {".wrapper_component": {"grid-column": "span 10"}, ".wrapper_component >.content_data": {"min-height": "80vh"}}}',	'{"lg-deu": "Einfaches Werkzeug Objekt", "lg-eng": "Simple tool object", "lg-fra": "Objet outil simple", "lg-spa": "Simple tool object"}'),
(15362923,	'dd45',	'dd1190',	'dd17',	'no',	'si',	'si',	2,	'dd',	'si',	'',	NULL,	NULL,	'{"lg-spa": "default"}'),
(15362924,	'dd303',	'dd2',	'null',	'si',	'si',	'si',	5,	'dd',	'no',	'',	'',	NULL,	'{"lg-spa": "relation_root"}'),
(15362925,	'dd193',	'dd1',	'dd194',	'no',	'si',	'si',	13,	'dd',	'si',	'',	'',	NULL,	'{"lg-cat": "Eines", "lg-deu": "Werkzeuge", "lg-eng": "Tools", "lg-fra": "Outils", "lg-ita": "Strumenti", "lg-spa": "Herramientas"}'),
(15362926,	'dd1270',	'dd1',	'dd37',	'no',	'si',	'si',	12,	'dd',	'no',	NULL,	NULL,	NULL,	'{"lg-deu": "Externe Ontologien", "lg-eng": "External ontologies", "lg-fra": "Ontologies externes", "lg-spa": "Ontologías externas"}'),
(15362927,	'dd999',	'dd1581',	'dd580',	'no',	'si',	'si',	2,	'dd',	'no',	'null',	'{"css":{".wrap_component":{"mixin":[".vertical"],"style":{"width":"50%","height":"80vh"}}}}',	'{"css": {".wrapper_component": {"grid-column": "span 10"}, ".wrapper_component >.content_data": {"min-height": "60vh"}}}',	'{"lg-cat": "Configuració", "lg-deu": "Konfiguration", "lg-ell": "Διαμόρφωση", "lg-eng": "Configuration", "lg-fra": "Configuration", "lg-ita": "Configurazione", "lg-spa": "Configuración"}'),
(15362928,	'dd1577',	'dd236',	'dd1747',	'no',	'si',	'si',	1,	'dd',	'no',	NULL,	'{"css":{".wrap_component":{"mixin":[".vertical",".inverse"],"style":{"width":"8%","border-bottom-right-radius":"8px"}}}}',	'{"css": {".wrapper_component": {"grid-column": "span 1"}}}',	'{"lg-deu": "Id", "lg-eng": "Id", "lg-fra": "Id", "lg-spa": "ID"}'),
(15362929,	'dd237',	'dd236',	'dd9',	'no',	'si',	'si',	2,	'dd',	'si',	'',	'{"css":{".wrap_component":{"mixin":[".vertical"],"style":{"width":"92%"}}}}',	'{"css": {".wrapper_component": {"grid-column": "span 9"}}}',	'{"lg-cat": "Nom", "lg-deu": "Name", "lg-ell": "όνομα", "lg-eng": "Name", "lg-fra": "Prénom", "lg-ita": "Nome", "lg-spa": "Nombre"}'),
(15362930,	'dd238',	'dd236',	'dd10',	'no',	'si',	'si',	3,	'dd',	'si',	'',	'{"css":{".wrap_component":{"mixin":[".vertical"],"style":{"width":"100%"}}}}',	'{"css": {".wrapper_component": {"grid-column": "span 10"}, ".wrapper_component > .content_data": {"min-height": "8rem"}}}',	'{"lg-cat": "Descripció", "lg-deu": "Beschreibung", "lg-ell": "περιγραφή", "lg-eng": "Description", "lg-fra": "Description", "lg-ita": "Descrizione", "lg-spa": "Descripción"}'),
(15362931,	'dd1420',	'dd1192',	'dd1235',	'no',	'si',	'si',	7,	'dd',	'si',	'[{"dd9":"dd1393"}]',	'{
  "varchar": 128
}',	'{"varchar": 128}',	'{"lg-spa": "web_path"}'),
(15362932,	'dd1067',	'dd272',	'dd783',	'no',	'si',	'si',	1,	'dd',	'no',	'[{"dd6":"dd1324"},{"dd9":"dd799"}]',	NULL,	'{"view": "tools"}',	'{"lg-cat": "Eines", "lg-deu": "Werkzeuge", "lg-ell": "εργαλεία", "lg-eng": "Tools", "lg-fra": "Outils", "lg-ita": "Strumenti", "lg-spa": "Herramientas"}'),
(15362933,	'dd1421',	'dd1192',	'dd1235',	'no',	'si',	'si',	4,	'dd',	'si',	'[{"dd9":"dd1399"}]',	'{
  "varchar": 255
}',	'{"varchar": 256}',	'{"lg-spa": "term"}'),
(15362934,	'dd968',	'dd1340',	'dd1129',	'no',	'si',	'si',	2,	'dd',	'no',	'[{"dd580":"dd1353"}]',	NULL,	NULL,	'{"lg-deu": "Ausgeschlossene", "lg-eng": "Exclude", "lg-fra": "Exclure", "lg-spa": "Exclude"}'),
(15362935,	'dd1084',	'dd537',	'dd395',	'no',	'si',	'si',	11,	'dd',	'si',	'',	'{"name":"el_archivo_subido_excede_el_tamano_maximo"}',	'{"name": "uploaded_file_exceeds_the_maximum_size"}',	'{"lg-cat": "El fitxer carregat excedeix la mida màxima permès", "lg-deu": "Das Volumen der hochgeladenen Datei überschreitet die maximal zugelssene Dateigrösse.", "lg-ell": "Το αρχείο που μεταφορτώθηκε υπερβαίνει το μέγιστο επιτρεπόμενο μέγεθος", "lg-eng": "The uploaded file exceeds the maximum size allowed", "lg-fra": "Le fichier téléchargé dépasse la taille maximale autorisée", "lg-ita": "L''archivio caricato supera la grandezza massima consentita", "lg-spa": "El archivo subido excede el tamaño máximo permitido"}'),
(15362936,	'dd215',	'dd539',	'dd395',	'no',	'si',	'si',	6,	'dd',	'si',	'',	'{
  "name": "numero_inventario"
}',	'{"name": "numero_inventario"}',	'{"lg-cat": "Número d''inventari", "lg-deu": "Inventarnummer", "lg-ell": "Αριθμός απογραφής", "lg-eng": "Inventory number", "lg-fra": "Numéro d''inventaire", "lg-ita": "Numero d''inventario", "lg-spa": "Número de inventario"}'),
(15362937,	'dd1422',	'dd1192',	'dd1235',	'no',	'si',	'si',	8,	'dd',	'si',	'[{"dd11":"dd1394"}]',	'{
  "varchar": 255
}',	'{"varchar": 500}',	'{"lg-spa": "template_name"}'),
(15362938,	'dd1152',	'dd1192',	'dd1231',	'no',	'si',	'si',	15,	'dd',	'si',	'[{"dd1229":"dd1139"}]',	'',	'null',	'{"lg-spa": "code"}'),
(15362939,	'dd1358',	'dd785',	'dd395',	'no',	'si',	'si',	54,	'dd',	'si',	NULL,	'{"name":"formato"}',	'{"name": "format"}',	'{"lg-cat": "Format", "lg-deu": "Format", "lg-ell": "Μορφή", "lg-eng": "Format", "lg-fra": "Format", "lg-nep": "ढाँचा", "lg-spa": "Formato"}'),
(15362940,	'dd1154',	'dd1101',	'dd1231',	'no',	'si',	'si',	17,	'dd',	'no',	'[{"dd592":"dd813"}]',	'{
  "process_dato": "diffusion_sql::resolve_value",
  "process_dato_arguments": {
    "target_component_tipo": "dd871",
    "component_method": "get_diffusion_value"
  }
}',	'{"process_dato": "diffusion_sql::resolve_value", "process_dato_arguments": {"component_method": "get_diffusion_value", "target_component_tipo": "dd871"}}',	'{"lg-spa": "ref_property_name"}'),
(15362941,	'dd1156',	'dd1101',	'dd1231',	'no',	'si',	'si',	19,	'dd',	'no',	'[{"dd592":"dd813"}]',	'{
  "process_dato": "diffusion_sql::resolve_value",
  "process_dato_arguments": {
    "target_component_tipo": "dd897",
    "component_method": "get_diffusion_value"
  }
}',	'{"process_dato": "diffusion_sql::resolve_value", "process_dato_arguments": {"component_method": "get_diffusion_value", "target_component_tipo": "dd897"}}',	'{"lg-spa": "ref_property_description"}'),
(15362942,	'dd796',	'dd773',	'dd9',	'no',	'si',	'si',	2,	'dd',	'no',	'null',	NULL,	'{"css": {".wrapper_component": {"grid-column": "span 5"}}}',	'{"lg-cat": "Nom", "lg-deu": "Name", "lg-eng": "Name", "lg-fra": "Nom", "lg-ita": "Nome", "lg-spa": "Nombre"}'),
(15362943,	'dd1424',	'dd1192',	'dd1231',	'no',	'si',	'si',	18,	'dd',	'si',	'[{"dd352":"dd1409"}]',	'{
  "data_to_be_used_DES": "dato",
  "process_dato": "diffusion_sql::map_locator_to_terminoID"
}',	'{"process_dato": "diffusion_sql::map_locator_to_terminoID", "data_to_be_used_DES": "dato"}',	'{"lg-spa": "children"}'),
(15362944,	'dd1425',	'dd1192',	'dd1230',	'no',	'si',	'si',	20,	'dd',	'si',	'[{"dd429":"dd1410"}]',	'{
  "process_dato": "diffusion_sql::map_parent_to_norder"
}',	'null',	'{"lg-spa": "norder"}'),
(15362945,	'dd85',	'dd193',	'dd95',	'no',	'si',	'si',	8,	'dd',	'no',	'',	'',	NULL,	'{"lg-deu": "Menu", "lg-eng": "Menu", "lg-fra": "Menu", "lg-nep": "मेनु", "lg-spa": "Menú"}'),
(15362946,	'dd1598',	'dd883',	'dd1747',	'no',	'si',	'si',	1,	'dd',	'no',	NULL,	'{"css":{".wrap_component":{"mixin":[".vertical",".inverse"],"style":{"width":"10%","border-bottom-right-radius":"8px"}}}}',	'{"css": {".wrapper_component": {"grid-column": "span 1"}}}',	'{"lg-cat": "Id", "lg-deu": "Id", "lg-eng": "Id", "lg-fra": "Id", "lg-ita": "Id", "lg-spa": "Id"}'),
(15362947,	'dd1431',	'dd1192',	'dd1235',	'no',	'si',	'si',	9,	'dd',	'si',	'[{"dd11":"dd1389"}]',	'{
  "varchar": 500
}',	'{"varchar": 500}',	'{"lg-spa": "node_class"}'),
(15362948,	'dd1370',	'numisdata298',	'dd1235',	'no',	'si',	'si',	13,	'dd',	'si',	'[{"dd635":"numisdata35"}]',	'{"process_dato":"diffusion_sql::split_date_range","process_dato_arguments":{"selected_key":0,"selected_date":"end","date_format":"year"},"varchar":16}',	NULL,	'{"lg-spa": "date_out"}'),
(15362949,	'dd1197',	'dd771',	'dd6',	'no',	'si',	'si',	6,	'dd',	'no',	'[{"dd626":"dd963"}]',	NULL,	NULL,	'{"lg-deu": "Beispiele", "lg-eng": "Examples", "lg-fra": "Exemples", "lg-ita": "Esempi", "lg-spa": "Ejemplos"}'),
(15362950,	'dd117',	'dd2',	'null',	'si',	'si',	'si',	1,	'dd',	'no',	'',	'',	NULL,	'{"lg-spa": "root"}'),
(15362951,	'dd204',	'dd117',	'null',	'si',	'si',	'si',	13,	'dd',	'no',	'',	NULL,	NULL,	'{"lg-spa": "install"}'),
(15362952,	'dd832',	'dd118',	'dd395',	'no',	'si',	'si',	4,	'dd',	'si',	'null',	'{"name":"por_favor_espere"}',	'{"name": "por_favor_espere"}',	'{"lg-cat": "Si us plau, espereu", "lg-deu": "Bitte warten", "lg-ell": "Παρακαλώ περιμένετε", "lg-eng": "Please wait", "lg-fra": "Veuillez patienter", "lg-ita": "Per favore, attenda", "lg-spa": "Por favor, espere"}'),
(15362953,	'dd825',	'dd391',	'dd395',	'no',	'si',	'si',	51,	'dd',	'si',	'',	'{"name":"existente"}',	'{"name": "existente"}',	'{"lg-cat": "existent", "lg-deu": "Existent", "lg-ell": "υπάρχουσες", "lg-eng": "existing", "lg-fra": "existants", "lg-ita": "Esistente", "lg-spa": "existente"}'),
(15362954,	'dd854',	'dd391',	'dd395',	'no',	'si',	'si',	53,	'dd',	'si',	'',	'{"name":"mostrar_inspector"}',	'{"name": "mostrar_inspector"}',	'{"lg-cat": "Mostra Inspector", "lg-deu": "Inspektor anzeigen", "lg-ell": "Εμφάνιση Επιθεωρητής", "lg-eng": "Toggle Inspector", "lg-fra": "Afficher l''inspecteur", "lg-ita": "Mostrare controllore", "lg-nep": "इन्स्पेक्टर टगल गर्नुहोस्", "lg-spa": "Mostrar Inspector"}'),
(15362955,	'dd613',	'dd342',	'dd395',	'no',	'si',	'si',	16,	'dd',	'si',	'',	'{"name":"export_json_ontology"}',	'{"name": "export_json_ontology"}',	'{"lg-cat": "Exportar Ontologia JSON", "lg-deu": "JSON-Ontologie exportieren", "lg-ell": "εξαγωγή json οντολογίας", "lg-eng": "Export JSON Ontology", "lg-fra": "Exporter Ontologie JSON", "lg-ita": "Esporta l''Ontologia JSON", "lg-spa": "Exportar Ontología JSON"}'),
(15362956,	'dd830',	'dd390',	'dd395',	'no',	'si',	'si',	20,	'dd',	'si',	'',	'{"name":"borrar_solo_el_vinculo"}',	'{"name": "delete_only_the_link"}',	'{"lg-cat": "Esborrar només el vincle", "lg-deu": "Nur Verknüpfungen löschen", "lg-ell": "Διαγράψτε μόνο το σύνδεσμο", "lg-eng": "Delete only link", "lg-fra": "Suppression du lien uniquement", "lg-ita": "Cancellare solo il collegamento", "lg-nep": "लिङ्क मात्र मेटाउनुहोस्", "lg-spa": "Borrar sólo el vínculo"}'),
(15362957,	'dd131',	'dd129',	'dd57',	'no',	'si',	'si',	2,	'dd',	'no',	'[{"dd6":"dd64"},{"dd9":"dd62"}]',	'{"css":{".wrap_component":{"mixin":[".vertical"],"style":{"width":"12%"}},".content_data":{"style":{}}}}',	'{"css": {".wrapper_component": {"grid-row": "1", "box-shadow": "none", "grid-column": "span 1"}}}',	'{"lg-cat": "Compte actiu", "lg-deu": "Aktiver Account", "lg-ell": "ενεργό λογαριασμό", "lg-eng": "Active account", "lg-eus": "Kontu aktiboa", "lg-fra": "Compte actif", "lg-ita": "Account attivo", "lg-spa": "Cuenta activa"}'),
(15362958,	'dd1596',	'dd196',	'dd487',	'no',	'si',	'si',	9,	'dd',	'no',	NULL,	NULL,	NULL,	'{"lg-cat": "Relacions", "lg-deu": "Beziehungen", "lg-ell": "Συγγένειες", "lg-eng": "Relations", "lg-fra": "Relations", "lg-ita": "Relazioni", "lg-nep": "सम्बन्धहरू", "lg-spa": "Relaciones"}'),
(15362959,	'dd1398',	'dd1391',	'dd339',	'no',	'si',	'si',	2,	'dd',	'no',	'[{"dd6":"dd64"},{"dd9":"dd62"}]',	'{"dato_default":[{"section_id":"1","section_tipo":"dd64"}],"css":{".wrap_component":{"mixin":[".vertical"],"style":{"width":"10%"}}}}',	'{"css": {".wrapper_component": {"grid-column": "span 1"}}}',	'{"lg-deu": "Öffentlich", "lg-eng": "Public", "lg-fra": "Public", "lg-spa": "Público"}'),
(15362960,	'dd1393',	'dd1390',	'dd9',	'no',	'si',	'si',	2,	'dd',	'no',	NULL,	'{
  "css": {
    ".wrap_component": {
      "mixin": [
        ".vertical"
      ],
      "style": {
        "width": "20%"
      }
    }
  }
}',	'{"css": {".wrap_component": {"mixin": [".vertical"], "style": {"width": "25%"}}}}',	'{"lg-deu": "URI-Seite Pfad", "lg-eng": "Page URI path", "lg-fra": "Page URI path", "lg-spa": "Página URI path"}'),
(15362961,	'dd1586',	'dd389',	'dd395',	'no',	'si',	'si',	32,	'dd',	'no',	NULL,	'{"name":"error_invalid_date_format"}',	'{"name": "error_invalid_date_format"}',	'{"lg-cat": "Error: format de data invalid", "lg-ell": "Σφάλμα: Η μορφή ημερομηνίας δεν είναι έγκυρη", "lg-eng": "Error: Date format is invalid", "lg-fra": "Erreur : Format de date non valide", "lg-nep": "त्रुटि: मिति ढाँचा अमान्य छ", "lg-spa": "Error: formato de fecha invalido"}'),
(15362962,	'dd192',	'dd539',	'dd395',	'no',	'si',	'si',	5,	'dd',	'si',	'',	'{
  "name": "nombre_fichero_completo"
}',	'{"name": "nombre_fichero_completo"}',	'{"lg-cat": "Nom complet del fitxer", "lg-deu": "Vollständiger Dateiname", "lg-ell": "πλήρες όνομα του αρχείου", "lg-eng": "Full name of the file", "lg-fra": "Nom complet du dossier", "lg-ita": "Nome completo del file", "lg-spa": "Nombre completo del fichero"}'),
(15362963,	'dd1064',	'dd785',	'dd395',	'no',	'si',	'si',	4,	'dd',	'si',	'null',	'{
  "name": "average"
}',	'{"name": "average"}',	'{"lg-cat": "Mitjana", "lg-deu": "Medien", "lg-ell": "μέσος", "lg-eng": "Average", "lg-fra": "Moyenne ", "lg-ita": "Media", "lg-nep": "औसत", "lg-spa": "Media"}'),
(15362964,	'dd1544',	'dd622',	'dd1231',	'no',	'si',	'si',	14,	'dd',	'si',	'[{"dd429":"ww28"}]',	'{"process_dato":"diffusion_sql::map_locator_to_terminoID","process_dato_arguments":{"custom_arguments":{"add_parents":true}}}',	NULL,	'{"lg-spa": "parents"}'),
(15362965,	'dd1257',	'dd622',	'dd1235',	'no',	'si',	'si',	31,	'dd',	'no',	'[{"dd635":"ww38"}]',	'{"process_dato":"diffusion_sql::split_date_range","process_dato_arguments":{"selected_key":0,"selected_date":"end","date_format":"unix_timestamp"},"varchar":16}',	NULL,	'{"lg-spa": "date_out"}'),
(15362966,	'dd996',	'dd207',	'dd6',	'no',	'si',	'si',	5,	'dd',	'no',	'[{"dd6":"dd73"}]',	NULL,	NULL,	'{"lg-cat": "Configuració de eines", "lg-deu": "Werkzeugkonfiguration", "lg-ell": "Διαμόρφωση εργαλείων", "lg-eng": "Tools configuration", "lg-fra": "Configuration des outils", "lg-ita": "Configurazione degli strumenti", "lg-nep": "उपकरण कन्फिगरेसन", "lg-spa": "Configuración de herramientas"}'),
(15362967,	'dd1440',	'dd1453',	'dd6',	'no',	'si',	'si',	3,	'dd',	'si',	'[{"dd6":"dd477"}]',	'',	'null',	'{"lg-cat": "Elements web", "lg-deu": "Web-Elemente", "lg-eng": "Web elements", "lg-fra": "Éléments du web", "lg-spa": "Elementos web"}'),
(15362968,	'dd1441',	'dd1440',	'dd91',	'no',	'si',	'si',	1,	'dd',	'si',	'[{"dd339":"dd593"},{"dd9":"dd594"},{"dd1017":"dd595"},{"dd580":"dd596"}]',	'',	'null',	'{"lg-deu": "Liste", "lg-eng": "List", "lg-fra": "Liste", "lg-spa": "list"}'),
(15362969,	'dd1545',	'dd622',	'dd1231',	'no',	'si',	'si',	16,	'dd',	'si',	'[{"dd352":"ww27"}]',	'{"process_dato":"diffusion_sql::map_locator_to_terminoID"}',	NULL,	'{"lg-spa": "children"}'),
(15362970,	'dd22',	'dd627',	'dd626',	'no',	'si',	'si',	12,	'dd',	'no',	'',	'{
  "inverse_relations": true
}',	'{"inverse_relations": true}',	'{"lg-spa": "matrix_list"}'),
(15362971,	'dd1435',	'dd1192',	'dd1231',	'no',	'si',	'si',	30,	'dd',	'si',	'[{"dd500":"dd1434"}]',	'',	'null',	'{"lg-spa": "link"}'),
(15362972,	'dd1443',	'dd1192',	'dd1231',	'no',	'si',	'si',	17,	'dd',	'si',	'[{"dd429":"dd1410"}]',	'{"option_obj":{"add_parents":true}}',	NULL,	'{"lg-spa": "parents"}'),
(15362973,	'dd1378',	'dd1455',	'dd183',	'no',	'si',	'si',	4,	'dd',	'no',	'null',	NULL,	NULL,	'{"lg-cat": "Esborrar", "lg-deu": "Löschen", "lg-ell": "Διαγραφή", "lg-eng": "Delete", "lg-fra": "Supprimer", "lg-ita": "Cancellare", "lg-spa": "Borrar"}'),
(15362974,	'dd895',	'dd911',	'dd183',	'no',	'si',	'si',	5,	'dd',	'si',	'',	'',	'null',	'{"lg-deu": "Löschen", "lg-eng": "Delete", "lg-fra": "Supprimer", "lg-spa": "Borrar"}'),
(15362975,	'dd1380',	'dd118',	'dd395',	'no',	'si',	'si',	11,	'dd',	'si',	NULL,	'{"name":"elminar_contenido"}',	'{"name": "delete_content"}',	'{"lg-cat": "Eliminar el contingut", "lg-deu": "Inhalt löschen", "lg-ell": "Διαγράψτε το περιεχόμενο", "lg-eng": "Delete the content", "lg-fra": "Éliminer le contenu", "lg-spa": "Elminar el contenido"}'),
(15362976,	'dd1444',	'dd1192',	'dd1235',	'no',	'si',	'si',	11,	'dd',	'si',	'[{"dd11":"dd1430"}]',	'{
  "varchar": 128
}',	'null',	'{"lg-spa": "renderer"}'),
(15362977,	'dd1447',	'dd770',	'dd6',	'no',	'si',	'si',	8,	'dd',	'no',	NULL,	NULL,	NULL,	'{"lg-deu": "Toponymie-Prozessor", "lg-eng": "Toponymy processor", "lg-fra": "Traitement de la toponymie", "lg-spa": "Procesador de toponimia"}'),
(15362978,	'dd1507',	'dd785',	'dd395',	'no',	'si',	'si',	63,	'dd',	'si',	NULL,	'{
  "name": "exportar_jerarquias"
}',	'{"name": "exportar_jerarquias"}',	'{"lg-deu": "Hierarchien exportieren", "lg-eng": "Export hierarchies", "lg-fra": "Exporter les hiérarchies", "lg-nep": "पदानुक्रम निर्यात गर्नुहोस्", "lg-spa": "Exportar jerarquias"}'),
(15362979,	'dd1464',	'dd1456',	'dd9',	'no',	'si',	'si',	3,	'dd',	'no',	NULL,	'{"css":{".wrap_component":{"mixin":[".vertical"],"style":{"width":"20%"}}}}',	'{"css": {".wrapper_component": {"grid-column": "span 2"}}}',	'{"lg-cat": "Codificació", "lg-deu": "Codierung", "lg-eng": "Coding", "lg-fra": "Codification", "lg-spa": "Codificación"}'),
(15362980,	'dd1457',	'dd1456',	'dd1747',	'no',	'si',	'si',	1,	'dd',	'si',	NULL,	'{"css":{".wrap_component":{"mixin":[".vertical",".inverse"],"style":{"width":"10%","border-bottom-right-radius":"8px"}}}}',	'{"css": {".wrapper_component": {"grid-column": "span 1"}}}',	'{"lg-cat": "Id", "lg-deu": "Id", "lg-eng": "Id", "lg-fra": "Id", "lg-spa": "Id"}'),
(15362981,	'dd1115',	'dd1101',	'dd1231',	'no',	'si',	'si',	9,	'dd',	'no',	'[{"dd592":"dd802"}]',	'{
  "process_dato": "diffusion_sql::resolve_value",
  "process_dato_arguments": {
    "target_component_tipo": "dd931",
    "component_method": "get_diffusion_value"
  }
}',	'{"process_dato": "diffusion_sql::resolve_value", "process_dato_arguments": {"component_method": "get_diffusion_value", "target_component_tipo": "dd931"}}',	'{"lg-spa": "ref_reference"}'),
(15362982,	'dd1116',	'dd1101',	'dd1231',	'no',	'si',	'si',	10,	'dd',	'no',	'[{"dd9":"dd805"}]',	NULL,	NULL,	'{"lg-spa": "other_references"}'),
(15362983,	'dd1130',	'dd1101',	'dd1231',	'no',	'si',	'si',	14,	'dd',	'no',	'[{"dd592":"dd807"}]',	'{
  "process_dato": "diffusion_sql::resolve_value",
  "process_dato_arguments": {
    "target_component_tipo": "dd828",
    "component_method": "get_diffusion_value"
  }
}',	'{"process_dato": "diffusion_sql::resolve_value", "process_dato_arguments": {"component_method": "get_diffusion_value", "target_component_tipo": "dd828"}}',	'{"lg-spa": "ref_method_signatura"}'),
(15362984,	'dd937',	'dd918',	'dd247',	'no',	'si',	'si',	10,	'dd',	'no',	NULL,	NULL,	NULL,	'{"lg-deu": "Projekt", "lg-eng": "Project", "lg-fra": "Projet", "lg-ita": "Progetto", "lg-spa": "Proyecto"}'),
(15362985,	'dd1131',	'dd1101',	'dd1231',	'no',	'si',	'si',	15,	'dd',	'no',	'[{"dd592":"dd807"}]',	'{
  "process_dato": "diffusion_sql::resolve_value",
  "process_dato_arguments": {
    "target_component_tipo": "dd845",
    "component_method": "get_diffusion_value"
  }
}',	'{"process_dato": "diffusion_sql::resolve_value", "process_dato_arguments": {"component_method": "get_diffusion_value", "target_component_tipo": "dd845"}}',	'{"lg-spa": "ref_method_description"}'),
(15362986,	'dd1155',	'dd1101',	'dd1231',	'no',	'si',	'si',	18,	'dd',	'no',	'[{"dd592":"dd813"}]',	'{
  "process_dato": "diffusion_sql::resolve_value",
  "process_dato_arguments": {
    "target_component_tipo": "dd872",
    "component_method": "get_diffusion_value"
  }
}',	'{"process_dato": "diffusion_sql::resolve_value", "process_dato_arguments": {"component_method": "get_diffusion_value", "target_component_tipo": "dd872"}}',	'{"lg-spa": "ref_property_data_type"}'),
(15362987,	'dd1433',	'dd1192',	'dd1231',	'no',	'si',	'si',	19,	'dd',	'si',	'[{"dd431":"dd1411"}]',	'{
  "data_to_be_used_DES": "dato",
  "process_dato": "diffusion_sql::map_locator_to_terminoID"
}',	'{"process_dato": "diffusion_sql::map_locator_to_terminoID", "data_to_be_used_DES": "dato"}',	'{"lg-spa": "related"}'),
(15362988,	'dd1406',	'dd1391',	'dd592',	'no',	'si',	'si',	12,	'dd',	'no',	'[{"dd6":"rsc170"},{"dd1747":"rsc175"},{"dd339":"rsc20"},{"dd9":"rsc21"},{"dd9":"rsc23"},{"dd10":"rsc30"},{"dd749":"rsc29"}]',	'{"dragable_connectWith":"dd1404","css":{".wrap_component":{"mixin":[".vertical",".line_top"]}}}',	'{"css": {".wrapper_component": {"grid-column": "span 10"}}, "draggable_to": ["dd1404"]}',	'{"lg-deu": "Bilder", "lg-eng": "Images", "lg-fra": "Images", "lg-spa": "Imágenes"}'),
(15362989,	'dd1515',	'dd1514',	'dd347',	'no',	'si',	'si',	1,	'dd',	'si',	'[{"dd1229":"dd622"},{"dd6":"ww1"}]',	NULL,	NULL,	'{"lg-spa": "ts_web"}'),
(15362990,	'dd1426',	'dd1192',	'dd1231',	'no',	'si',	'si',	23,	'dd',	'si',	'[{"dd592":"dd1406"}]',	'{"process_dato":"diffusion_sql::resolve_value","process_dato_arguments":{"split_string_value":" | ","output":"merged","target_component_tipo":"rsc29"}}',	NULL,	'{"lg-spa": "images"}'),
(15362991,	'dd1448',	'dd1447',	'dd8',	'no',	'si',	'si',	1,	'dd',	'no',	NULL,	'',	'null',	'{"lg-deu": "Daten, Angaben", "lg-eng": "data", "lg-fra": "données", "lg-spa": "datos"}'),
(15362992,	'dd1469',	'dd1192',	'dd1235',	'no',	'si',	'si',	29,	'dd',	'si',	'[{"dd592":"dd1468"}]',	'{
  "varchar": 1024,
  "process_dato": "diffusion_sql::resolve_value",
  "process_dato_arguments": {
    "split_string_value": " | ",
    "output": "merged",
    "target_component_tipo": "rsc29",
    "DES_dato_splice_DES": [
      1
    ]
  }
}',	NULL,	'{"lg-spa": "banner"}'),
(15362993,	'dd1404',	'dd1391',	'dd592',	'no',	'si',	'si',	11,	'dd',	'no',	'[{"dd6":"rsc170"},{"dd339":"rsc20"},{"dd9":"rsc21"},{"dd9":"rsc23"},{"dd10":"rsc30"},{"dd9":"rsc31"},{"dd749":"rsc29"}]',	'{"dragable_connectWith":"dd1406","css":{".wrap_component":{"mixin":[".vertical",".line_top"]}}}',	'{"css": {".wrapper_component": {"grid-column": "span 10"}}, "draggable_to": ["dd1406"]}',	'{"lg-deu": "Identifikationsbild", "lg-eng": "Identifying image", "lg-fra": "Image d''identification", "lg-spa": "Imagen identificativa"}'),
(15362994,	'dd1434',	'dd1391',	'dd500',	'no',	'si',	'si',	16,	'dd',	'no',	NULL,	NULL,	'{"css": {".wrapper_component": {"grid-column": "span 10"}}}',	'{"lg-deu": "Link", "lg-eng": "Link", "lg-fra": "lien", "lg-spa": "link"}'),
(15362995,	'dd1402',	'dd1391',	'dd318',	'no',	'si',	'si',	7,	'dd',	'si',	NULL,	'{"css":{".wrap_component":{"mixin":[".line_top"],"style":{"width":"100%","height":"240px"}},".content_data":{"style":{}}}}',	'{"css": {".wrapper_component": {"grid-column": "span 10"}}}',	'{"lg-deu": "Abstract", "lg-eng": "Abstract", "lg-fra": "Entrée", "lg-spa": "Entradilla"}'),
(15362996,	'dd1449',	'dd1448',	'dd1747',	'no',	'si',	'si',	1,	'dd',	'no',	NULL,	'{
  "css": {
    ".wrap_component": {
      "mixin": [
        ".vertical",
        ".inverse"
      ],
      "style": {
        "width": "10%",
        "border-bottom-right-radius": "8px",
        "background-color": "rgba(44, 145, 206, 0.8)"
      }
    },
    ".css_label": {
      "style": {
        "color": "#ffffff"
      }
    }
  }
}',	'null',	'{"lg-deu": "Id", "lg-eng": "Id", "lg-fra": "Id", "lg-spa": "Id"}'),
(15362997,	'dd1450',	'dd1448',	'dd9',	'no',	'si',	'si',	2,	'dd',	'no',	NULL,	'{
  "css": {
    ".wrap_component": {
      "mixin": [
        ".vertical"
      ],
      "style": {
        "width": "40%"
      }
    }
  }
}',	'null',	'{"lg-deu": "Toponym", "lg-eng": "Place name", "lg-fra": "toponyme", "lg-spa": "toponimo"}'),
(15362998,	'dd1428',	'dd1192',	'dd1231',	'no',	'si',	'si',	27,	'dd',	'si',	'[{"dd592":"dd1408"}]',	'{
  "process_dato": "diffusion_sql::resolve_value",
  "process_dato_arguments": {
    "split_string_value": " | ",
    "output": "merged",
    "target_component_tipo": "rsc37"
  }
}',	'{"data_to_be_used": "dato"}',	'{"lg-spa": "document"}'),
(15362999,	'dd1171',	'dd1104',	'dd1233',	'no',	'si',	'si',	1,	'dd',	'no',	'[{"dd339":"dd920"}]',	'{
  "info": "For construct the ENUM value of the field, it need to be changed from the -dato- (without language) to the final -enum- value, dato:enumvalue",
  "data_to_be_used": "dato",
  "enum": {
    "1": "true",
    "2": "false"
  }
}',	'{"enum": {"1": "true", "2": "false"}, "info": "For construct the ENUM value of the field, it need to be changed from the -dato- (without language) to the final -enum- value, dato:enumvalue", "data_to_be_used": "dato"}',	'{"lg-spa": "publication"}'),
(15363000,	'dd1106',	'dd1101',	'dd1233',	'no',	'si',	'si',	2,	'dd',	'no',	'[{"dd11":"dd800"}]',	'{
  "info": "For construct the ENUM value of the field, it need to be changed from the -dato- (without language) to the final -enum- value, dato:enumvalue",
  "data_to_be_used": "dato",
  "enum": {
    "1": "true",
    "2": "false"
  }
}',	'{"enum": {"1": "si", "2": "no"}, "info": "For construct the ENUM value of the field, it need to be changed from the -dato- (without language) to the final -enum- value, dato:enumvalue", "data_to_be_used": "dato"}',	'{"lg-spa": "deprecated"}'),
(15363001,	'dd1110',	'dd1101',	'dd1231',	'no',	'si',	'si',	6,	'dd',	'no',	'[{"dd592":"dd802"}]',	NULL,	NULL,	'{"lg-spa": "version"}'),
(15363002,	'dd1111',	'dd1101',	'dd1231',	'no',	'si',	'si',	7,	'dd',	'no',	'[{"dd592":"dd802"}]',	'{
  "process_dato": "diffusion_sql::resolve_value",
  "process_dato_arguments": {
    "target_component_tipo": "dd921",
    "component_method": "get_diffusion_value"
  }
}',	'{"process_dato": "diffusion_sql::resolve_value", "process_dato_arguments": {"component_method": "get_diffusion_value", "target_component_tipo": "dd921"}}',	'{"lg-spa": "ref_version"}'),
(15363003,	'dd1112',	'dd1101',	'dd1234',	'no',	'si',	'si',	8,	'dd',	'no',	'[{"dd592":"dd802"}]',	'{
  "process_dato": "diffusion_sql::resolve_value",
  "process_dato_arguments": {
    "target_component_tipo": "dd929",
    "component_method": "get_diffusion_value"
  }
}',	'{"process_dato": "diffusion_sql::resolve_value", "process_dato_arguments": {"component_method": "get_diffusion_value", "target_component_tipo": "dd929"}}',	'{"lg-spa": "ref_creation_date"}'),
(15363004,	'dd1547',	'dd785',	'dd395',	'no',	'si',	'si',	64,	'dd',	'si',	NULL,	'{
  "name": "tool_watermark"
}',	'{"name": "tool_watermark"}',	'{"lg-cat": "Marca d''aigua", "lg-deu": "Wasserzeichen", "lg-eng": "Watermark", "lg-fra": "Filigrane", "lg-spa": "Marca de agua"}'),
(15363005,	'dd1157',	'dd1102',	'dd1233',	'no',	'si',	'si',	1,	'dd',	'no',	'[{"dd339":"dd824"}]',	'{
  "info": "For construct the ENUM value of the field, it need to be changed from the -dato- (without language) to the final -enum- value, dato:enumvalue",
  "data_to_be_used": "dato",
  "enum": {
    "1": "true",
    "2": "false"
  }
}',	'{"enum": {"1": "true", "2": "false"}, "info": "For construct the ENUM value of the field, it need to be changed from the -dato- (without language) to the final -enum- value, dato:enumvalue", "data_to_be_used": "dato"}',	'{"lg-spa": "publication"}'),
(15363006,	'dd1227',	'dd264',	'dd1233',	'no',	'si',	'si',	1,	'dd',	'no',	'[{"dd339":"dd1203"}]',	'{
  "info": "For construct the ENUM value of the field, it need to be changed from the -dato- (without language) to the final -enum- value, dato:enumvalue",
  "data_to_be_used": "dato",
  "enum": {
    "1": "true",
    "2": "false"
  }
}',	'{"enum": {"1": "true", "2": "false"}, "info": "For construct the ENUM value of the field, it need to be changed from the -dato- (without language) to the final -enum- value, dato:enumvalue", "data_to_be_used": "dato"}',	'{"lg-spa": "publication"}'),
(15363007,	'dd1512',	'dd1511',	'dd18',	'no',	'si',	'si',	1,	'dd',	'si',	NULL,	NULL,	NULL,	'{"lg-spa": "Web Dédalo demo"}'),
(15363008,	'dd1137',	'dd1099',	'dd1259',	'no',	'si',	'si',	1,	'dd',	'no',	'null',	'',	'null',	'{"lg-spa": "web_dedalo"}'),
(15363009,	'dd1429',	'dd1192',	'dd1235',	'no',	'si',	'si',	2,	'dd',	'si',	'[{"dd11":"dd1442"}]',	'{
  "varchar": 255
}',	NULL,	'{"lg-spa": "wet"}'),
(15363010,	'dd1513',	'dd1512',	'dd1743',	'no',	'si',	'si',	1,	'dd',	'si',	NULL,	'{
  "diffusion": {
    "class_name": "diffusion_mysql"
  }
}',	NULL,	'{"lg-spa": "Web Dédalo demo"}'),
(15363011,	'dd1414',	'dd1100',	'dd144',	'no',	'si',	'si',	6,	'dd',	'no',	NULL,	'[{"tipo":"dd1399","type":"term"},{"tipo":"dd1409","type":"icon","icon":"CH"},{"tipo":"dd1411","type":"icon","icon":"TR"},{"tipo":"dd1409","type":"link_childrens"}]',	'[{"tipo": "dd1399", "type": "term"}, {"icon": "CH", "tipo": "dd1409", "type": "icon"}, {"icon": "TR", "tipo": "dd1411", "type": "icon"}, {"tipo": "dd1409", "type": "link_childrens"}]',	'{"lg-deu": "Liste Thesaurus", "lg-eng": "Thesaurus list", "lg-fra": "Liste de thésaurus", "lg-spa": "Listado tesauro"}'),
(15363012,	'dd1452',	'dd1447',	'dd91',	'no',	'si',	'si',	2,	'dd',	'no',	'[{"dd9":"dd1450"},{"dd442":"dd1451"}]',	'',	'null',	'{"lg-deu": "Liste", "lg-eng": "List", "lg-fra": "Liste", "lg-spa": "Listado"}'),
(15363013,	'dd1396',	'dd1390',	'dd57',	'no',	'si',	'si',	4,	'dd',	'no',	'[{"dd6":"dd64"},{"dd9":"dd62"}]',	'{
  "dato_default": [
    {
      "section_id": "2",
      "section_tipo": "dd64"
    }
  ],
  "css": {
    ".wrap_component": {
      "mixin": [
        ".vertical"
      ],
      "style": {
        "width": "13%",
        "DES_display": "none"
      }
    }
  }
}',	'{"css": {".wrap_component": {"mixin": [".vertical"], "style": {"width": "15%", "DES_display": "none"}}}, "dato_default": [{"section_id": "1", "section_tipo": "dd64"}]}',	'{"lg-deu": "Menu-Seite", "lg-eng": "Page menu show", "lg-fra": "Page de menu", "lg-spa": "Página menú"}'),
(15363014,	'dd1138',	'dd1192',	'dd1233',	'no',	'si',	'si',	1,	'dd',	'no',	'[{"dd339":"dd1398"}]',	'{
  "info": "For construct the ENUM value of the field, it need to be changed from the -dato- (without language) to the final -enum- value, dato:enumvalue",
  "data_to_be_used": "dato",
  "enum": {
    "1": "si",
    "2": "no"
  },
  "exclude_column": true
}',	'{"enum": {"1": "si", "2": "no"}, "info": "For construct the ENUM value of the field, it need to be changed from the -dato- (without language) to the final -enum- value, dato:enumvalue", "exclude_column": true, "data_to_be_used": "dato"}',	'{"lg-spa": "publication"}'),
(15363015,	'dd1423',	'dd1192',	'dd1235',	'no',	'si',	'si',	16,	'dd',	'si',	'[{"dd429":"dd1410"}]',	'{
  "varchar": 256,
  "process_dato": "diffusion_sql::map_locator_to_terminoID_parent",
  "info": "map_locator_to_terminoID_parent force to update parent besides"
}',	'{"info": "map_locator_to_terminoID_parent force to update parent besides", "varchar": 256, "process_dato": "diffusion_sql::map_locator_to_terminoID_parent"}',	'{"lg-spa": "parent"}'),
(15363016,	'dd1514',	'dd1513',	'dd1259',	'no',	'si',	'si',	1,	'dd',	'si',	NULL,	NULL,	NULL,	'{"lg-spa": "web_dedalo_demo_dev"}'),
(15363017,	'dd1430',	'dd1390',	'dd11',	'no',	'si',	'si',	7,	'dd',	'no',	'[{"dd6":"dd1436"},{"dd9":"dd594"}]',	'{
  "css": {
    ".wrap_component": {
      "mixin": [
        ".vertical"
      ],
      "style": {
        "width": "20%"
      }
    }
  }
}',	'{"css": {".wrap_component": {"mixin": [".vertical"], "style": {"width": "20%"}}}}',	'{"lg-deu": "Block. Renderer", "lg-eng": "Block rendered", "lg-spa": "Bloque. Rendeador"}'),
(15363018,	'dd1470',	'dd862',	'dd1747',	'no',	'si',	'si',	1,	'dd',	'si',	NULL,	'{
  "css": {
    ".wrap_component": {
      "mixin": [
        ".vertical",
        ".inverse"
      ],
      "style": {
        "width": "10%",
        "border-bottom-right-radius": "8px"
      }
    }
  }
}',	NULL,	'{"lg-deu": "Id", "lg-eng": "Id", "lg-fra": "Id", "lg-spa": "Id"}'),
(15363019,	'dd795',	'dd773',	'dd1747',	'no',	'si',	'si',	1,	'dd',	'no',	'null',	NULL,	'{"css": {".wrapper_component": {"grid-row": "1", "grid-column": "span 1"}}}',	'{"lg-deu": "Id", "lg-eng": "Id", "lg-fra": "Id", "lg-ita": "Id", "lg-spa": "Id"}'),
(15363020,	'dd1188',	'dd1631',	'dd530',	'no',	'si',	'si',	1,	'dd',	'no',	'[{"dd6":"dd128"},{"dd9":"dd452"}]',	NULL,	NULL,	'{"lg-cat": "Usuari", "lg-deu": "Benutzer", "lg-eng": "User", "lg-fra": "Utilisateur", "lg-ita": "Utente", "lg-spa": "Usuario"}'),
(15363021,	'dd1516',	'dd1514',	'dd347',	'no',	'si',	'si',	2,	'dd',	'si',	'[{"dd1229":"oh66"}]',	NULL,	NULL,	'{"lg-spa": "interview"}'),
(15363022,	'dd1517',	'dd1514',	'dd347',	'no',	'si',	'si',	3,	'dd',	'si',	'[{"dd1229":"rsc275"}]',	NULL,	NULL,	'{"lg-spa": "audiovisual"}'),
(15363023,	'dd1471',	'dd862',	'dd339',	'no',	'si',	'si',	2,	'dd',	'no',	'[{"dd6":"dd64"},{"dd9":"dd62"}]',	'{
  "css": {
    ".wrap_component": {
      "mixin": [
        ".vertical"
      ],
      "style": {
        "width": "12%"
      }
    }
  }
}',	NULL,	'{"lg-deu": "Öffentlich", "lg-eng": "Public", "lg-fra": "Public", "lg-spa": "Público"}'),
(15363024,	'dd1518',	'dd1514',	'dd347',	'no',	'si',	'si',	4,	'dd',	'si',	'[{"dd1229":"rsc264"}]',	NULL,	NULL,	'{"lg-spa": "image"}'),
(15363025,	'dd1599',	'dd373',	'dd1747',	'no',	'si',	'si',	1,	'dd',	'no',	NULL,	'{"css":{".wrap_component":{"mixin":[".vertical",".inverse"],"style":{"width":"10%","border-bottom-right-radius":"8px"}}}}',	'{"css": {".wrapper_component": {"grid-column": "span 1"}}}',	'{"lg-cat": "Id", "lg-eng": "Id", "lg-fra": "Id", "lg-spa": "Id"}'),
(15363026,	'dd1519',	'dd1514',	'dd347',	'no',	'si',	'si',	5,	'dd',	'si',	'[{"dd1229":"rsc267"}]',	NULL,	NULL,	'{"lg-spa": "informant"}'),
(15363027,	'dd1520',	'dd1514',	'dd347',	'no',	'si',	'si',	6,	'dd',	'si',	'[{"dd1229":"hierarchy65"},{"dd6":"aa1"}]',	NULL,	NULL,	'{"lg-spa": "ts_anthropology"}'),
(15363028,	'dd1524',	'dd1309',	'dd1747',	'no',	'si',	'si',	1,	'dd',	'no',	'null',	NULL,	'{"css": {".wrapper_component": {"grid-column": "span 1"}}}',	'{"lg-cat": "Id", "lg-deu": "Id", "lg-ell": "Id", "lg-eng": "Id", "lg-fra": "Id", "lg-ita": "Id", "lg-spa": "Id"}'),
(15363029,	'dd375',	'dd373',	'dd9',	'no',	'si',	'si',	3,	'dd',	'si',	NULL,	'{"css":{".wrap_component":{"mixin":[".vertical"],"style":{"width":"40%"}}}}',	'{"css": {".wrapper_component": {"grid-column": "span 5"}}}',	'{"lg-cat": "Nom", "lg-deu": "Name", "lg-ell": "όνομα", "lg-eng": "Name", "lg-fra": "Prénom", "lg-ita": "Nome", "lg-spa": "Nombre"}'),
(15363030,	'dd374',	'dd373',	'dd9',	'no',	'si',	'si',	2,	'dd',	'si',	NULL,	'{"css":{".wrap_component":{"mixin":[".vertical"],"style":{"width":"20%"}}}}',	'{"css": {".wrapper_component": {"grid-column": "span 2"}}}',	'{"lg-cat": "Sigles", "lg-deu": "Initialen", "lg-ell": "ακρώνυμο", "lg-eng": "Acronym", "lg-fra": "Sigles", "lg-ita": "Sigle", "lg-spa": "Siglas"}'),
(15363031,	'dd1552',	'dd1192',	'dd1231',	'no',	'si',	'si',	32,	'dd',	'no',	'[{"dd686":"dd1555"}]',	'{"process_dato":"diffusion_sql::resolve_value","process_dato_arguments":{"output":"merged","split_string_value":" | ","DES_dato_splice_DES":[1],"target_component_tipo":"rsc855"}}',	NULL,	'{"lg-spa": "svg"}'),
(15363032,	'dd547',	'dd548',	'dd635',	'no',	'si',	'si',	1,	'dd',	'no',	'',	NULL,	'{"date_mode": "date_time", "show_interface": {"tools": false, "read_only": true}}',	'{"lg-cat": "Quan", "lg-deu": "Wann", "lg-ell": "όταν", "lg-eng": "When", "lg-fra": "Quand ", "lg-ita": "Quando", "lg-spa": "Cuándo"}'),
(15363033,	'dd1252',	'dd365',	'dd58',	'no',	'si',	'si',	6,	'dd',	'no',	'[{"dd9":"dd367"}]',	NULL,	NULL,	'{"lg-cat": "Llistat relacions", "lg-deu": "Liste Beziehungen", "lg-eng": "Relation list", "lg-fra": "Liste de relations", "lg-ita": "Elenco relazioni", "lg-spa": "Listado relaciones"}'),
(15363034,	'dd455',	'dd449',	'dd395',	'no',	'si',	'si',	8,	'dd',	'si',	NULL,	'{"name":"fecha"}',	'{"name": "date"}',	'{"lg-cat": "Data", "lg-deu": "Datum", "lg-ell": "ημερομηνία", "lg-eng": "Date", "lg-fra": "Date", "lg-ita": "Data", "lg-nep": "मिति", "lg-spa": "Fecha"}'),
(15363035,	'dd1523',	'dd1535',	'dd580',	'no',	'si',	'si',	5,	'dd',	'no',	NULL,	'{"css":{".wrap_component":{"mixin":[".vertical"],"style":{"width":"100%","height":"65vh","clear":"left"}}}}',	'{"css": {".wrapper_component": {"grid-column": "span 5"}, ".wrapper_component >.content_data": {"height": "82vh"}}}',	'{"lg-deu": "Totale", "lg-eng": "Totals", "lg-fra": "Totaux", "lg-spa": "Totales"}'),
(15363036,	'dd972',	'dd1318',	'dd183',	'no',	'si',	'si',	4,	'dd',	'no',	NULL,	NULL,	NULL,	'{"lg-cat": "Esborrar", "lg-deu": "Löschen", "lg-eng": "Delete", "lg-fra": "Supprimer", "lg-ita": "Cancellare", "lg-spa": "Borrar"}'),
(15363037,	'dd590',	'dd391',	'dd395',	'no',	'si',	'si',	67,	'dd',	'si',	'',	'{"name":"reemplazar_todas"}',	'{"name": "recreate_all"}',	'{"lg-cat": "Recrear totes", "lg-deu": "Alle wiederherstellen", "lg-ell": "αναδημιουργήσουν όλους", "lg-eng": "Recreate all", "lg-fra": "Recréer tout", "lg-ita": "Ricreare tutte", "lg-nep": "सबै पुन: सिर्जना गर्नुहोस्", "lg-spa": "Recrear todas"}'),
(15363038,	'dd1041',	'dd19',	'null',	'si',	'si',	'si',	1,	'dd',	'si',	'',	'',	NULL,	'{"lg-spa": "diffusion_component"}'),
(15363039,	'dd1397',	'dd1391',	'dd1747',	'no',	'si',	'si',	1,	'dd',	'no',	NULL,	'{"css":{".wrap_component":{"mixin":[".vertical",".inverse"],"style":{"width":"10%","border-bottom-right-radius":"8px","background-color":"rgba(44, 145, 206, 0.8)"}},".css_label":{"style":{"color":"#ffffff"}}}}',	'{"css": {".wrapper_component": {"grid-column": "span 1"}}}',	'{"lg-deu": "Id", "lg-eng": "Id", "lg-fra": "Id", "lg-spa": "Id"}'),
(15363040,	'dd766',	'dd391',	'dd395',	'no',	'si',	'si',	44,	'dd',	'si',	'',	'{"name":"descriptores"}',	'{"name": "descriptores"}',	'{"lg-cat": "descriptors", "lg-deu": "Deskriptoren", "lg-ell": "περιγραφείς", "lg-eng": "descriptors", "lg-fra": "Descripteurs", "lg-ita": "Descrittori", "lg-spa": "descriptores"}'),
(15363041,	'dd634',	'dd440',	'null',	'si',	'si',	'si',	5,	'dd',	'si',	'',	'',	NULL,	'{"lg-spa": "component_autocomplete_ts"}'),
(15363042,	'dd633',	'dd440',	'null',	'si',	'si',	'si',	6,	'dd',	'si',	'',	'',	NULL,	'{"lg-spa": "component_ip"}'),
(15363043,	'dd544',	'dd548',	'dd633',	'no',	'si',	'si',	3,	'dd',	'no',	'',	NULL,	'{"show_interface": {"tools": false, "read_only": true}}',	'{"lg-cat": "Direcció IP", "lg-deu": "IP-Adresse", "lg-ell": "διεύθυνση IP", "lg-eng": "IP address", "lg-fra": "Adresse IP", "lg-ita": "Direzione IP", "lg-spa": "Dirección IP"}'),
(15363044,	'dd530',	'dd440',	'null',	'si',	'si',	'si',	13,	'dd',	'no',	'',	'',	NULL,	'{"lg-spa": "component_autocomplete"}'),
(15363045,	'dd1724',	'dd440',	NULL,	'si',	'si',	'si',	15,	'dd',	'si',	'',	'',	NULL,	'{"lg-spa": "component_profile"}'),
(15363046,	'dd1742',	'dd614',	NULL,	'si',	'si',	'si',	37,	'dd',	'no',	NULL,	NULL,	NULL,	'{"lg-spa": "component_array"}'),
(15363047,	'dd440',	'dd6',	'null',	'si',	'si',	'si',	2,	'dd',	'no',	'',	'',	NULL,	'{"lg-spa": "box elements"}'),
(15363048,	'dd177',	'dd6',	'null',	'si',	'si',	'si',	7,	'dd',	'no',	'null',	'',	NULL,	'{"lg-spa": "button_new"}'),
(15363049,	'dd8',	'dd6',	'null',	'si',	'si',	'si',	17,	'dd',	'no',	'null',	'',	NULL,	'{"lg-spa": "section_group"}'),
(15363050,	'dd74',	'dd6',	'null',	'si',	'si',	'si',	22,	'dd',	'no',	'',	NULL,	NULL,	'{"lg-spa": "indexation_list"}'),
(15363051,	'dd1538',	'dd614',	'null',	'si',	'si',	'si',	17,	'dd',	'no',	'',	NULL,	NULL,	'{"lg-spa": "component_html_file"}'),
(15363052,	'dd43',	'dd440',	NULL,	'si',	'si',	'si',	20,	'dd',	'no',	'null',	'',	NULL,	'{"lg-spa": "component_number"}'),
(15363053,	'dd442',	'dd440',	NULL,	'si',	'si',	'si',	44,	'dd',	'no',	NULL,	NULL,	NULL,	'{"lg-spa": "component_autocomplete_hi"}'),
(15363054,	'dd2',	'dd0',	'null',	'si',	'si',	'si',	2,	'dd',	'no',	'',	'',	NULL,	'{"lg-spa": "dedalo"}'),
(15363055,	'dd546',	'dd548',	'dd634',	'no',	'si',	'si',	4,	'dd',	'no',	'',	NULL,	'{"show_interface": {"tools": false, "read_only": true}}',	'{"lg-cat": "A on", "lg-deu": "Wo", "lg-ell": "όπου", "lg-eng": "Where", "lg-fra": "Où ", "lg-ita": "Dove", "lg-spa": "Dónde"}'),
(15363056,	'dd1510',	'dd1391',	'dd57',	'no',	'si',	'si',	5,	'dd',	'no',	'[{"dd6":"dd501"},{"dd9":"dd503"}]',	'{"css":{".wrap_component":{"mixin":[".vertical",".line_top"],"style":{"width":"100%"}},".css_input_text":{"style":{"font-size":"16px"}}}}',	'{"css": {".wrapper_component": {"grid-column": "span 4"}}}',	'{"lg-deu": "Revision", "lg-eng": "Review", "lg-fra": "Révision", "lg-spa": "Revisión"}'),
(15363057,	'dd1625',	'dd391',	'dd395',	'no',	'si',	'si',	95,	'dd',	'no',	NULL,	'{"name":"replace"}',	'{"name": "replace"}',	'{"lg-cat": "Substitueix", "lg-deu": "Ersetzen", "lg-eng": "Replace", "lg-fra": "Remplacer ", "lg-ita": "Sostituire", "lg-nep": "प्रतिस्थापन गर्नुहोस्", "lg-spa": "Reemplazar"}'),
(15363058,	'dd1403',	'dd1391',	'dd318',	'no',	'si',	'si',	8,	'dd',	'si',	NULL,	'{"css":{".wrap_component":{"mixin":[".line_top"],"style":{"width":"100%","height":"800px"}},".content_data":{"style":{}}}}',	'{"css": {".wrapper_component": {"grid-column": "span 10"}, ".wrapper_component > .content_data": {"max-height": "35rem"}}}',	'{"lg-deu": "Körper", "lg-eng": "Body", "lg-fra": "Corps", "lg-spa": "Cuerpo"}'),
(15363059,	'dd1626',	'dd391',	'dd395',	'no',	'si',	'si',	96,	'dd',	'no',	NULL,	'{"name":"replace_all"}',	'{"name": "replace_all"}',	'{"lg-cat": "Reemplaçar-los tots", "lg-deu": "Alles ersetzen", "lg-ell": "αντικαταστήστε όλα", "lg-eng": "Replace all", "lg-fra": "Tout remplacer", "lg-ita": "Sostituisci tutto", "lg-nep": "सबै बदल्नुहोस्", "lg-spa": "Reemplazar todos"}'),
(15363060,	'dd550',	'dd548',	'dd247',	'no',	'si',	'si',	7,	'dd',	'no',	'',	NULL,	'{"show_interface": {"tools": false, "read_only": true}}',	'{"lg-cat": "Projecte", "lg-deu": "Projekt", "lg-ell": "Έργο", "lg-eng": "Projects", "lg-fra": "Projet", "lg-ita": "Progetto", "lg-spa": "Proyecto"}'),
(15363061,	'dd1628',	'dd391',	'dd395',	'no',	'si',	'si',	98,	'dd',	'si',	NULL,	'{"name":"whole_words"}',	'{"name": "whole_words"}',	'{"lg-cat": "Paraules senceres", "lg-deu": "Ganze Wörter", "lg-ell": "Ολόκληρες λέξεις", "lg-eng": "Whole words", "lg-fra": "Paroles complètes", "lg-ita": "Parole intere", "lg-nep": "सम्पूर्ण शब्दहरू", "lg-spa": "Palabras completas"}'),
(15363062,	'dd1629',	'dd391',	'dd395',	'no',	'si',	'si',	99,	'dd',	'si',	NULL,	'{"name":"find_and_replace"}',	'{"name": "find_and_replace"}',	'{"lg-cat": "Trobar i substituir", "lg-deu": "Suchen und Ersetzen", "lg-ell": "Βρίσκω και αντικαθιστώ", "lg-eng": "Find and replace", "lg-fra": "Rechercher et remplacer", "lg-ita": "Trova e sostituisci", "lg-nep": "फेला पार्नुहोस् र बदल्नुहोस्", "lg-spa": "Buscar y reemplazar"}'),
(15363063,	'dd1508',	'dd1192',	'dd1231',	'no',	'si',	'si',	26,	'dd',	'si',	'[{"dd592":"dd1407"}]',	'{
  "process_dato": "diffusion_sql::resolve_value",
  "process_dato_arguments": {
    "split_string_value": " | ",
    "output": "merged",
    "target_component_tipo": "rsc23"
  }
}',	'{"process_dato": "diffusion_sql::resolve_value", "process_dato_arguments": {"output": "merged", "split_string_value": " | ", "target_component_tipo": "rsc36"}}',	'{"lg-spa": "audiovisual_description"}'),
(15363064,	'dd1418',	'dd1192',	'dd1233',	'no',	'si',	'si',	5,	'dd',	'si',	'[{"dd57":"dd1396"}]',	'{
  "info": "For construct the ENUM value of the field, it need to be changed from the -dato- (without language) to the final -enum- value, dato:enumvalue",
  "data_to_be_used": "dato",
  "enum": {
    "1": "yes",
    "2": "no"
  }
}',	'{"enum": {"1": "yes", "2": "no"}, "info": "For construct the ENUM value of the field, it need to be changed from the -dato- (without language) to the final -enum- value, dato:enumvalue", "data_to_be_used": "dato"}',	'{"lg-spa": "menu"}'),
(15363065,	'dd1438',	'dd1192',	'dd1233',	'no',	'si',	'si',	6,	'dd',	'si',	'[{"dd57":"dd1395"}]',	'{
  "info": "For construct the ENUM value of the field, it need to be changed from the -dato- (without language) to the final -enum- value, dato:enumvalue",
  "data_to_be_used": "dato",
  "enum": {
    "1": "yes",
    "2": "no"
  }
}',	'null',	'{"lg-spa": "active"}'),
(15363066,	'dd1388',	'dd1192',	'dd1231',	'no',	'si',	'si',	14,	'dd',	'si',	'[{"dd318":"dd1403"}]',	'',	'null',	'{"lg-spa": "body"}'),
(15363067,	'dd1466',	'dd1192',	'dd1231',	'no',	'si',	'si',	22,	'dd',	'si',	'[{"dd592":"dd1404"}]',	'{
  "process_dato": "diffusion_sql::resolve_value",
  "process_dato_arguments": {
    "split_string_value": " | ",
    "output": "merged",
    "target_component_tipo": "rsc23",
    "DES_dato_splice_DES": [
      1
    ]
  }
}',	NULL,	'{"lg-spa": "identifying_images_description"}'),
(15363068,	'dd1509',	'dd1192',	'dd1231',	'no',	'si',	'si',	28,	'dd',	'si',	'[{"dd592":"dd1408"}]',	'{
  "process_dato": "diffusion_sql::resolve_value",
  "process_dato_arguments": {
    "split_string_value": " | ",
    "output": "merged",
    "target_component_tipo": "rsc23"
  }
}',	'{"process_dato": "diffusion_sql::resolve_value", "process_dato_arguments": {"output": "merged", "split_string_value": " | ", "target_component_tipo": "rsc38"}}',	'{"lg-spa": "document_description"}'),
(15363069,	'dd1446',	'dd1192',	'dd1235',	'no',	'si',	'si',	31,	'dd',	'si',	'[{"dd431":"dd1411"}]',	'{
  "varchar": 512,
  "process_dato": "diffusion_sql::resolve_value",
  "process_dato_arguments": {
    "target_component_tipo": "dd1393",
    "DES_dato_splice": [
      1
    ]
  }
}',	'null',	'{"lg-spa": "related_path"}'),
(15363070,	'dd1419',	'dd1192',	'dd1235',	'no',	'si',	'si',	3,	'dd',	'si',	'[{"dd1747":"dd1397"}]',	'{
  "varchar": 64,
  "process_dato": "diffusion_sql::map_to_terminoID"
}',	'{"varchar": 64, "process_dato": "diffusion_sql::map_to_terminoID"}',	'{"lg-spa": "term_id"}'),
(15363071,	'dd1630',	'dd1535',	'dd1747',	'no',	'si',	'si',	1,	'dd',	'no',	NULL,	'{"css":{".wrap_component":{"mixin":[".vertical",".inverse"],"style":{"width":"8%","border-bottom-right-radius":"8px"}}}}',	NULL,	'{"lg-fra": "ID", "lg-spa": "ID"}'),
(15363072,	'dd419',	'dd147',	'dd395',	'no',	'si',	'si',	11,	'dd',	'si',	NULL,	'{"name":"meses"}',	'{"name": "months"}',	'{"lg-cat": "mesos", "lg-deu": "Monate", "lg-ell": "μήνες", "lg-eng": "months", "lg-fra": "mois", "lg-ita": "metodo", "lg-nep": "महिना", "lg-spa": "meses"}'),
(15363073,	'dd421',	'dd147',	'dd395',	'no',	'si',	'si',	13,	'dd',	'si',	NULL,	'{"name":"mes"}',	'{"name": "month"}',	'{"lg-cat": "mes", "lg-deu": "Monat", "lg-ell": "μήνας", "lg-eng": "month", "lg-fra": "mois", "lg-ita": "mesi", "lg-nep": "महिना", "lg-spa": "mes"}'),
(15363074,	'dd1531',	'dd1535',	'dd9',	'no',	'si',	'si',	3,	'dd',	'no',	NULL,	NULL,	NULL,	'{"lg-deu": "Typ", "lg-eng": "Type", "lg-fra": "Type", "lg-spa": "Tipo"}'),
(15363075,	'dd1383',	'dd604',	'dd9',	'no',	'si',	'si',	2,	'dd',	'si',	NULL,	'',	'null',	'{"lg-deu": "Wert", "lg-eng": "Value", "lg-fra": "Valeur", "lg-spa": "valor"}'),
(15363076,	'dd1601',	'dd1582',	'dd57',	'no',	'si',	'si',	4,	'dd',	'no',	'[{"dd6":"dd64"},{"dd9":"dd62"}]',	'{"css":{".wrap_component":{"mixin":[".vertical"],"style":{"width":"15%"}}}}',	'{"css": {".wrapper_component": {"grid-column": "span 2"}}}',	'{"lg-eng": "Active always", "lg-fra": "Toujours actif", "lg-spa": "Siempre activo"}'),
(15363077,	'dd1332',	'dd1582',	'dd57',	'no',	'si',	'si',	2,	'dd',	'no',	'[{"dd6":"dd64"},{"dd9":"dd62"}]',	'{"css":{".wrap_component":{"mixin":[".vertical"],"style":{"width":"15%"}}}}',	'{"css": {".wrapper_component": {"grid-column": "span 2"}}}',	'{"lg-deu": "Komponente", "lg-eng": "Shown in Component", "lg-fra": "Composant", "lg-spa": "Componente"}'),
(15363078,	'dd564',	'dd563',	'dd1747',	'no',	'si',	'si',	1,	'dd',	'no',	NULL,	'{"css":{".wrap_component":{"mixin":[".vertical",".inverse"],"style":{"width":"8%","border-bottom-right-radius":"8px"}}}}',	'{"css": {".wrapper_component": {"grid-column": "span 1"}}}',	'{"lg-cat": "Id", "lg-deu": "Id", "lg-ell": "Id", "lg-eng": "Id", "lg-fra": "Id", "lg-ita": "Id", "lg-spa": "Id"}'),
(15363079,	'dd1486',	'dd1472',	'dd1231',	'no',	'si',	'si',	8,	'dd',	'si',	'[{"dd10":"dd1478"}]',	NULL,	NULL,	'{"lg-spa": "definition"}'),
(15363080,	'dd1485',	'dd1472',	'dd1231',	'no',	'si',	'si',	3,	'dd',	'si',	'[{"dd9":"dd1482"}]',	NULL,	NULL,	'{"lg-spa": "tld"}'),
(15363081,	'dd1496',	'dd1472',	'dd1231',	'no',	'si',	'si',	6,	'dd',	'si',	'[{"dd9":"dd1477"}]',	NULL,	NULL,	'{"lg-spa": "term"}'),
(15363082,	'dd973',	'dd409',	'dd1747',	'no',	'si',	'si',	1,	'dd',	'no',	NULL,	NULL,	'{"css": {".wrapper_component": {"grid-column": "span 1"}}}',	'{"lg-cat": "Id", "lg-deu": "Id", "lg-ell": "Id", "lg-eng": "Id", "lg-fra": "Id", "lg-ita": "Id", "lg-spa": "Id"}'),
(15363083,	'dd1217',	'dd390',	'dd395',	'no',	'si',	'si',	22,	'dd',	'si',	'',	'{"name":"filtro"}',	'{"name": "filter"}',	'{"lg-cat": "filtre", "lg-deu": "Filter", "lg-ell": "φίλτρο", "lg-eng": "filter", "lg-fra": "Filtre ", "lg-ita": "Filtro", "lg-nep": "फिल्टर", "lg-spa": "filtro"}'),
(15363084,	'dd645',	'dd539',	'dd395',	'no',	'si',	'si',	17,	'dd',	'si',	NULL,	'{"name":"name_to_field"}',	'{"name": "name_to_field"}',	'{"lg-cat": "Sufix indica camp", "lg-deu": "Suffix gibt Feld an", "lg-ell": "Η κατάληξη υποδηλώνει το πεδίο", "lg-eng": "Suffix indicates field", "lg-fra": "Le suffixe indique le champ", "lg-ita": "Il suffisso indica il campo", "lg-spa": "Sufijo indica campo"}'),
(15363085,	'dd1282',	'dd449',	'dd395',	'no',	'si',	'si',	14,	'dd',	'si',	NULL,	'{
  "name": "audiovisual"
}',	'{"name": "audiovisual"}',	'{"lg-cat": "Audiovisual", "lg-deu": "Audiovisuell", "lg-eng": "Audiovisual", "lg-fra": "Audiovisuel", "lg-nep": "अडियोभिजुअल", "lg-spa": "Audiovisual"}'),
(15363086,	'dd1495',	'dd1472',	'dd1231',	'no',	'si',	'si',	9,	'dd',	'si',	'[{"dd10":"dd1543"}]',	NULL,	NULL,	'{"lg-spa": "rules"}'),
(15363087,	'dd1497',	'dd1472',	'dd1231',	'no',	'si',	'si',	2,	'dd',	'si',	'[{"dd9":"dd1475"}]',	NULL,	NULL,	'{"lg-spa": "term_id"}'),
(15363088,	'dd1504',	'dd1473',	'dd57',	'no',	'si',	'si',	6,	'dd',	'no',	'[{"dd6":"dd64"},{"dd9":"dd62"}]',	'{"css":{".wrap_component":{"mixin":[".vertical",".line_top"],"style":{"width":"15%"}}}}',	'{"css": {".wrapper_component": {"grid-column": "span 2"}}}',	'{"lg-deu": "Ist Modell", "lg-eng": "Is model", "lg-fra": "C''est un modèle", "lg-spa": "Es modelo"}'),
(15363089,	'dd1489',	'dd1472',	'dd1230',	'no',	'si',	'si',	12,	'dd',	'si',	'[{"dd9":"dd1475"}]',	'{"process_dato":"diffusion_sql::resolve_jer_dd_data","process_dato_arguments":{"column":"norden"}}',	'{"process_dato": "diffusion_sql::resolve_jer_dd_data", "process_dato_arguments": {"column": "norden"}}',	'{"lg-spa": "norder"}'),
(15363090,	'dd1481',	'dd1473',	'dd339',	'no',	'si',	'si',	2,	'dd',	'no',	'[{"dd6":"dd64"},{"dd9":"dd62"}]',	'{"css":{".wrap_component":{"mixin":[".vertical"],"style":{"width":"10%"}}}}',	NULL,	'{"lg-deu": "Öffentlich", "lg-eng": "Public", "lg-fra": "Public", "lg-spa": "Público"}'),
(15363091,	'dd1557',	'dd1472',	'dd1231',	'no',	'si',	'si',	20,	'dd',	'si',	'[{"dd580":"dd1556"}]',	NULL,	NULL,	'{"lg-spa": "json_ontology_item"}'),
(15363092,	'dd1487',	'dd1472',	'dd1235',	'no',	'si',	'si',	4,	'dd',	'si',	'[{"dd9":"dd1483"}]',	'{"varchar":64}',	'{"varchar": 64}',	'{"lg-spa": "_id"}'),
(15363093,	'dd1267',	'dd1472',	'dd440',	'no',	'si',	'si',	21,	'dd',	'no',	'null',	NULL,	NULL,	'{"lg-eng": "Videos list", "lg-fra": "DÉSACTIVÉS", "lg-spa": "DESACTIVOS"}'),
(15363094,	'dd1478',	'dd1473',	'dd10',	'no',	'si',	'si',	11,	'dd',	'si',	NULL,	'{"css":{".wrap_component":{"mixin":[".vertical"],"style":{"width":"100%"}}}}',	'{"css": {".wrapper_component": {"grid-column": "span 4"}, ".wrapper_component >.content_data": {"max-height": "20rem"}}}',	'{"lg-deu": "Definition", "lg-eng": "Definition", "lg-fra": "Définition", "lg-spa": "Definición"}'),
(15363095,	'dd1491',	'dd1472',	'dd1231',	'no',	'si',	'si',	11,	'dd',	'si',	'[{"dd9":"dd1475"}]',	'{"process_dato":"diffusion_sql::resolve_jer_dd_data","process_dato_arguments":{"column":"modelo","resolve_label":true}}',	'{"process_dato": "diffusion_sql::resolve_jer_dd_data", "process_dato_arguments": {"column": "modelo", "resolve_label": true}}',	'{"lg-spa": "model"}'),
(15363096,	'dd1494',	'dd1472',	'dd1235',	'no',	'si',	'si',	13,	'dd',	'si',	'[{"dd9":"dd1475"}]',	'{"varchar":64,"process_dato":"diffusion_sql::resolve_jer_dd_data","process_dato_arguments":{"column":"parent","resolve_label":false}}',	'{"varchar": 64, "process_dato": "diffusion_sql::resolve_jer_dd_data", "process_dato_arguments": {"column": "parent", "resolve_label": false}}',	'{"lg-spa": "parent"}'),
(15363097,	'dd1501',	'dd1472',	'dd1231',	'no',	'si',	'si',	14,	'dd',	'si',	'[{"dd9":"dd1475"}]',	'{"process_dato":"diffusion_sql::resolve_jer_dd_data","process_dato_arguments":{"column":"parent","resolve_label":false,"mode":"get_parents"}}',	'{"process_dato": "diffusion_sql::resolve_jer_dd_data", "process_dato_arguments": {"mode": "get_parents", "column": "parent", "resolve_label": false}}',	'{"lg-spa": "parents"}'),
(15363098,	'dd1503',	'dd1472',	'dd1231',	'no',	'si',	'si',	15,	'dd',	'si',	'[{"dd9":"dd1475"}]',	'{"process_dato":"diffusion_sql::resolve_jer_dd_data","process_dato_arguments":{"column":"parent","resolve_label":false,"mode":"get_children"}}',	'{"process_dato": "diffusion_sql::resolve_jer_dd_data", "process_dato_arguments": {"mode": "get_children", "column": "parent", "resolve_label": false}}',	'{"lg-spa": "children"}'),
(15363099,	'dd1498',	'dd1472',	'dd523',	'no',	'si',	'si',	16,	'dd',	'si',	'[{"dd9":"dd1475"}]',	'{"process_dato":"diffusion_sql::resolve_jer_dd_data","process_dato_arguments":{"column":"traducible"}}',	'{"process_dato": "diffusion_sql::resolve_jer_dd_data", "process_dato_arguments": {"column": "traducible"}}',	'{"lg-spa": "translatable"}'),
(15363100,	'dd1499',	'dd1472',	'dd1231',	'no',	'si',	'si',	17,	'dd',	'si',	'[{"dd9":"dd1475"}]',	'{"process_dato":"diffusion_sql::resolve_jer_dd_data","process_dato_arguments":{"column":"propiedades"}}',	'{"process_dato": "diffusion_sql::resolve_jer_dd_data", "process_dato_arguments": {"column": "propiedades"}}',	'{"lg-spa": "propiedades"}'),
(15363101,	'dd1506',	'dd1472',	'dd1231',	'no',	'si',	'si',	10,	'dd',	'si',	'[{"dd500":"dd1505"}]',	NULL,	NULL,	'{"lg-spa": "uri"}'),
(15363102,	'dd1563',	'dd1500',	'dd1129',	'no',	'si',	'no',	2,	'dd',	'no',	'[{"dd9":"dd1562"}]',	NULL,	NULL,	'{"lg-deu": "Ausgeschlossene", "lg-eng": "Exclude", "lg-fra": "exclure", "lg-spa": "exclude"}'),
(15363103,	'dd1474',	'dd1473',	'dd1747',	'no',	'si',	'si',	1,	'dd',	'no',	NULL,	'{"css":{".wrap_component":{"style":{"width":"10%"}}}}',	NULL,	'{"lg-deu": "Id", "lg-eng": "Id", "lg-fra": "Id", "lg-spa": "Id"}'),
(15363104,	'dd1562',	'dd1473',	'dd9',	'no',	'si',	'si',	8,	'dd',	'no',	NULL,	'{"css":{".wrap_component":{"mixin":[".vertical"],"style":{"width":"80%"}}}}',	'{"css": {".wrapper_component": {"grid-column": "span 2"}}}',	'{"lg-deu": "Identifikationscode", "lg-eng": "Identification code", "lg-fra": "Code d''identification", "lg-spa": "Código identificativo"}'),
(15363105,	'dd1561',	'dd1560',	'dd91',	'no',	'si',	'no',	1,	'dd',	'no',	'[{"dd9":"dd1562"},{"dd10":"dd1478"},{"dd10":"dd1543"},{"dd500":"dd1505"},{"dd10":"dd1476"}]',	NULL,	NULL,	'{"lg-deu": "Liste", "lg-eng": "List", "lg-fra": "Liste", "lg-spa": "list"}'),
(15363106,	'dd1313',	'rsc481',	'dd6',	'no',	'si',	'no',	4,	'dd',	'no',	'[{"dd626":"dd22"}]',	NULL,	'{"color": "#6f92be"}',	'{"lg-cat": "Tipologia de document administratiu", "lg-deu": "Typologie des administrativen Dokuments", "lg-eng": "Administrative document typology", "lg-fra": "Typologie des documents administratifs", "lg-ita": "Tipologia di documento amministrativo", "lg-spa": "Tipología de documento administrativo"}'),
(15363107,	'dd1602',	'dd390',	'dd395',	'no',	'si',	'si',	36,	'dd',	'si',	NULL,	'{"name":"copy"}',	'{"name": "copy"}',	'{"lg-cat": "Copiar", "lg-deu": "Kopieren", "lg-ell": "αντίγραφο", "lg-eng": "Copy", "lg-fra": "Copier ", "lg-nep": "कापी", "lg-spa": "Copiar"}'),
(15363108,	'dd1566',	'dd1558',	'dd247',	'no',	'si',	'no',	4,	'dd',	'no',	NULL,	NULL,	NULL,	'{"lg-deu": "Projekt", "lg-eng": "Project", "lg-fra": "Projet", "lg-spa": "Proyecto"}'),
(15363109,	'dd627',	'dd193',	'dd440',	'no',	'si',	'si',	1,	'dd',	'si',	'',	NULL,	NULL,	'{"lg-eng": "Matrix tables", "lg-fra": "Tableaux matriciels", "lg-spa": "Matrix tables"}'),
(15363110,	'dd500',	'dd440',	NULL,	'si',	'si',	'si',	26,	'dd',	'si',	'',	'',	NULL,	'{"lg-spa": "component_iri"}'),
(15363111,	'dd565',	'dd563',	'dd9',	'no',	'si',	'si',	2,	'dd',	'si',	NULL,	'{"css":{".wrap_component":{"mixin":[".vertical"],"style":{"width":"42%"}}}}',	'{"css": {".wrapper_component": {"grid-column": "span 3"}}}',	'{"lg-cat": "Actiu", "lg-deu": "Aktiv", "lg-ell": "Ενεργός", "lg-eng": "Active", "lg-fra": "Actif", "lg-ita": "Attivo", "lg-spa": "Activo"}'),
(15363112,	'dd1288',	'dd1276',	'dd9',	'no',	'si',	'si',	3,	'dd',	'no',	'null',	'{"css":{".wrap_component":{"mixin":[".vertical"],"style":{"width":"82%"}}}}',	'{"css": {".wrapper_component.edit.view_default": {"grid-column": "span 8"}}}',	'{"lg-deu": "TLD", "lg-eng": "TLD", "lg-fra": "TLD", "lg-spa": "TLD"}'),
(15363113,	'dd1277',	'dd1276',	'dd318',	'no',	'si',	'si',	4,	'dd',	'si',	NULL,	'{"css":{".wrap_component":{"mixin":[".vertical"],"style":{"width":"100%"}}}}',	'{"css": {".wrapper_component.edit": {"grid-column": "span 5"}}}',	'{"lg-deu": "Beschreibung", "lg-eng": "Description", "lg-fra": "Description", "lg-spa": "Descripción"}'),
(15363114,	'dd1009',	'dd1000',	'dd91',	'no',	'si',	'si',	3,	'dd',	'no',	'[{"dd9":"dd1002"},{"dd9":"dd1007"},{"dd10":"dd1005"},{"dd500":"dd1004"}]',	NULL,	NULL,	'{"lg-deu": "Liste", "lg-eng": "List", "lg-fra": "Liste", "lg-ita": "Elenco", "lg-spa": "Listado"}'),
(15363115,	'dd1741',	'dd440',	NULL,	'si',	'si',	'si',	10,	'dd',	'si',	NULL,	NULL,	NULL,	'{"lg-spa": "component_3d"}'),
(15363116,	'dd722',	'dd440',	'null',	'si',	'si',	'si',	14,	'dd',	'si',	'',	'',	NULL,	'{"lg-spa": "component_av"}'),
(15363117,	'dd592',	'dd440',	'null',	'si',	'si',	'si',	22,	'dd',	'no',	'',	'',	NULL,	'{"lg-spa": "component_portal"}'),
(15363118,	'dd225',	'dd440',	'null',	'si',	'si',	'si',	25,	'dd',	'no',	'',	'',	NULL,	'{"lg-spa": "component_password"}'),
(15363119,	'dd1276',	'dd1266',	'dd8',	'no',	'si',	'si',	1,	'dd',	'no',	NULL,	NULL,	'{"css": {".content_data": {"grid-template-columns": "repeat(10, 1fr)"}}}',	'{"lg-deu": "Allgemein", "lg-eng": "Name", "lg-fra": "Général", "lg-spa": "General"}'),
(15363120,	'dd1558',	'dd770',	'dd6',	'no',	'si',	'no',	1,	'dd',	'no',	'[{"dd626":"dd963"}]',	NULL,	NULL,	'{"lg-deu": "Basis-Ontologie", "lg-eng": "Ontology basis", "lg-fra": "Base ontologique", "lg-spa": "Ontology base"}'),
(15363121,	'dd1565',	'dd1560',	'dd1129',	'no',	'si',	'si',	2,	'dd',	'no',	'[{"dd9":"dd1475"},{"dd9":"dd1482"},{"dd9":"dd1483"},{"dd9":"dd1477"},{"dd57":"dd1504"},{"dd580":"dd1556"},{"dd592":"dd1529"},{"dd592":"dd1564"}]',	NULL,	NULL,	'{"lg-deu": "Ausgeschlossene", "lg-eng": "Exclude", "lg-fra": "exclure", "lg-spa": "exclude"}'),
(15363122,	'dd339',	'dd440',	NULL,	'si',	'si',	'si',	38,	'dd',	'no',	NULL,	NULL,	NULL,	'{"lg-spa": "component_publication"}'),
(15363123,	'dd1192',	'dd1137',	'dd1229',	'no',	'si',	'si',	1,	'dd',	'no',	'[{"dd6":"dd1100"}]',	'',	'null',	'{"lg-spa": "ts_web"}'),
(15363124,	'dd1104',	'dd1137',	'dd1229',	'no',	'si',	'si',	9,	'dd',	'no',	'[{"dd6":"dd917"}]',	NULL,	NULL,	'{"lg-spa": "versions"}'),
(15363125,	'dd1302',	'dd1137',	'dd1229',	'no',	'si',	'si',	15,	'dd',	'no',	'[{"dd6":"dd1265"}]',	NULL,	NULL,	'{"lg-spa": "videos"}'),
(15363126,	'dd1472',	'dd1137',	'dd1229',	'no',	'si',	'si',	3,	'dd',	'si',	'[{"dd6":"dd1500"}]',	NULL,	NULL,	'{"lg-spa": "ontology"}'),
(15363127,	'dd252',	'dd440',	'null',	'si',	'si',	'si',	21,	'dd',	'no',	'',	'',	NULL,	'{"lg-spa": "component_security_administrator"}'),
(15363128,	'dd44',	'dd440',	NULL,	'si',	'si',	'si',	7,	'dd',	'si',	'',	'',	NULL,	'{"lg-spa": "component_calculation"}'),
(15363129,	'dd1271',	'dd1276',	'dd339',	'no',	'si',	'si',	2,	'dd',	'no',	'[{"dd6":"dd64"},{"dd9":"dd62"}]',	'{"css":{".wrap_component":{"mixin":[".vertical"],"style":{"width":"10%"}},".content_data":{"style":{"width":"120px"}}}}',	NULL,	'{"lg-deu": "Öffentlich", "lg-eng": "Public", "lg-fra": "Public", "lg-spa": "Público"}'),
(15363130,	'dd1103',	'dd1137',	'dd1229',	'no',	'si',	'si',	8,	'dd',	'no',	'[{"dd6":"dd867"}]',	NULL,	NULL,	'{"lg-spa": "properties"}'),
(15363131,	'dd1283',	'dd1286',	'dd1231',	'no',	'si',	'si',	4,	'dd',	'no',	'[{"dd318":"dd1280"}]',	NULL,	NULL,	'{"lg-spa": "undertaken"}'),
(15363132,	'dd1280',	'dd1276',	'dd318',	'no',	'si',	'si',	5,	'dd',	'si',	'null',	'{"css":{".wrap_component":{"mixin":[".vertical"],"style":{"width":"100%"}}}}',	'{"css": {".wrapper_component.edit": {"grid-column": "span 5"}}}',	'{"lg-deu": "Angefangen", "lg-eng": "Undertaken", "lg-fra": "Entrepris", "lg-spa": "Emprendido"}'),
(15363133,	'dd904',	'dd440',	'null',	'si',	'si',	'si',	1,	'dd',	'no',	'',	'',	NULL,	'{"lg-spa": "component_select_lang"}'),
(15363134,	'dd1604',	'dd276',	'dd395',	'no',	'si',	'si',	11,	'dd',	'si',	NULL,	'{"name":"deleted_tags"}',	'{"name": "deleted_tags"}',	'{"lg-cat": "Etiquetes esborrades", "lg-eng": "Deleted tags", "lg-fra": "Libellés supprimés", "lg-nep": "मेटाइएका ट्यागहरू", "lg-spa": "Etiquetas borradas"}'),
(15363135,	'dd241',	'dd440',	'null',	'si',	'si',	'si',	23,	'dd',	'no',	'',	'',	NULL,	'{"lg-spa": "component_security_areas"}'),
(15363136,	'dd198',	'dd440',	'null',	'si',	'si',	'si',	52,	'dd',	'no',	'null',	NULL,	NULL,	'{"lg-spa": "component_dataframe"}'),
(15363137,	'dd1585',	'dd389',	'dd395',	'no',	'si',	'si',	31,	'dd',	'si',	NULL,	'{"name":"discard_changes"}',	'{"name": "discard_changes"}',	'{"lg-cat": "Descartar els canvis no salvats?", "lg-ell": "Απόρριψη μη αποθηκευμένων αλλαγών;", "lg-eng": "Discard unsaved changes?", "lg-fra": "Abandonner les modifications non sauvegardées ?", "lg-nep": "सुरक्षित नगरिएका परिवर्तनहरू खारेज गर्ने हो?", "lg-spa": "¿Descartar los cambios no salvados?"}'),
(15363138,	'dd1213',	'dd538',	'dd395',	'no',	'si',	'si',	1,	'dd',	'si',	'',	'{
  "name": "tool_pdf_versions"
}',	'{"name": "tool_pdf_versions"}',	'{"lg-cat": "Fitxers PDF", "lg-deu": "PDF Dateien", "lg-ell": "αρχεία PDF", "lg-eng": "PDF files", "lg-fra": "Fichiers PDF ", "lg-ita": "Files PDF", "lg-spa": "Ficheros PDF"}'),
(15363139,	'dd1351',	'dd1325',	'dd1747',	'no',	'si',	'si',	1,	'dd',	'no',	NULL,	'{"css":{".wrap_component":{"mixin":[".vertical",".inverse"],"style":{"width":"10%","border-bottom-right-radius":"8px"}}}}',	'{"css": {".wrapper_component": {"grid-column": "span 1"}}}',	'{"lg-deu": "Id", "lg-eng": "Id", "lg-fra": "Id", "lg-spa": "Id"}'),
(15363140,	'dd1600',	'dd382',	'dd1747',	'no',	'si',	'si',	1,	'dd',	'no',	NULL,	'{"css":{".wrap_component":{"mixin":[".vertical",".inverse"],"style":{"width":"10%","border-bottom-right-radius":"8px"}}}}',	'{"css": {".wrapper_component": {"grid-column": "span 1"}}}',	'{"lg-cat": "Id", "lg-deu": "Id", "lg-eng": "Id", "lg-fra": "Id", "lg-spa": "Id"}'),
(15363141,	'dd1178',	'dd771',	'dd6',	'no',	'si',	'si',	5,	'dd',	'no',	'[{"dd626":"dd963"}]',	NULL,	NULL,	'{"lg-deu": "Typologien", "lg-eng": "Typologies", "lg-fra": "Typologies ", "lg-ita": "Tipologie", "lg-spa": "Tipologías"}'),
(15363142,	'dd72',	'dd117',	NULL,	'si',	'si',	'si',	10,	'dd',	'no',	'',	NULL,	NULL,	'{"lg-spa": "area_maintenance"}'),
(15363143,	'dd791',	'dd537',	'dd395',	'no',	'si',	'si',	1,	'dd',	'si',	'',	'{
  "name": "tool_posterframe"
}',	'{"name": "tool_posterframe"}',	'{"lg-cat": "Fotograma", "lg-deu": "Standbild", "lg-ell": "φωτόγραμμα", "lg-eng": "Posterframe", "lg-fra": "Photogramme", "lg-ita": "Fotogramma", "lg-spa": "Fotograma"}'),
(15363144,	'dd335',	'dd537',	'dd395',	'no',	'si',	'si',	18,	'dd',	'si',	NULL,	'{
  "name": "tool_import_av"
}',	'{"name": "tool_import_av"}',	'{"lg-cat": "Importació àudio / vídeo", "lg-deu": "Audio/Video importieren", "lg-ell": "Εισαγωγής ήχου / βίντεο", "lg-eng": "Import audio / video", "lg-fra": "Importer des fichiers audio/vidéo", "lg-ita": "Importare audio/video", "lg-spa": "Importar audio/video"}'),
(15363145,	'dd394',	'dd382',	'dd635',	'no',	'si',	'si',	4,	'dd',	'no',	NULL,	'{"css":{".wrap_component":{"mixin":[".vertical"],"style":{"width":"25%"}}}}',	'{"css": {".wrapper_component": {"grid-column": "span 3"}}}',	'{"lg-cat": "Any de fundació", "lg-deu": "Gründungsjahr", "lg-ell": "έτος ίδρυσης", "lg-eng": "Foundation year", "lg-fra": "Année de fondation", "lg-ita": "Anno di fondazione", "lg-spa": "Año de fundación"}'),
(15363146,	'dd1606',	'dd390',	'dd395',	'no',	'si',	'si',	37,	'dd',	'si',	NULL,	'{"name":"unsaved_changes"}',	'{"name": "unsaved_changes"}',	'{"lg-cat": "Canvis no desats!", "lg-deu": "Nicht gespeicherte Änderungen!", "lg-ell": "Μη αποθηκευμένες αλλαγές!", "lg-eng": "Unsaved changes!", "lg-fra": "Modifications non sauvegardées !", "lg-ita": "Modifiche non salvate!", "lg-nep": "बचत नगरिएका परिवर्तनहरू!", "lg-spa": "¡Sin salvar!"}'),
(15363147,	'dd552',	'dd389',	'dd395',	'no',	'si',	'si',	12,	'dd',	'si',	'',	'{"name":"no_se_encontraron_registros"}',	'{"name": "no_se_encontraron_registros"}',	'{"lg-cat": "No s''han trobat registres", "lg-deu": "Es wurden keine Einträge gefunden.", "lg-ell": "Δεν βρέθηκαν εγγραφές", "lg-eng": "No records found", "lg-fra": "Aucun dossier n''a été trouvé", "lg-ita": "Non hanno trovato registri", "lg-nep": "कुनै रेकर्ड भेटिएन", "lg-spa": "No se encontraron registros"}'),
(15363148,	'dd1377',	'dd622',	'dd1231',	'no',	'si',	'si',	19,	'dd',	'si',	'[{"dd592":"ww29"}]',	'{
  "data_to_be_used": "dato"
}',	NULL,	'{"lg-spa": "audiovisual"}'),
(15363149,	'dd708',	'dd622',	'dd1231',	'no',	'si',	'si',	15,	'dd',	'si',	'[{"dd352":"ww27"}]',	'{"DES__process_dato":"diffusion_sql::map_locator_to_terminoID"}',	NULL,	'{"lg-spa": "childrens"}'),
(15363150,	'dd1609',	'dd391',	'dd395',	'no',	'si',	'si',	88,	'dd',	'si',	NULL,	'{"name":"of"}',	'{"name": "of"}',	'{"lg-ara": "ل", "lg-cat": "de", "lg-deu": "von", "lg-ell": "του", "lg-eng": "of", "lg-fra": "de", "lg-ita": "di", "lg-nep": "को", "lg-spa": "de"}'),
(15363151,	'dd865',	'dd861',	'dd91',	'no',	'si',	'si',	4,	'dd',	'si',	'[{"dd9":"dd863"}]',	NULL,	NULL,	'{"lg-cat": "Llistat de registres", "lg-deu": "Liste der Einträge", "lg-eng": "List", "lg-fra": "Liste des enregistrements", "lg-ita": "Elenco dei registri", "lg-spa": "Listado de registros"}'),
(15363152,	'dd445',	'dd342',	'dd395',	'no',	'si',	'si',	1,	'dd',	'si',	'',	'{
  "name": "mover_datos_de_componentes"
}',	'{"name": "mover_datos_de_componentes"}',	'{"lg-cat": "Moure dades de components", "lg-deu": "Komponentendaten bewegen", "lg-eng": "Move component data", "lg-fra": "Déplacer les données des composants", "lg-ita": "Muovere dati dei componenti", "lg-spa": "Mover datos de componentes"}'),
(15363153,	'dd571',	'dd567',	'dd91',	'no',	'si',	'si',	5,	'dd',	'si',	'[{"dd9":"dd570"}]',	'',	NULL,	'{"lg-cat": "Llistat", "lg-deu": "Liste", "lg-eng": "List", "lg-fra": "Liste", "lg-ita": "Elenco", "lg-spa": "List"}'),
(15363154,	'dd1567',	'dd1514',	'dd347',	'no',	'si',	'si',	7,	'dd',	'no',	'[{"dd1229":"hierarchy65"},{"dd6":"ts1"}]',	NULL,	NULL,	'{"lg-spa": "ts_themes"}'),
(15363155,	'dd1568',	'dd1514',	'dd347',	'no',	'si',	'si',	8,	'dd',	'si',	'[{"dd1229":"hierarchy65"},{"dd6":"dc1"}]',	NULL,	NULL,	'{"lg-spa": "ts_chronological"}'),
(15363156,	'dd1570',	'dd1514',	'dd347',	'no',	'si',	'si',	10,	'dd',	'si',	'[{"dd1229":"hierarchy65"},{"dd6":"es1"}]',	NULL,	NULL,	'{"lg-spa": "tp_spain"}'),
(15363157,	'dd1571',	'dd1514',	'dd347',	'no',	'si',	'si',	11,	'dd',	'si',	'[{"dd1229":"hierarchy65"},{"dd6":"fr1"}]',	NULL,	NULL,	'{"lg-spa": "tp_france"}'),
(15363158,	'dd974',	'dd1308',	'dd177',	'no',	'si',	'si',	3,	'dd',	'no',	NULL,	NULL,	NULL,	'{"lg-cat": "Nou", "lg-deu": "Neu", "lg-eng": "New", "lg-fra": "Nouveau", "lg-ita": "Nuovo", "lg-spa": "Nuevo"}'),
(15363159,	'dd1611',	'dd342',	'dd395',	'no',	'si',	'si',	18,	'dd',	'si',	NULL,	'{"name":"register_tools"}',	'{"name": "register_tools"}',	'{"lg-cat": "Registrar eines", "lg-deu": "Werkzeugregister", "lg-ell": "Εγγραφή εργαλείου", "lg-eng": "Register tools", "lg-fra": "Outils d''enregistrement", "lg-ita": "Registro utensili", "lg-spa": "Registrar herramientas"}'),
(15363160,	'dd1574',	'dd1532',	'dd1681',	'no',	'si',	'si',	2,	'dd',	'no',	NULL,	NULL,	NULL,	'{"lg-cat": "Valor", "lg-deu": "Wert", "lg-eng": "Value", "lg-fra": "Valeur", "lg-spa": "Valor"}'),
(15363161,	'dd1612',	'dd391',	'dd395',	'no',	'si',	'si',	89,	'dd',	'si',	NULL,	'{"name":"value"}',	'{"name": "value"}',	'{"lg-cat": "Valor", "lg-deu": "Wert", "lg-ell": "αξία", "lg-eng": "Value", "lg-fra": "Valeur", "lg-ita": "Valore", "lg-nep": "मूल्य", "lg-spa": "Valor"}'),
(15363162,	'dd1613',	'dd692',	'dd395',	'no',	'si',	'si',	18,	'dd',	'si',	NULL,	'{"name":"duplicate"}',	'{"name": "duplicate"}',	'{"lg-cat": "Duplicar", "lg-deu": "Duplikat", "lg-ell": "Αντίγραφο", "lg-eng": "Duplicate", "lg-fra": "Dupliquer", "lg-ita": "Duplicare", "lg-nep": "नक्कल", "lg-spa": "Duplicar"}'),
(15363163,	'dd1704',	'dd542',	'dd1058',	'no',	'si',	'si',	3,	'dd',	'si',	'',	NULL,	'{"disable": true}',	'{"lg-cat": "Veure estadístiques", "lg-deu": "Statistiken", "lg-ell": "στατιστική", "lg-eng": "View Statistics", "lg-fra": "Statistiques", "lg-ita": "Statistiche", "lg-spa": "Estadísticas"}'),
(15363164,	'dd1580',	'dd390',	'dd395',	'no',	'si',	'si',	10,	'dd',	'no',	'null',	'{"name":"all_records_found"}',	'{"name": "all_records_found"}',	'{"lg-cat": "Tots registres els trobats", "lg-eng": "All records found", "lg-fra": "Tous les enregistrements trouvés", "lg-nep": "सबै रेकर्ड फेला पर्यो", "lg-spa": "Todos registros los encontrados"}'),
(15363165,	'dd1621',	'dd147',	'dd395',	'no',	'si',	'si',	24,	'dd',	'si',	NULL,	'{"name":"publish"}',	'{"name": "publish"}',	'{"lg-cat": "Publicar", "lg-deu": "Veröffentlichen", "lg-ell": "Δημοσιεύω", "lg-eng": "Publish", "lg-fra": "Publier", "lg-ita": "Pubblicare", "lg-nep": "प्रकाशित गर्नुहोस्", "lg-spa": "Publicar"}'),
(15363166,	'dd726',	'dd391',	'dd395',	'no',	'si',	'si',	18,	'dd',	'si',	'',	'{"name":"tamano"}',	'{"name": "size"}',	'{"lg-cat": "Tamany", "lg-deu": "Grösse", "lg-ell": "μέγεθος", "lg-eng": "Size", "lg-fra": "Taille", "lg-ita": "Grandezza", "lg-nep": "साइज", "lg-spa": "Tamaño"}'),
(15363167,	'dd1636',	'dd128',	'dd8',	'no',	'si',	'si',	3,	'dd',	'si',	NULL,	NULL,	'{"css": {".content_data": {"grid-template-columns": "1fr"}, ".wrapper_grouper": {"grid-column": "span 10"}}}',	'{"lg-cat": "Estadístiques", "lg-deu": "Statistiken", "lg-eng": "Statistics", "lg-eus": "Estatistikak", "lg-fra": "Statistiques", "lg-ita": "Statistiche", "lg-spa": "Estadísticas"}'),
(15363168,	'dd1711',	'dd389',	'dd395',	'no',	'si',	'si',	9,	'dd',	'si',	'',	'{
  "name": "fecha_o_rango_en_formato"
}',	'{"name": "fecha_o_rango_en_formato"}',	'{"lg-cat": "Data o rang en format DD/MM/YYYY ó DD/MM/YYYY-DD/MM/YYYY", "lg-deu": "Datum oder Datenspanne im Format TT/MM/JJJJ oder TT/MM/JJJJ-DD/MM/JJJJ", "lg-ell": "Ημερομηνία ή εύρος σε ΗΗ/ΜΜ/ΕΕΕΕ", "lg-eng": "Date o range with format DD/MM/YYYY ó DD/MM/YYYY-DD/MM/YYYY", "lg-fra": "Date ou plage de dates au format JJ/MM/AAAA ou JJ/MM/AAAA-JJ/MM/AAAA ou JJ/MM/AAAA-JJ/MM/AAAA", "lg-ita": "Data o campo in formato DD/MM/YYYY o DD/MM/YYYY - DD/MM/YYYY", "lg-nep": "DD/MM/YYYY वा DD/MM/YYYY-DD/MM/YYYY ढाँचाको मिति o दायरा", "lg-spa": "Fecha o rango en formato  DD/MM/YYYY ó DD/MM/YYYY-DD/MM/YYYY"}'),
(15363169,	'dd112',	'dd390',	'dd395',	'no',	'si',	'si',	3,	'dd',	'si',	'',	'{"name":"anadir_ficheros"}',	'{"name": "anadir_ficheros"}',	'{"lg-cat": "Afegir fitxers", "lg-deu": "Dateien hinzufügen", "lg-ell": "Προσθήκη αρχείων", "lg-eng": "Add files", "lg-fra": "Ajouter des fichiers", "lg-ita": "Aggiungere files", "lg-spa": "Añadir ficheros"}'),
(15363170,	'dd1584',	'dd319',	'dd395',	'no',	'si',	'si',	9,	'dd',	'si',	NULL,	'{"name":"shift_key"}',	'{"name": "shift_key"}',	'{"lg-cat": "Majúscules", "lg-ell": "Shift", "lg-eng": "Shift", "lg-fra": "Majuscules", "lg-ita": "Maiuscole", "lg-spa": "Mayúsculas"}'),
(15363171,	'dd1350',	'dd1582',	'dd580',	'no',	'si',	'si',	6,	'dd',	'no',	NULL,	'{"css":{".wrap_component":{"mixin":[".vertical"],"style":{"width":"100%"}}}}',	'{"css": {".wrapper_component": {"grid-column": "span 5"}, ".wrapper_component > .content_data": {"min-height": "64rem"}}}',	'{"lg-cat": "Tipus afectats:", "lg-deu": "Betrifft Typen: ", "lg-eng": "Affected types:", "lg-fra": "Affecte les types :", "lg-spa": "Afecta a tipos:"}'),
(15363172,	'dd1055',	'dd1133',	'dd339',	'no',	'si',	'si',	2,	'dd',	'no',	'[{"dd6":"dd64"},{"dd9":"dd62"}]',	'{"css":{".wrap_component":{"mixin":[".vertical"],"style":{"width":"12%"}}}}',	'{"css": {".wrapper_component": {"grid-column": "span 1"}}}',	'{"lg-cat": "Públic", "lg-deu": "Öffentlich", "lg-eng": "Public", "lg-fra": "Public", "lg-ita": "Pubblico", "lg-spa": "Público"}'),
(15363173,	'dd1340',	'dd1323',	'dd6',	'no',	'si',	'si',	2,	'dd',	'no',	'[{"dd6":"dd73"}]',	NULL,	NULL,	'{"lg-deu": "Werkzeugentwicklung", "lg-eng": "Tools development", "lg-fra": "Développement d''outils", "lg-spa": "Desarrollo de herramientas"}'),
(15363174,	'dd420',	'dd147',	'dd395',	'no',	'si',	'si',	12,	'dd',	'si',	NULL,	'{"name":"anyo"}',	'{"name": "year"}',	'{"lg-cat": "any", "lg-deu": "Jahr", "lg-ell": "έτος", "lg-eng": "year", "lg-fra": "année", "lg-ita": "Anno", "lg-nep": "वर्ष", "lg-spa": "año"}'),
(15363175,	'dd422',	'dd147',	'dd395',	'no',	'si',	'si',	14,	'dd',	'si',	NULL,	'{"name":"dia"}',	'{"name": "day"}',	'{"lg-cat": "dia", "lg-deu": "Tag", "lg-ell": "ημέρα", "lg-eng": "day", "lg-fra": "jour", "lg-ita": "Giorno", "lg-nep": "दिन", "lg-spa": "día"}'),
(15363176,	'dd1638',	'dd785',	'dd395',	'no',	'si',	'si',	73,	'dd',	'si',	NULL,	'{"name":"instalar"}',	'{"name": "instalar"}',	'{"lg-cat": "Instal·lar", "lg-eng": "Install", "lg-nep": "स्थापना गर्नुहोस्", "lg-spa": "Instalar"}'),
(15363177,	'dd1624',	'dd391',	'dd395',	'no',	'si',	'si',	93,	'dd',	'si',	NULL,	'{"name":"previous"}',	'{"name": "previous"}',	'{"lg-cat": "Previ", "lg-deu": "Vorherige", "lg-ell": "Προηγούμενος", "lg-eng": "Previous", "lg-fra": "Précédent", "lg-ita": "Precedente", "lg-nep": "अघिल्लो", "lg-spa": "Previo"}'),
(15363178,	'dd1634',	'dd923',	'dd1747',	'no',	'si',	'si',	1,	'dd',	'no',	NULL,	NULL,	'{"css": {".wrapper_component": {"grid-column": "span 1"}}}',	'{"lg-cat": "Id", "lg-deu": "Id", "lg-ell": "Id", "lg-eng": "Id", "lg-fra": "Id", "lg-ita": "Id", "lg-spa": "Id"}'),
(15363179,	'dd1588',	'dd389',	'dd395',	'no',	'si',	'si',	34,	'dd',	'si',	NULL,	'{"name":"alert_limit_of_emails"}',	'{"name": "alert_limit_of_emails"}',	'{"lg-eng": "Attention, exceeded the email limit.", "lg-fra": "Attention, la limite d''envoi a été dépassée.", "lg-spa": "Atención, superado el límite de correos."}'),
(15363180,	'dd1589',	'dd147',	'dd395',	'no',	'si',	'si',	19,	'dd',	'si',	NULL,	'{"name":"email"}',	'{"name": "email"}',	'{"lg-eng": "E-mail", "lg-fra": "E-mail", "lg-jpn": "Eメール", "lg-spa": "E-mail"}'),
(15363181,	'dd566',	'dd563',	'dd57',	'no',	'si',	'si',	3,	'dd',	'no',	'[{"dd6":"dd889"},{"dd9":"dd891"}]',	'{"type":{"float":2},"css":{".wrap_component":{"mixin":[".vertical"],"style":{"width":"50%"}}}}',	'{"css": {".wrapper_component": {"grid-column": "span 6"}}, "view": "rating"}',	'{"lg-cat": "Pes", "lg-deu": "Gewicht", "lg-ell": "Βάρος", "lg-eng": "Weight", "lg-fra": "Poids", "lg-ita": "Peso", "lg-spa": "Peso"}'),
(15363182,	'dd581',	'dd6',	NULL,	'si',	'si',	'si',	23,	'dd',	'no',	NULL,	NULL,	NULL,	'{"lg-spa": "time_machine_list"}'),
(15363183,	'dd1592',	'dd153',	'dd8',	'no',	'si',	'si',	3,	'dd',	'si',	NULL,	'{"css":{".wrap_section_group":{"style":{"display":"none"}}}}',	'{"css": {".content_data": {"grid-template-columns": "repeat(2, 1fr)"}}}',	'{"lg-eng": "Relations", "lg-fra": "Relations", "lg-spa": "Relaciones"}'),
(15363184,	'dd1458',	'dd1456',	'dd9',	'no',	'si',	'si',	2,	'dd',	'si',	NULL,	'{"css":{".wrap_component":{"mixin":[".vertical"],"style":{"width":"50%"}}}}',	'{"css": {".wrapper_component": {"grid-column": "span 5"}}}',	'{"lg-cat": "Categoria de protecció", "lg-deu": "Schutzkategorie", "lg-eng": "Protection category", "lg-fra": "Catégorie de protection", "lg-spa": "Categoría de protección"}'),
(15363185,	'dd1002',	'dd1003',	'dd9',	'no',	'si',	'si',	2,	'dd',	'no',	'',	'{"css":{".wrap_component":{"mixin":[".vertical",".line_top"],"style":{"width":"25%"}}}}',	'{"css": {".wrapper_component.edit": {"grid-column": "span 6"}}}',	'{"lg-cat": "Entitat", "lg-deu": "Einheit", "lg-ell": "Οντότητα", "lg-eng": "Entity", "lg-fra": "Entité", "lg-ita": "Entità", "lg-spa": "Entidad"}'),
(15363186,	'dd1006',	'dd1003',	'dd247',	'no',	'si',	'si',	6,	'dd',	'no',	NULL,	'{"css":{".wrap_component":{"mixin":[".vertical",".line_top"],"style":{"width":"50%"}}}}',	NULL,	'{"lg-cat": "Projecte", "lg-deu": "Projekt", "lg-eng": "Project", "lg-fra": "Projet", "lg-ita": "Progetto", "lg-spa": "Proyecto"}'),
(15363187,	'dd115',	'dd390',	'dd395',	'no',	'si',	'si',	6,	'dd',	'si',	'',	'{"name":"gestion_de_archivos"}',	'{"name": "gestion_de_archivos"}',	'{"lg-cat": "Gestió d''arxius", "lg-deu": "Dateiverwaltung", "lg-ell": "Διαχείριση αρχείων", "lg-eng": "Files manager", "lg-fra": "Gestion des archive", "lg-ita": "Gestione degli archivi", "lg-spa": "Gestión de archivos"}'),
(15363188,	'dd399',	'dd390',	'dd395',	'no',	'si',	'si',	12,	'dd',	'si',	'',	'{"name":"remove"}',	'{"name": "remove"}',	'{"lg-cat": "Llevar", "lg-deu": "Entfernen", "lg-ell": "αφαιρέσει", "lg-eng": "Remove", "lg-fra": "Retirer", "lg-ita": "Eliminare", "lg-nep": "हटाउनुहोस्", "lg-spa": "Quitar"}'),
(15363189,	'dd1044',	'dd390',	'dd395',	'no',	'si',	'si',	24,	'dd',	'si',	'null',	'{"name":"caracteres_por_linea"}',	'{"name": "caracteres_por_linea"}',	'{"lg-deu": "Zeichen pro Zeile", "lg-ell": "Χαρακτήρες ανά γραμμή", "lg-eng": "Characters per line", "lg-fra": "Caractères par ligne", "lg-ita": "Caratteri per linea", "lg-nep": "प्रति रेखा वर्णहरू", "lg-spa": "Caracteres por línea"}'),
(15363190,	'dd1113',	'dd390',	'dd395',	'no',	'si',	'si',	31,	'dd',	'si',	'null',	'{"name":"importar_ficheros"}',	'{"name": "importar_ficheros"}',	'{"lg-cat": "importar fitxers", "lg-deu": "Dateien importieren", "lg-ell": "εισαγωγή αρχείων", "lg-eng": "import files", "lg-fra": "Importer fichiers", "lg-ita": "Importare files", "lg-nep": "फाइलहरू आयात गर्नुहोस्", "lg-spa": "Importar ficheros"}'),
(15363191,	'dd1459',	'dd1456',	'dd10',	'no',	'si',	'si',	4,	'dd',	'si',	NULL,	'{"css":{".wrap_component":{"mixin":[".vertical",".line_top"],"style":{"width":"100%"}}}}',	'{"css": {".wrapper_component": {"grid-column": "span 10"}}}',	'{"lg-cat": "Descripció", "lg-deu": "Beschreibung", "lg-eng": "Description", "lg-fra": "Description", "lg-spa": "Descripción"}'),
(15363192,	'dd152',	'dd147',	'dd395',	'no',	'si',	'si',	3,	'dd',	'si',	'',	'{"name":"buscar"}',	'{"name": "find"}',	'{"lg-ara": "يجد", "lg-cat": "Cerca", "lg-deu": "Suchen", "lg-ell": "αναζήτησή", "lg-eng": "Search", "lg-fra": "Recherche", "lg-ita": "Cercare", "lg-nep": "खोज्नुहोस्", "lg-spa": "Buscar"}'),
(15363193,	'dd1528',	'dd899',	'dd1747',	'no',	'si',	'si',	1,	'dd',	'no',	'null',	NULL,	'{"css": {".wrapper_component": {"grid-column": "span 1"}}}',	'{"lg-cat": "Id", "lg-deu": "Id", "lg-ell": "Id", "lg-eng": "Id", "lg-fra": "Id", "lg-ita": "Id", "lg-spa": "Id"}'),
(15363194,	'dd1635',	'dd622',	'dd1231',	'no',	'si',	'si',	36,	'dd',	'no',	'[{"dd592":"ww48"}]',	'{"data_to_be_used":"dato"}',	NULL,	'{"lg-spa": "bibliography_data"}'),
(15363195,	'dd1273',	'dd622',	'dd1231',	'no',	'si',	'si',	27,	'dd',	'no',	'[{"dd592":"ww30"}]',	'{"process_dato":"diffusion_sql::resolve_value","process_dato_arguments":{"split_string_value":" | ","output":"merged","target_component_tipo":"rsc37"}}',	NULL,	'{"lg-spa": "pdf_resolved"}'),
(15363196,	'dd1256',	'dd622',	'dd1231',	'no',	'si',	'si',	28,	'dd',	'no',	'[{"dd592":"ww30"}]',	'{"process_dato":"diffusion_sql::resolve_value","process_dato_arguments":{"split_string_value":" | ","output":"merged","target_component_tipo":"rsc23"}}',	NULL,	'{"lg-spa": "pdf_title"}'),
(15363197,	'dd705',	'dd622',	'dd1235',	'no',	'si',	'si',	13,	'dd',	'si',	'[{"dd429":"ww28"}]',	'{"varchar":255,"process_dato":"diffusion_sql::map_locator_to_terminoID_parent","info":"map_locator_to_terminoID_parent force to update parent besides"}',	NULL,	'{"lg-spa": "parent"}'),
(15363198,	'dd1253',	'dd622',	'dd1231',	'no',	'si',	'si',	25,	'dd',	'no',	'[{"dd592":"ww31"}]',	'{"process_dato":"diffusion_sql::resolve_value","process_dato_arguments":{"split_string_value":" | ","output":"merged","target_component_tipo":"rsc29"}}',	NULL,	'{"lg-spa": "other_images_resolved"}'),
(15363199,	'dd452',	'dd129',	'dd9',	'no',	'si',	'si',	4,	'dd',	'no',	'',	'{"css":{".wrap_component":{"mixin":[".vertical"],"style":{"width":"25%"}},".content_data":{"style":{}}}}',	'{"css": {".wrapper_component": {"grid-row": "1", "grid-column": "span 2"}}}',	'{"lg-cat": "nom complet", "lg-deu": "Vollständiger Name", "lg-ell": "πλήρες όνομά", "lg-eng": "Full name", "lg-fra": "Nom complet", "lg-ita": "Nome completo", "lg-spa": "Nombre completo"}'),
(15363200,	'dd133',	'dd129',	'dd225',	'no',	'si',	'si',	8,	'dd',	'no',	'',	'{"mandatory":true,"css":{".wrap_component":{"mixin":[".vertical"],"style":{"width":"25%","background-color":"#FFE2AB","border-right":"1px solid #d0d0d0"}},".content_data":{"style":{}}}}',	'{"css": {".wrapper_component": {"grid-column": "span 3", "background-color": "#FFE2AB"}}, "mandatory": true}',	'{"lg-cat": "Contrasenya", "lg-deu": "Passwort", "lg-ell": "κωδικό", "lg-eng": "Password", "lg-eus": "Pasahitza", "lg-fra": "Mot de passe", "lg-ita": "Password", "lg-spa": "Contraseña"}'),
(15363201,	'dd515',	'dd129',	'dd57',	'no',	'si',	'si',	11,	'dd',	'no',	'[{"dd6":"dd64"},{"dd9":"dd62"}]',	'{"css":{".wrap_component":{"mixin":[".vertical"],"style":{"width":"25%"}}}}',	'{"css": {".wrapper_component": {"grid-row": "1", "grid-column": "4 / span 1"}}}',	'{"lg-cat": "Developer", "lg-deu": "Entwickler", "lg-ell": "Προγραμματιστής", "lg-eng": "Developer", "lg-fra": "Développeur", "lg-ita": "Sviluppatore", "lg-spa": "Desarrollador"}'),
(15363202,	'dd170',	'dd129',	'dd163',	'no',	'si',	'si',	12,	'dd',	'no',	'[{"dd9":"dd156"}]',	'{"css":{".wrap_component":{"style":{"width":"55%"}}}}',	'{"css": {".wrapper_component": {"grid-column": "span 4"}, ".wrapper_component >.content_data": {"max-height": "none"}}}',	'{"lg-cat": "Projectes", "lg-deu": "Projekte", "lg-ell": "έργα", "lg-eng": "Projects", "lg-fra": "Projets", "lg-ita": "Progetti", "lg-spa": "Proyectos"}'),
(15363203,	'dd1603',	'dd129',	'dd9',	'no',	'si',	'si',	14,	'dd',	'no',	NULL,	'{"css":{".wrap_component":{"style":{"width":"10%"}}}}',	'{"css": {".wrapper_component": {"grid-row": "1", "grid-column": "6 / span 1"}}}',	'{"lg-cat": "Secció per defecte", "lg-deu": "Standardabschnitt", "lg-ell": "Προεπιλεγμένη ενότητα", "lg-eng": "Default section", "lg-fra": "Section par défaut", "lg-spa": "Sección por defecto"}'),
(15363204,	'dd1409',	'dd1392',	'dd352',	'no',	'si',	'si',	2,	'dd',	'no',	NULL,	'{"css":{".wrap_component":{"mixin":[".vertical"],"style":{"width":"25%"}}}}',	'{"source": {"records_mode": "list", "request_config": [{"sqo": {"section_tipo": [{"source": "self"}]}, "show": {"ddo_map": [{"tipo": "dd1399", "parent": "self", "section_tipo": "self", "value_with_parents": true}, {"tipo": "dd1401", "parent": "self", "section_tipo": "hierarchy1"}]}}]}}',	'{"lg-deu": "Unterbegriffe", "lg-eng": "Children", "lg-fra": "Enfants", "lg-spa": "Hijos"}'),
(15363205,	'dd1413',	'dd1100',	'dd91',	'no',	'si',	'si',	5,	'dd',	'no',	'[{"dd339":"dd1398"},{"dd11":"dd1442"},{"dd9":"dd1399"},{"dd11":"dd1430"},{"dd11":"dd1389"},{"dd9":"dd1465"},{"dd11":"dd1394"},{"dd9":"dd1393"},{"dd57":"dd1396"},{"dd57":"dd1395"},{"dd9":"dd1401"},{"dd318":"dd1402"},{"dd318":"dd1403"},{"dd592":"dd1408"},{"dd592":"dd1407"},{"dd592":"dd1555"},{"dd592":"dd1404"}]',	NULL,	'{"source": {"request_config": [{"sqo": {"section_tipo": [{"value": ["dd1100"], "source": "section"}]}, "show": {"ddo_map": [{"info": "Publishable component_publication", "tipo": "dd1398", "width": "4.5rem", "parent": "self", "section_tipo": "self"}, {"info": "Web element type component_select", "tipo": "dd1442", "width": "4.5rem", "parent": "self", "section_tipo": "self"}, {"info": "Name component_input_text", "tipo": "dd1399", "width": "minmax(10rem, 1fr)", "parent": "self", "section_tipo": "self"}, {"info": "Title component_input_text", "tipo": "dd1401", "parent": "self", "section_tipo": "self"}, {"info": "Renderer component_select", "tipo": "dd1430", "width": "6rem", "parent": "self", "section_tipo": "self"}, {"info": "CSS class component_select", "tipo": "dd1389", "parent": "self", "section_tipo": "self"}, {"info": "CSS modificator component_input_text", "tipo": "dd1465", "parent": "self", "section_tipo": "self"}, {"info": "Template component_select", "tipo": "dd1394", "parent": "self", "section_tipo": "self"}, {"info": "URI component_input_text", "tipo": "dd1393", "width": "4.5rem", "parent": "self", "section_tipo": "self"}, {"info": "In menu component_radio_button", "tipo": "dd1396", "parent": "self", "section_tipo": "self"}, {"info": "Active component_radio_button", "tipo": "dd1395", "parent": "self", "section_tipo": "self"}, {"info": "Abstract component_text_area", "tipo": "dd1402", "parent": "self", "section_tipo": "self"}, {"info": "PDF component_portal", "tipo": "dd1408", "width": "102px", "parent": "self", "section_tipo": "self"}, {"info": "PDF doc component_pdf", "tipo": "rsc37", "width": "102px", "parent": "dd1408", "section_tipo": "rsc176"}, {"info": "AV component_portal", "tipo": "dd1407", "width": "102px", "parent": "self", "section_tipo": "self"}, {"info": "AV video component_av", "tipo": "rsc35", "width": "102px", "parent": "dd1407", "section_tipo": "rsc167"}, {"info": "SVG portal", "tipo": "dd1555", "width": "102px", "parent": "self", "section_tipo": "self"}, {"info": "SVG file component_svg", "tipo": "rsc855", "width": "102px", "parent": "dd1555", "section_tipo": "rsc302"}, {"info": "Identifying image component_portal", "tipo": "dd1404", "width": "102px", "parent": "self", "section_tipo": "self"}, {"info": "Identifying image component_image", "tipo": "rsc29", "width": "102px", "parent": "dd1404", "section_tipo": "rsc170"}], "fields_separator": " | "}, "api_engine": "dedalo"}]}}',	'{"lg-deu": "Liste", "lg-eng": "list", "lg-fra": "Liste", "lg-spa": "Listado"}'),
(15363206,	'dd846',	'dd440',	'null',	'si',	'si',	'si',	16,	'dd',	'no',	'',	'',	NULL,	'{"lg-spa": "component_state"}'),
(15363207,	'dd305',	'dd427',	'dd206',	'no',	'si',	'si',	11,	'dd',	'no',	'',	NULL,	NULL,	'{"lg-eng": "Drawing image tag", "lg-spa": "Etiqueta de dibujos de imagen"}'),
(15363208,	'dd749',	'dd440',	'null',	'si',	'si',	'si',	17,	'dd',	'no',	'',	'',	NULL,	'{"lg-spa": "component_image"}'),
(15363209,	'dd128',	'dd207',	'dd6',	'no',	'si',	'si',	1,	'dd',	'no',	'[{"dd626":"dd1719"}]',	'{"info":"Propiedades NO standarizadas. Sólo en puebas","section_config":{"list_line":"single"},"css":{".wrap_component_dd515":{"style":{"width":"50%"}},".wrap_component_dd170":{"style":{"width":"50%"}},".wrap_component_dd135":{"style":{"width":"50%","height":"400px"}},".wrap_component_dd522":{"style":{"width":"50%"}}}}',	NULL,	'{"lg-cat": "Usuaris", "lg-deu": "Benutzernamen", "lg-ell": "χρήστες", "lg-eng": "Users", "lg-fra": "Utilisateurs", "lg-ita": "Utenti", "lg-nep": "प्रयोगकर्ताहरू", "lg-spa": "Usuarios"}'),
(15363210,	'dd234',	'dd207',	'dd6',	'no',	'si',	'si',	2,	'dd',	'no',	'[{"dd626":"dd1721"}]',	'{
  "info": "Propiedades NO standarizadas. Sólo en puebas",
  "section_config": {
    "list_line": "single"
  }
}',	'{"info": "Propiedades NO standarizadas. Sólo en puebas", "section_config": {"list_line": "single"}}',	'{"lg-cat": "Perfils", "lg-deu": "Profile", "lg-ell": "προφίλ", "lg-eng": "Profiles", "lg-fra": "Profils", "lg-ita": "Profili", "lg-nep": "प्रोफाइलहरू", "lg-spa": "Perfiles"}'),
(15363211,	'dd153',	'dd207',	'dd6',	'no',	'si',	'si',	3,	'dd',	'no',	'[{"dd626":"dd1720"}]',	'{
  "info": "Propiedades NO standarizadas. Sólo en puebas",
  "section_config": {
    "list_line": "single"
  }
}',	'{"info": "Propiedades NO standarizadas. Sólo en puebas", "section_config": {"list_line": "single"}}',	'{"lg-cat": "Projectes", "lg-deu": "Projekte", "lg-ell": "έργα", "lg-eng": "Projects", "lg-fra": "Projets", "lg-ita": "Progetti", "lg-nep": "परियोजनाहरू", "lg-spa": "Proyectos"}'),
(15363212,	'dd150',	'dd147',	'dd395',	'no',	'si',	'si',	4,	'dd',	'si',	NULL,	'{"name":"acabado"}',	'{"name": "acabado"}',	'{"lg-cat": "Acabat", "lg-deu": "Beendet", "lg-ell": "τελικού", "lg-eng": "Finish", "lg-fra": "Terminer", "lg-ita": "Terminato", "lg-nep": "समाप्त गर्नुहोस्", "lg-spa": "Acabado"}'),
(15363213,	'dd1546',	'dd540',	'dd395',	'no',	'si',	'si',	6,	'dd',	'si',	NULL,	'{"name":"historial_del_componente"}',	'{"name": "component_history"}',	'{"lg-ara": "تاريخ المكونات", "lg-cat": "Històric del component", "lg-deu": "Komponentenverlauf", "lg-ell": "Ιστορικό συστατικών", "lg-eng": "Component history", "lg-fra": "Historique des composants", "lg-nep": "घटक इतिहास", "lg-spa": "Historial del componente"}'),
(15363214,	'dd900',	'dd899',	'dd9',	'no',	'si',	'si',	2,	'dd',	'si',	'',	NULL,	'{"css": {".wrapper_component": {"grid-column": "span 5"}}}',	'{"lg-cat": "Lloc de captació", "lg-deu": "Ort der Erfassung", "lg-ell": "τόπος απορροής", "lg-eng": "Place of capture", "lg-fra": "Zone de chalandise", "lg-ita": "Luogo di raccolta", "lg-spa": "Lugar de captación"}'),
(15363215,	'dd1053',	'dd129',	'dd9',	'no',	'si',	'si',	10,	'dd',	'no',	NULL,	'{"mandatory":true,"unique":{"check":true,"disable_save":true,"server_check":true},"css":{".wrap_component":{"mixin":[".vertical"],"style":{"width":"20%","background-color":"#FFE2AB","border-right":"1px solid #d0d0d0","clear":"left"}}}}',	'{"css": {".wrapper_component": {"grid-column": "span 2", "background-color": "#FFE2AB"}}, "unique": {"check": true, "disable_save": true, "server_check": true}, "mandatory": true}',	'{"lg-cat": "Codi", "lg-deu": "Code", "lg-ell": "Κωδικός", "lg-eng": "Code", "lg-fra": "Code", "lg-ita": "Codice", "lg-spa": "Código"}'),
(15363216,	'dd1135',	'dd1133',	'dd9',	'no',	'si',	'si',	3,	'dd',	'si',	'',	'{"css":{".wrap_component":{"mixin":[".vertical"],"style":{"width":"50%"}}}}',	'{"css": {".wrapper_component": {"grid-column": "span 5"}}}',	'{"lg-cat": "Col·lecció / arxiu", "lg-deu": "Sammlung / Archiv", "lg-ell": "Συλλογή / αρχείο", "lg-eng": "Collection / archive", "lg-fra": "Collection / archive", "lg-ita": "Collezione / archivio", "lg-spa": "Colección / archivo"}'),
(15363217,	'dd1641',	'dd342',	'dd395',	'no',	'si',	'si',	19,	'dd',	'si',	NULL,	'{"name":"build_install_version"}',	'{"name": "build_install_version"}',	'{"lg-cat": "Construir una versió d''instal·lació", "lg-deu": "Erstellen Sie eine Installationsversion", "lg-ell": "Δημιουργήστε μια έκδοση εγκατάστασης", "lg-eng": "Build install version", "lg-fra": "Créer une version d''installation", "lg-ita": "Crea una versione di installazione", "lg-por": "Crie uma versão de instalação", "lg-spa": "Construir una versión de instalación"}'),
(15363218,	'dd433',	'dd1133',	'dd9',	'no',	'si',	'si',	4,	'dd',	'si',	NULL,	'{"css":{".wrap_component":{"mixin":[".vertical"],"style":{"width":"30%"}}}}',	'{"css": {".wrapper_component": {"grid-column": "span 3"}}}',	'{"lg-cat": "Acronimo", "lg-deu": "Akronym", "lg-ell": "ακρώνυμο", "lg-eng": "Acronym", "lg-fra": "Acronyme", "lg-ita": "Acronimo", "lg-spa": "Acrónimo"}'),
(15363219,	'dd336',	'dd147',	'dd395',	'no',	'si',	'si',	8,	'dd',	'si',	NULL,	'{"name":"actualizar"}',	'{"name": "update"}',	'{"lg-cat": "Actualitzar", "lg-deu": "Aktualisieren", "lg-ell": "επικαιροποίηση", "lg-eng": "Update", "lg-fra": "Actualiser ", "lg-ita": "Aggiornare", "lg-nep": "अपडेट गर्नुहोस्", "lg-spa": "Actualizar"}'),
(15363220,	'dd622',	'dd348',	'dd1229',	'no',	'si',	'si',	3,	'dd',	'si',	'[{"dd6":"ww10"}]',	NULL,	NULL,	'{"lg-spa": "Web"}'),
(15363221,	'dd563',	'dd562',	'dd8',	'no',	'si',	'si',	1,	'dd',	'no',	NULL,	NULL,	'{"css": {".content_data": {"grid-template-columns": "repeat(10, 1fr)"}}}',	'{"lg-cat": "Identificació", "lg-deu": "Identifizierung", "lg-ell": "αναγνώριση", "lg-eng": "Identification", "lg-fra": "Identification", "lg-ita": "Identificazione", "lg-spa": "Identificación"}'),
(15363222,	'dd803',	'dd391',	'dd395',	'no',	'si',	'si',	49,	'dd',	'si',	'',	'{"name":"completo"}',	'{"name": "full"}',	'{"lg-cat": "complet", "lg-deu": "Komplett", "lg-ell": "γεμάτος", "lg-eng": "full", "lg-fra": "complet", "lg-ita": "completo", "lg-nep": "पूर्ण", "lg-spa": "completo"}'),
(15363223,	'dd1652',	'dd898',	'dd177',	'no',	'si',	'si',	3,	'dd',	'no',	NULL,	NULL,	NULL,	'{"lg-cat": "Nou", "lg-eng": "New", "lg-spa": "Nuevo"}'),
(15363224,	'dd1653',	'dd898',	'dd183',	'no',	'si',	'si',	4,	'dd',	'no',	NULL,	NULL,	NULL,	'{"lg-cat": "Esborrar", "lg-eng": "Delete", "lg-spa": "Borrar"}'),
(15363225,	'dd1614',	'dd147',	'dd395',	'no',	'si',	'si',	20,	'dd',	'si',	NULL,	'{"name":"component"}',	'{"name": "component"}',	'{"lg-cat": "Component", "lg-deu": "Komponente", "lg-ell": "Συστατικό", "lg-eng": "Component", "lg-fra": "Composant", "lg-ita": "Componente", "lg-nep": "कम्पोनेन्ट", "lg-spa": "Componente"}'),
(15363226,	'dd1616',	'dd147',	'dd395',	'no',	'si',	'si',	22,	'dd',	'si',	NULL,	'{"name":"translatable"}',	'{"name": "translatable"}',	'{"lg-cat": "Traduïble", "lg-deu": "Übersetzbar", "lg-ell": "Μεταφράσιμος", "lg-eng": "Translatable", "lg-fra": "Traductible", "lg-ita": "Traducibile", "lg-nep": "अनुवाद योग्य", "lg-spa": "Traducible"}'),
(15363227,	'dd382',	'dd381',	'dd8',	'no',	'si',	'si',	1,	'dd',	'no',	NULL,	NULL,	'{"css": {".content_data": {"grid-template-columns": "repeat(10, 1fr)"}}}',	'{"lg-cat": "Identificació", "lg-deu": "Identifizierung", "lg-ell": "αναγνώριση", "lg-eng": "Identification", "lg-fra": "Identification", "lg-ita": "Identificazione", "lg-spa": "Identificación"}'),
(15363228,	'dd1526',	'dd1319',	'dd1747',	'no',	'si',	'si',	1,	'dd',	'no',	'null',	NULL,	'{"css": {".wrapper_component": {"grid-column": "span 1"}}}',	'{"lg-cat": "Id", "lg-deu": "Id", "lg-ell": "Id", "lg-eng": "Id", "lg-fra": "Id", "lg-ita": "Id", "lg-spa": "Id"}'),
(15363229,	'dd372',	'rsc480',	'dd6',	'no',	'si',	'si',	6,	'dd',	'no',	'[{"dd626":"dd22"}]',	NULL,	'{"color": "#e4b387"}',	'{"lg-cat": "Partits polítics", "lg-deu": "Politische Parteien", "lg-ell": "τα πολιτικά κόμματα", "lg-eng": "Political parties", "lg-fra": "Partis politiques", "lg-ita": "Partiti politici", "lg-spa": "Partidos políticos"}'),
(15363230,	'dd1320',	'dd1319',	'dd9',	'no',	'si',	'si',	3,	'dd',	'si',	'',	'{"css":{".wrap_component":{"mixin":[".vertical"],"style":{"width":"75%"}}}}',	'{"css": {".wrapper_component": {"grid-column": "span 5"}}}',	'{"lg-cat": "Tipologia de projecte", "lg-deu": "Typologie des Projektes", "lg-ell": "Τύπους έργων", "lg-eng": "Typology of project", "lg-fra": "Typologie de projets", "lg-ita": "Tipologia di progetto", "lg-spa": "Tipología de proyecto"}'),
(15363231,	'dd1369',	'dd785',	'dd395',	'no',	'si',	'si',	77,	'dd',	'si',	'null',	'{"name":"reading"}',	'{"name": "reading"}',	'{"lg-cat": "Llegint", "lg-deu": "Lesen", "lg-ell": "Ανάγνωση", "lg-eng": "Reading", "lg-fra": "Lecture", "lg-ita": "Lettura", "lg-spa": "Leyendo"}'),
(15363232,	'dd1381',	'dd785',	'dd395',	'no',	'si',	'si',	60,	'dd',	'si',	NULL,	'{
  "name": "tool_qr"
}',	'{"name": "tool_qr"}',	'{"lg-cat": "Codis QR", "lg-deu": "QR-Codes", "lg-ell": "Κωδικοί QR", "lg-eng": "QR codes", "lg-fra": "QR Codes", "lg-ita": "Codici QR", "lg-spa": "Códigos QR"}'),
(15363233,	'dd1597',	'dd1132',	'dd58',	'no',	'si',	'si',	6,	'dd',	'si',	NULL,	NULL,	NULL,	'{"lg-cat": "Relacions", "lg-eng": "Relations", "lg-fra": "Relations", "lg-spa": "Relaciones"}'),
(15363234,	'dd130',	'dd128',	'dd91',	'no',	'si',	'si',	5,	'dd',	'si',	'[{"dd9":"dd132"},{"dd9":"dd134"},{"dd57":"dd131"},{"dd1724":"dd1725"},{"dd80":"dd170"},{"dd10":"dd135"}]',	'',	NULL,	'{"lg-cat": "Llistat de registres", "lg-deu": "Liste der Spalten", "lg-eng": "Rows list", "lg-fra": "Liste des enregistrements", "lg-ita": "Lista dei registri", "lg-spa": "Lista de registros"}'),
(15363235,	'dd239',	'dd234',	'dd91',	'no',	'si',	'si',	6,	'dd',	'si',	'[{"dd9":"dd237"},{"dd10":"dd238"}]',	'',	NULL,	'{"lg-cat": "Llistat", "lg-deu": "Liste", "lg-ell": "κατάλογος", "lg-eng": "List", "lg-fra": "lista", "lg-ita": "Lista", "lg-spa": "lista"}'),
(15363236,	'dd1662',	'dd622',	'dd1231',	'no',	'si',	'si',	29,	'dd',	'si',	'[{"dd592":"ww30"}]',	'{"process_dato":"diffusion_sql::resolve_value","process_dato_arguments":{"split_string_value":" | ","output":"merged","target_component_tipo":"rsc1166"}}',	NULL,	'{"lg-spa": "pdf_summary"}'),
(15363237,	'dd1439',	'dd622',	'dd1233',	'no',	'si',	'si',	3,	'dd',	'si',	'[{"dd57":"ww14"}]',	'{"info":"For construct the ENUM value of the field, it need to be changed from the -dato- (without language) to the final -enum- value, dato:enumvalue","data_to_be_used":"dato","enum":{"1":"yes","2":"no"}}',	NULL,	'{"lg-spa": "active"}'),
(15363238,	'dd714',	'dd622',	'dd1231',	'no',	'si',	'si',	20,	'dd',	'si',	'[{"dd592":"ww22"}]',	'{"process_dato":"diffusion_sql::resolve_value","process_dato_arguments":{"target_component_tipo":"rsc29","***dato_splice":[1],"split_string_value":" | ","output":"merged"}}',	NULL,	'{"lg-spa": "identify_image"}'),
(15363239,	'dd639',	'dd622',	'dd1231',	'no',	'si',	'si',	21,	'dd',	'si',	'[{"dd432":"ww34"}]',	NULL,	NULL,	'{"lg-spa": "indexations"}'),
(15363240,	'dd1024',	'dd622',	'dd1231',	'no',	'si',	'si',	22,	'dd',	'no',	'[{"dd431":"ww32"}]',	'{"process_dato":"diffusion_sql::map_locator_to_terminoID"}',	NULL,	'{"lg-spa": "related"}'),
(15363241,	'dd1255',	'dd622',	'dd1235',	'no',	'si',	'si',	30,	'dd',	'si',	'[{"dd635":"ww38"}]',	'{"process_dato":"diffusion_sql::split_date_range","process_dato_arguments":{"selected_key":0,"selected_date":"start","date_format":"unix_timestamp"},"varchar":16}',	NULL,	'{"lg-spa": "date_in"}'),
(15363242,	'dd96',	'dd427',	'dd206',	'no',	'si',	'si',	4,	'dd',	'no',	'',	'',	NULL,	'{"lg-cat": "indexació", "lg-deu": "Indexierung", "lg-ell": "Ευρετηρίαση", "lg-eng": "Indexation", "lg-fra": "Indexation", "lg-ita": "Indicizzazione", "lg-nep": "अनुक्रमणिका", "lg-spa": "Indexación"}'),
(15363243,	'dd1018',	'dd440',	'null',	'si',	'si',	'si',	11,	'dd',	'si',	'',	'',	NULL,	'{"lg-spa": "component_pdf"}');

-- 2024-11-01 12:16:31.239815+01
