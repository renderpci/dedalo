 /* Borrar los municipios de Navarra */

Delete	matrix_descriptors 
From	matrix_descriptors
inner join jer_es on
        jer_es.terminoID = matrix_descriptors.parent
where	jer_es.modelo = 'es8872'    and
jer_es.esmodelo = 'no'      and 
jer_es.parent = 'es8827';

Delete	
From 	jer_es
where	jer_es.modelo = 'es8872'    and
jer_es.esmodelo = 'no'      and 
jer_es.parent = 'es8827';

/* Borrar las comarcas de Navarra */

Delete	matrix_descriptors 
From	matrix_descriptors
inner join jer_es on
        jer_es.terminoID = matrix_descriptors.parent
where	jer_es.modelo = 'es8871'    and
jer_es.esmodelo = 'no'      and 
jer_es.parent = 'es8827';

Delete	
From 	jer_es
where	jer_es.modelo = 'es8871'    and
jer_es.esmodelo = 'no'      and 
jer_es.parent = 'es8827';
