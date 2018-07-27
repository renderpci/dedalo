**UPDATES AND CHANGES**

*Ver 4.9.0 - 14-05-2018
Today we introduce the update of the V4 to 4.9.0

This update fixed some issues and bugs for the V4.8.4

This version change the format of the component_filter, named project inside the records. This version ends the transition of the all component_relations to new model and apply the new search version.

The component_filter chang the format from the traditional object {"1":"2"} to the normalized locator [{"section_id":"1", "section_tipo":"dd153"}].

And the new relation model add to the locator the new two propieties "from_component_tipo" with the tipo of the compoment that has the information and the "type" with the normalized type relation: 
	[{"type":"dd675","section_id":"1","section_tipo":"dd153","from_component_tipo":"mdcat1487"}]

This version fix some issues in the search and close the beta situation with the new search model. 

The next step will be the addaptation of our model to the SQL/JSON:2016 that will be implemented in postgres this year.


*Ver 4.8.4 - 28-03-2018
Today we introduce the update of the V4 to 4.8.4

This update fixed some issues and bugs for the V4.8.3

This version implement the new search to the thesaurus context. The new filter do joins between main secion to sections that has relations and we uptade the concept to build joins with multiple sections to multiple sections. The concept is that the user need search between multiple main sections, for ex: toponymy that the main sections can be: Spain, France, Italy, etc... es1, fr1, it1, etc... Normally the components of this sections will be the same, like term component, that is because the thesarurs, normally, is builded like virtual sections of the "real" thesaurus section.

We introduce into the JSON_QUERY_OBJECT the propertie "section", one array of main sections. If this array is configurated with more that 1 section, the joins will be named with "mix" in the main path (first section_tipo in normal position). And will be builded the WHERE clause with all sections of the array.

Limitations of the search: today the search can use ONLY one matrix table for the main sections, for ex: 
	- matrix_hierarchy for sections es1, fr1, it1, etc
but is not possible use two matrix tables for the main sections, for ex:
	- matrix_hierarchy for es1,fr1,it1, etc
	- matrix_languages for lg1
This limitation is only for MAIN sections (the first position of the path), not for the relations (second or more deep positions in the path), that can be in multiple tables:
	- matrix for oh1 and relations with matrix_list, matrix_hierarchy, matrix_langs, etc
This limitation is not a problem and we don't change it for now. 

*Ver 4.8.3 - 03-03-2018
Today we introduce the update of the V4 to 4.8.3

This update fixed some issues and bugs for the V4.8.2

The full implementation of the new search model. The test of the 4.8.2 was great!, the new model work perfectly and now is implemented for all sections and components. New filter diseny, and new features are added.

Components:
	add the new search to all components. Now the operators are calculated inside the components.
	section_records : added init with css / js files to load options
	component_relation_related : Fix autosearch feature. (Set search_query_object as allow_sub_select_by_id=false to avoid use id's window query)

*Ver 4.8.2 - 14-02-2018
Today we introduce the update of the V4 to 4.8.2

This update fixed some issues and bugs for the V4.8.1

The first version of the new search, was changed only the component_autocompolete for test the new search model before implemented it.
This version implement the new model for the search but sustain the old serch, the new model is implemented in the component_autocomplete and is tested only in the monedaiberica instalation, this version is ONLY A TEST version. 

*Ver 4.8.1 - 07-02-2018
Today we introduce the update of the V4 to 4.8.1

This update fixed some issues and bugs for the V4.8.0

This version remove the inverse locators of the sections, now, the section can calculate the inverse locator in real time when is demanded.
All components that has use the inverse locators are changed to calculate it if is necessary.

	inverse_locators : 	review all classes to unify new inverse locator format (using from_component_tipo, from_section_tipo, from_section_id)

Components:
	component_image : fixed issues with canvas resize and view
	component_number : 	set js validator/formater to force always . instaed , php controller to format float numbers with "." instead "," when show, print, etc
	component_text_area : added method fix_broken_peson_tags to fix untranslated person info

Tools:
	refactoring of the tool_import_files, now the tool can be configated for upload files, and control the destination of the uploads, now the tool has three new concepts; 
			1 - the name of the files can indicate the field (component) that will be store it
					mi foto bonita-a.jpeg
						the image will be store inside the field a (configuration is in the structure)
					mi otra foto-b.jpeg
						the image will be store inside the field b (configuration is in the structure)
			2 - the name of the files can indicate the record (section_id) that will be store it
					1-mifoto.jpeg
						the image will be store in the section_id: 1 (configuration field is the default portal field for image in the structure)
					2-mi otra foto.jpg
						the image will be store in the section_id: 2 (configuration field is the default portal field for image in the structure)
					alternative:
						the name can indicate the row of the portal in second step:
						1-1.jpg
							the image will be store in the section_id: 1 and the first row of the portal image(configuration field is the default portal field for image in the structure)
						1-2.jpeg
							the image will be store in the section_id: 2 and the first row of the portal image(configuration field is the default portal field for image in the structure)
			3 - the name of the files can indicate same record when the names are the same:
						mi foto-a.jpg
						mi foto-b.jpg
							the same name of the images "mi foto" indicate that the images are of the same "section_id" the -a or -b indicate the field. If the field are not indicated the imagesm, the images will be stored in the same section_id inside the default portal of the image in the same row, (the second image replace the first). If the field is indicated the photo "-a" will go to the field "a" indicated in the structure, the image "-b" will be stored in the same "section_id" but in the field "b".

			This 3 configurations can be combinated for control the destinations.

				1-1-a.jpg
				1-2-a.jpg
				1-1-b.jpg
				1-2-b.jpg

	tool_import_files : Added new options: 
						Import file name mode (to process smart numered images)
						Image processor selector (to trigger predefined in 'propiedades' scripts and commands)
						Target component (to select different target components from importer)

Diffusion:
		diffusion_sql : split_date_range . added function to select/split date ranges to sql columns


*Ver 4.8.0 - 26-11-2017
Today we introduce the update of the V4 to 4.8.0

This update fixed some issues and bugs for the V4.7.1

Major update of Dédalo!

IMPORTANT:

This version change all realtion components to new format, now the locator(dato) is stored in a unique container in matrix, this container named "relations" is inside to the section and is outside of the clasical "components" container.

The new locator introduce the concept of "from_", the classical format of the locator point to the destination of the information:

	{
		"section_tipo":"oh1",
		"section_id":1,
		"component_tipo":"oh24",
		"tag_id":4
	}

locate the destination information, "chilren inforamtion" of the component.
Now the locator introduce the orgien concept:
	{
		"section_tipo":"oh1",
		"section_id":1,
		"component_tipo":"oh24",
		"tag_id":4,
		"from_component_tipo":"oh12"
	}

from_component_tipo, say the origen of the locator, and it open the possiblity that eliminate the "tipo" inside the section JSON in matrix.

Now the section has two dato containers:
	"relations"
	"components"

	- relations: will store only the information of the all components_relations, like component_portal, component_autocomplete, component_select, component_radio_button, etc, this information always will be locators.

	-"components": will store the dato information of the components that has alfanumeric, date, ... information, this container is not changed in this version, the structurarion of this container is the same that in previuos version.

MATRIX:

	This version create the new "relations" table, this change store the connections between information store inside the locators. This table split the locator in classical columns for index it and speed the search inside.
	This table is only a cache of the relations, this information can be recreated if the information store inside was de-syncronized with the real information.
	The components_relations will store your own data in locator format in the matix sections and in the new relations table.


SEARCH:
		The 4.8 versions will replace the old search and filter, the new search concept is based in the relations of the documents that Dédalo manage. The target of the new search archiquecture is make possible the find in the deeper data, folowing the locator indications to the documents that has links with the origin section. The new search will can locate any related information, independent of the steps or relations that it has with the origin document.

		New "search_object" based in JSON. Every component can defined your path and the operators that will be parse to SQL. the search_object unify the model and options of search. This has a client part in js that tranform the DOM to the object that will send to PHP to be parsed for the components for analize the operators and options and finaly will be parse to SQL.

		The new search will be stored in a section_list inside Postgres, leave the SESION model of the old search, the new filter can be reused for users, because the "search_object" can be saved like a presets. The presets can save the components and the data of the searches.

section : unified save_component_dato. Now all (direct and relation) components save using this method 
		component_relation_common : changed the component data manager to converge with standard components 
		tool_portal : js : fixed bug when section_id is parsed as int (incompatible with temp section_id)
		tool_common : propagate_temp_section_data : added relation components propagate dato loosed feature
		trigger.import_files : updated component_portal add new element method for compatibility with version >=4.8




*Ver 4.7.1 - 12-11-2017
Today we introduce the update of the V4 to 4.7.1

This update fixed some issues and bugs for the V4.7.0

component_reference_common: Update the db connection of component_reference_common for compatibility with postgreSQL 10

diffusion_sql : added map_locator_to_terminoID_parent method to update parent on publish term (useful in web thesaurus applications)

section_records : added debug info. JSON visualization of actual search options

section : removed method add_relations. Now, relations are added individually

component_relation_common : set_dato now is compatible with new relation type 'link' for future portals and autocompletes 

component_relation_autocomplete : added transition component for replacement of actual component_autocomplete


*Ver 4.7.0 - 18-09-2017
Today we introduce the update of the V4 to 4.7.0

This update fixed some issues and bugs for the V4.5.1

IMPORTANT:

The next version will be removed old jer_xx tables in SQL, the suppor for the thesaurus v3 will be completed removed and all data into the SQL will be removed. Please change the data into the new JSON format. This is the last call for do it.

Tables the will be removed:
jer_xx (every public table that beging with jer_ except the internal table "jer_dd" - stucture -that will not removed)
jerarquia
jerarquia_tipos
matrix_descriptors (the internal matrix_descriptors_dd - structure - will not removed)

In this version the install database don't have the toponymy data, you need import the data of the country that you will need.

- IMPORT TOPONYMY

1 first create the toponymy into the Hierarchy menu into THesaurus:
	login in Dédalo
	go to Thesaurus -> Hierarchy
	find the country that you want import
	edit the country
	change the "active" field to "Yes"
	press the "Generate" button

2 Now the toponymy is ready for import the data in SQL.

 	logout Dédalo
 	go to: /dedalo/install/import/hierarchy
 	select the hierarchies to be imported with the postgreSQL copy comand, similar to:
		psql dedalo4_XXX -U YYY -p 5432 -h localhost -c "\copy matrix_hierarchy(section_id, section_tipo, datos) from es1.copy "

		XXX: the name of your installation
		YYY: the name of your user
	You can list all exported tables and change the "es1.copy" to the hierarchies that you want import
	When you are import the toponymy data, you will need change the counters of the tables that you were imported.
	login to Dédalo with developer user
	go to the administation tool and see the:
		DEDALO COUNTERS STATE
	you will see the diferences and Dédalo show the SQL command to apply into the postgreSQL, similar to this:
		UPDATE "matrix_counter" SET dato = 75845 WHERE tipo = 'es1'; 
	This command will change the conunters to the new imported values in SQL
	Change the profiles to acces users to the new hierarchy.

	Done! you new hierarchy was imported and ready to use.

NEWS AND CHNAGES:
This version change the comunicacion form javascript to php of all triggers, now the comunication is make in JSON native format in both directions. All information storre and change in the components is transfered in JSON. All  JQuery versions of the AJAX are remove and the calls now are made with the native XMLHttpRequest. In the PHP side the POST variables are removed.

New lang tools for the components, and new langs options for the transciptions, indexations, chapters, etc. 

New tool_lang_multiple used in the multiple modes, that access the langs versions of the component. Now is possible work with all langs versions of the information at same time.

New tools in the struct, this version add the options for sustain the correlation between translations of the "structurations", now is posible re-asig the original structurations from the original lang to the target lang.

New encriptation of the 256bits for the passwords based in OpenSSL implemantation.

Update the component_autocomplete for support the deep search in multiples sections. Now is possible search inside the 2, 3, 4, etc levels of the deep informations in sections linked by locators. 
Object -> portal -> mint -> group
PCI -> Interview -> Informant -> Profesion -> Place -> actual situation
this searches are created with subquery in the JSON information. (important: for now the subquery is not possible index it)

Updated the component_text_area for support the geolocation marks directly in edit mode. The component now has two editors for support the structuration tools, this situation is temporal, in near future the component will has only one editor for all, indexation, structuration.

Updated the search and replace tool for do multiples changes without reset the agrupation search in every change.

Update for all tools of OH, now the tools shown the same information in the header, now is possible change the lang in all tools.

New sync between tools in the client side. Now if one tool change the information all open windows with other tools are updated and sync with the change made.

New render engine for the image tags in the client side. Now the TC marks are rendered with javascript. In this first version only work with the TC marks but in the near future all marks will be rendered by the new engine.

Updated the new structuration tool with possibility to add and remove annotations and links to thesaurus.

New developer user that have access to the dev tools, now the root user is not necessary for do administration tasks. Please use the new dev user to access to the tools and debugger.

New concept "dataframe"
This newer version has a new dataframe into the JSON matrix, dataframe is a data companion of the dato. Dataframe in this first version store the uncertainity of the dato, if the dato is not certain, it will be store and procesed by dataframe. In the near future will be incorporate the time and space information of the dato. Ex: one mint can change own name (dato) in the time (dataframe) and space (dataframe) and we can't be sure that the name in one time can be certain (dataframe)

Componets that are afected:
- component_date is update to suport multiple values of the dato. Now is a raid. Is necessary update the dato in the matrix tablet. Date is the first component that suppor "dataframe" and can manage it.


New components
- component_calculation, this new component can do calculations with formulas that can be configurables inside properties of the structure. The values for do calculations are get from other components, the get_dato is procesed in php and the formula is calculted in javascript.

- New SQL matrix 
- matrix_dataframe: will store the dataframe information that will be referenced by locators inside the components.




*Ver 4.5.1 - 05-03-2017
Today we introduce the update of the V4 to 4.5.1

This update fixed some issues and bugs for the V4.5.0

New matrix_indexation, for implement labels, comments and anotations to the indexations.


*Ver 4.5.0 - 27-02-2017
Today we introduce the update of the V4 to 4.5.0

This update fixed some issues and bugs for the V4.0.23

Major update of Dédalo!

This update is the first major revision of Dédalo from v4. This update change the hierarchy and thesaurus format to new matrix format stored in JSON. This version is integrate data format stored in JSON. 
The next version will remove all "jer" tables into the postgreSQL:

Tables deprecated and will be removed in the next update version:

- jer_ad
- jer_cu
- jer_dd
- jer_ds
- jer_dz
- jer_es
- jer_fr
- jer_lg
- jer_ma
- jer_on
- jer_pt
- jer_ts
- jer_us
- jerarquia
- jerarquia_tipos
- matrix_descriptors

Componets that are afected:

- All "component_autocomplete_ts" are deprecated and removed from the structure. The new component_autocomplete_hi change all formats to the new hierarchy format. The data format is compatible form autocomplet_ts to auocomple_hi and no is necesary change the json.

- All thesaurus need to be convert to the new JSON format of matrix. You can do the tranformation in some ways.

Way 1.- This way is faster but require some manual changes into the Dédalo, if you don't have a lot experience use the way 2 (slow but more easy). If you don't use the toponomy thesaurus (like "España", "Cuba", "France", etc) in the indexation you can import all toponomy from:

	/dedalo/install/import/hierarchy

All hierarchies can be imported with the postgreSQL copy comand, similar to:

	psql dedalo4_XXX -U YYY -p 5432 -h localhost -c "\copy matrix_hierarchy(section_id, section_tipo, datos) from es1.copy "

XXX: the name of your installation
YYY: the name of your user
You can list all exported tables and change the "es1.copy" to the hierarchies that you want

This acction is very fast but you will need change the counters of the tables you can use the:
- DEDALO COUNTERS STATE
section in the administration tool, you will see the diference and Dédalo show the SQL command to apply into the postgreSQL, similar to this:

- UPDATE "matrix_counter" SET dato = 75845 WHERE tipo = 'es1'; 

 This command put the conunters to the new imported values.


Way 2.- Slow way, but the script do all hard work for transform the hierarchies. (You will need a lot of time and resources for PHP like RAM and SWAP space in HD, we recomended that you up the php memory for scripts to 4GB o more)

If you hierarchy is used in indexation, for example "ts1" (typical thematic hierarchy), you need transform the hierachy from the version V3 to the V4.

In the administration tool you have a script named "update_jer_from_V3_to_4_5" that do all proceses for change the hierarchies.

Put the tld of the original V3 hierarchy like "es" or "ts" and press the "Update" button.

if the hierarchy have a model asociated, check the "modelo" check_box for do this task with the "modelo" data (this porcess is independent of the terms hierarchy).

New button of generate hierarchies:

And finally, if you need open new the hierarchy in the thesaurus section

Thesaurus->Hierarchy

select the hierarchy that you want open in the list, "es1" for example, edit and press the "Generate" button. This action create all new structure for the new hierachy and link the hierachy to new thesaurus terms.



*Ver 4.0.23 - 28-01-2017
PREVIOUS TO V4.5
Today we introduce the update of the V4 to 4.0.23

This update fixed some issues and bugs for the V4.0.22

Changes: this update change the trigram method for acces to terms in matrix_hierarchy. Dédalo use the "ILIKE" operator for search the terms into the hirearchies with the "%term" into json. This update add new trigram method for postgreSQL that do possible index the term of thesaurus. This feature is used in "componet_autocomplete_hi" with auto-search field (toponomy)

*Ver 4.0.22 - 12-01-2017
PREVIOUS TO V4.5
Today we introduce the update of the V4 to 4.0.22

This update fixed some issues and bugs for the V4.0.21

ATENTION: This update is a security update, and you can't run it twice!, the update change all passwords on your installation to the OpenSSL format from the original and deprecated mycrpt lib, if you run this update twice you will lose the encription, because the update re-encript the passwords twice and you can't decript it.

Changes:
- Dédalo change all passwords to new OpenSSL format, the version 4.5 will not use mycript, that will be removed in the final 4.5 version.


*Ver 4.0.21 - 28-12-2016
PREVIOUS TO V4.5
Today we introduce the update of the V4 to 4.0.21

This update fixed some issues and bugs for the V4.0.20

ATENTION: this update change the user field (component_input_text) to array format, but the root user will be change only in postgreSQL 9.5+, because the PostgreSQL 9.4 can't update one jsonb part, of the specific component. This update is only full compatible with the PostegreSQL 9.5+.

If you see this alert in the login page:
	Error: User root not exists !

you need change the dato into the user fiel directly in the postgreSQL, the update used to make the change (in the 9.5+) is:			UPDATE "matrix_users" SET
	"datos" = jsonb_set (datos, '{components,dd132,dato,lg-nolan}', jsonb '["root"]')
	WHERE "id" = '-1';

for 9.4 installations you need go to the matrix_users->datos_>components->dd132->lg-nolan and you will see the original input_text string format:
	"root"
you need change it to array format:
	["root"]

Changes:
- component_imput_text: the component dato change to array, this update change all component_input_text in your installation and can be very longer in the large installations. Be patient.


*Ver 4.0.20 - 21-12-2016
PREVIOUS TO V4.5
Today we introduce the update of the V4 to 4.0.20

This update fixed some issues and bugs for the V4.0.19

Changes:
- Change into the relation tables in matrix: add index and remove some transition to thesaurusV4 data into the matrix.
- add the table: matrix_notes, used from the text area tags.
- add the new "person" tag to component_text_area
- add the new "notes" tag to component_text_area
- Change into the "time_code" tag for using miliseconds into the time_code tags. the format will be: [TC_00:00:00.000_TC]
- Change all tags format to new compatible "retina" displays.


*Ver 4.0.19 - 23-11-2016
PREVIOUS TO V4.5
Today we introduce the update of the V4 to 4.0.19

This update fixed some issues and bugs for the V4.0.18

Changes:
- component_relation_parent : New component and model. the parent in the new thesarurus
- component_relation_children : New component and model. "CH" in the new thesarurus
- component_relation_related : New component and model. "TR" in the new thesarurus
- tool_time_machine  : Added lang selector to switch historic lang source in tool window

*Ver 4.0.18 - 23-10-2016
PREVIOUS TO V4.5
Today we introduce the update of the V4 to 4.0.18

This update fixed some issues and bugs for the V4.0.17

Update the jerarquiaV3 to hierarchyV4, the jerarquia is deprecated and will be eliminated in the final V4.5 in the database. This update create all virtual sections with all hierarchies that are "active" in the V3.

Changes:
- hierarchy : add support for resolve langs when import previous version of Dédalo data (<4.5)
- menu : added thesaurus v4 menu links (reads from structure)


*Ver 4.0.17 - 23-10-2016
PREVIOUS TO V4.5
Today we introduce the update of the V4 to 4.0.17

This update fixed some issues and bugs for the V4.0.16

ATENTION: the update will need the new default tipos in the config.php of the you installation (the update can't change it because is owner property):

Before run the update you need change the config.php file of your instalation:

add to the "DEDALO_PREFIX_TIPOS" : 	"hierarchy"
									"lang"

and the define line need to be at least (you can have more tipos in this line, and you need respect it):

	define('DEDALO_PREFIX_TIPOS', serialize( array('dd','rsc','test','hierarchy','lg','ich');

Changes:
- hierarchy : added matrix table 'matrix_langs' and imported all thesarus v3 langs data.
- component_select_lang : now resolve with new lang data v4
- section : created new structure section element named 'section_map' to maping section components to different uses
				  for example: define what component is used as 'term' by thesaurus and hierarchies


*Ver 4.0.16 - 19-10-2016
PREVIOUS TO V4.5
Today we introduce the update of the V4 to 4.0.16

This update fixed some issues and bugs for the V4.0.15

The update change the matrix_time_machine table, the update add some index to the table for fast recovery

Changes:
- component_autocomplete_hi : created new component with our model for use with new dedalo thesaurus v4


*Ver 4.0.15 - 30-09-2016

Today we introduce the update of the V4 to 4.0.15

This update fixed some issues and bugs for the V4.0.14

ATENTION: 4.0.15 is the last public version prior the transition to the V4.5, the next updates will be internal updates for needs to change the specific data and imports from thesaurusV3 to the thesaurusV4. the version 4.5 will need all updates befrore it can run,  the transition is hard and need go step by step. Please read the especific update step by step, because the change required some important changes in the config files.

The update change the matrix_time_machine table, the update add some index to the table for fast recovery

Changes:
- component_portal: new views of the portal
-locator: add 'from_component_tipo' property, this property say "what component is calling" or "what component make the call to the locator", diferent text_areas can call to same section_tipo, section_id, tag_id, and is necesary "know" what text area do the call. This property is the first change for the new model for "inverse_locators" of the portals, this change will be when the V3 of the theraurus will remove.
- component_date: add time property, the final formal for the numeric date is:
	{
		"year": 0000
		"month": 00
		"day": 00
		"hour": 00
		"minute":00
		"second":00
	}
	and the dato in the component is : dd-mm-yyyy hh:mm:ss
	The year is not close to 4 digits, it can be from -15000000000 to 15000000000 and the 0 year is contemplate.
- component_autocomplete_ts: add property for resolve the parents or not. "value_with_parents": false
- tool_import_dedalo_csv : the first version of the import the Dédalo format in csv files:
			- section_tipo is file base name like dd21 on file dd21.csv
			- first line columns are components_tipo to import
			- column section_id is optional (if exists, force to use defined values)
			- portals and other reference type dato components value are always as array of locators like [{"section_tipo":"dd21","section_id":"1",etc..}]
			- is necesary update the first the portals and autocompletes sections before import the main section:
				- first import the "list of values"
				- second import the "resources"
				- and the last import need to be the main "inventary" section
-component_common : added method to control order_by param in search orders

Add propoerties to config:
config : DEDALO_AR_EXCLUDE_COMPONENTS

*Ver 4.0.14 - 12-09-2016

Today we introduce the update of the V4 to 4.0.14

This update fixed some issues and bugs for the V4.0.12

Changes:
- component_date : change in the format, now the component have three data types: date, range and period, and now the component will do the calculation of all dates to seconds. The full resolution of the date (with year, month,day,hour, minutes and seconds) now begin at : 01/01/-150000, dates before this date will be only year resolution (month, day , hour, minutes,... are not calculated).
- component_autocomplete_ts : new tree format to access to the thesaurus. Now the autiocomplete_ts can acces to all thesaurus tree for select the descriptor term.
- New edit into the portal row : now some components can it change the "modo" into the portal row for edit your dato.
- New SVG icons : we are change all icons to vectorial format
- New porta_list views: now is possible change the portal list to diferent edit views: normal, view_single_line, view_mosaic. TO DO: Is necesary the code for change the view for the users. 
- Tool_difussion : add window scrool top on publish record
- Tool_image_versions : fixed loosed section_tipo var on trigger when rotate image
- Tool_export : fixed output inconsistences on export component_filter and component_filter_master
- Tool_time_machine : changed behaviour when empty data is saved. Now blank data is saved to time machine record too.

Transition to the thesaurus v4: This version have the first steps to the transition from de v3 thesaurus model to v4 matrix model. This is the last change of the old technologies of the v3. The transition will be large, because the thesaurus is a very complex and very large and fundamental Dédalo part. Now we only put the basis of the future functionalities.

- New table Hierarchy : the new table is the first step to transformation the Thesaurus from the v3 model to v4.
- locator : Add property 'type' to object locator
- New base_prefix_tipo: hierarchy, this tipo will be used for make the hierarchy section. Please add the 'hierarchy' tipo to the base install of Dédalo at the config file 'define('DEDALO_PREFIX_TIPOS', serialize( array('dd','hierarchy','rsc','oh','ich') ));''
- New component_relation_parent : the component will be the actual "parent" column in the jer_xx tables and the control of the relationship with the parent descriptor of the thesaurus.
- New component_relation_children : the actual thesaurus (v3) only have the parent relation between the descriptors terms, in the new version the descriptors terms will be "bi-directional" relation, with childrens. The component will be the control of the relationship with the childrens of the descriptors terms of the thesaurus.
- New component_relation_index : the component will be the actual "index" row into the descriptors table and the control of the relationship of the descriptors terms with the indexations at the component_text_area index tag.
- New component_relation_model : the component will be the actual "modelo" column in the jer_xx tables and define the model of the descriptor term.
- New component_relation_related : the component will be the actual "relaciones" column in the jer_xx tables and define the synonyms of the term or other relations of equity.


*Ver 4.0.12 - 20-06-2016

Today we introduce the update of the V4 to 4.0.12
This update fixed some issues and bugs for the V4.0.11

Changes:

- In Oral History the component: rsc67 change the pointer to the "Entity section" of resources, the list of values "entity" now is deprecated and will be deleted. the TR of rsc67 change from: dd996 to: rsc106 , now, the entity has a structure and connection to the persons. (Entity = group of persons), you need change the data of this field.

*Ver 4.0.11 - 02-06-2016*

Today we introduce the update of the V4 to 4.0.11

This update fixed some issues and bugs for the V4.0.10

Changes:
- security_areas : changed format from array to object (see updates file in tool_administration) and removed '-admin' elements. Now areas have 3 permissions value: 0,2,3 (no access, access, admin)
- security_access : changed format from array to object (see updates too)
- security : solved issue when non global admin enter to users section list don't show available user records
- lock_elements : added icon 'lock' on locked coponents 
- tool_administrator : new option 'Remove av temporals' to delete ffmpeg temporal files in av/tmp folder
- tool_administrator : new option 'Ignore temporarily the publication status when publishing' to passthru component_publication value in some necessary cases
- tool_administrator : multiple sql querys are supporded now on dedalo data updates
- component_filter : fixed bug when in global admin, projects are showed by id_matrix instead section_id
- lock_components : fixed bug when force_unlock_all_components unset all DB locked elements, instead current user only components
- search : fixed bug in order by json fields when change from list to edit view
- tool_indexation : fixed bug when not is triggered autosave text on change tag tipo
- install : solved some inconsistences when update from install version db
- component_portal : fixed undesired behaviour when portal contains component_publications is selected
- tool_import_files : fixed issue when components are selected and inspector is not available
- component_pdf : add thumb for pdf files
				  fixed correct output to tool_export
- component_select : fixed correct output to tool_export
- component_text_area : solved issue when button is not showed for link tag content from tool_portal
- tool_upload : added default postprocessing create transcription when upload pdf media
- tool_portal : added edit already existing portal links to enable, for example select a fragment when link is created in one user action (bibliography, etc..)
- component_portal : fixed various issues related with refresh component in some context. Now centralized html_page page_globals engine is dedicated to manage components refresh
- html_page : added zentralized control / management of page components to refresh when new windows are open by tools etc 
- search : optimized 'current_edit' search . Removed count
		   added always order by section_id clause to maintain pagination consistence over list and edit modes
- tool_comom : adecuated to use html_page refresh components
- config : add constant 'DEDALO_PDF_THUMB_DEFAULT' default value 'thumb' to store rendered pdf preview thumbs 


*Ver 4.0.10 Final - 06-05-2016*

Today we introduce the update of the V4 to 4.0.10

This update fixed some issues and bugs for the V4.0.9

Changes:
- New 'sample_config4_db.php' that include the standar connection of MySQL for publication.
- New 'sample_config4.php' that include the default difusion_domain for MySQL publication with OH.
- New update paradigm, with new version of the components.
- New file «update.php» in "lib/dedalo/tools/tool_administration/updates/update.php" that have the controls and procedures for update versions.
- New css options and changes, for include 'Less css' into de development.
- New menu!
- New state_of_component that can put the field in "active", "deprecated", "delete"
- Changes in the administration_tool.
- Changes into the component_geolocation.

For update from v4.0.9 you need to do the 3 update procedures; Change the files (php, js,..), update the ontology and update the data.

*Ver 4.0.9 Final - 21-04-2016*

Today we introduce the update of the V4 to 4.0.9

This update fixed some issues and bugs for the V4.0.7.

New sync components for edition, pre-relase of V 4.1:

You need update de Postgres Database with the new table "matrix_notifications", you can use this SQL:

	CREATE TABLE "matrix_notifications" ( );
	
	ALTER TABLE "matrix_notifications"
	ADD "id" serial NOT NULL,
	ADD "datos" jsonb NULL;
	ALTER TABLE matrix_notifications
	ADD CONSTRAINT matrix_notifications_id PRIMARY KEY(id);

	ALTER TABLE "matrix_notifications" OWNER TO xx;

		xx = User of your database.

This table will be used in future version 4.1 for sync components used by users in realtime (with server side events «SSE» and NODE), this version have the funcionality but is disable by default. We recomend that you install NODE in you server and do tests of the funcionality in a test or development server NO in a production system. Please tell us your experience with the new funcionality.

For use the sync funcionality you need change in the lib/dedalo/config4.php this lines to "true":

	define('DEDALO_LOCK_COMPONENTS' 	, true);
	define('DEDALO_NOTIFICATIONS'		, true);

Use: The new funcionality lock the components for multiple simultaneus editions. When one user "focus" one field Dédalo will lock the edition for all other users, when the user go out of the field "onblur", the component will unlocked the edition for all users.

*Ver 4.0.7 Final - 21-03-2016*

Today we introduce the update of the V4 to 4.0.7

Important: This update change the "language" of the user component: "dd452" - Full name. Now the component will change the behavior to NO TRANSLATE, and is necessary change the language into the postgreSQL component.

for ex with this SQL:

	SELECT  datos #> '{components,dd452,dato}' AS dato,
	datos #> '{components,dd452,valor}' AS valor,
	datos #> '{components,dd452,valor_list}' AS valor_list
	FROM "matrix_users"
	WHERE datos #> '{components,dd452,dato}' ? 'lg-spa'

you can see all values in Spanish (lg-spa) that you need change to «lg-nolan».

	lg-spa => lg-nolan
	lg-eng => lg-nolan
	etc

This update fixed some issues and bugs for the V4.0.3.

*Ver 4.0.3 Final - 11-02-2016*

Today we introduce the update of the V4 to 4.0.3

Important: This update change the "profiles" and user behavior. 

1. Download and Update all files of Dédalo
2. Create the profiles 
3. Assign users (users can not be without profile)

The componet_security_areas, componet_security_acces and componet_security_tools ONLY work for the profiles and are deprecated for Users.
The root user (dev-user) can see this componets for some time in the Users records.

This update fixed some issues and bugs for the V4.

New user inteface.

*Ver 4.0 Final - 05-11-2015*

We are very pleased to introduce the final of the version 4 of Dédalo.

VERY IMPORTANT:
- The final version is the first oficial version of Dédalo with Postgres.

- The new version will run in PostgreSQL 9.4+ ONLY.

- Support for MySQL is fully removed for the investigation system.

- But you can use MySQL with the publication part (only with the publication).


** MySQL and the future of Dédalo **

*NOTE: Run the Beta 1 if you want to run with MySQL, but think that the development of Dédalo will not come back to MySQL.*

Finally Postgres comunity has made a impresionant job with the JSONB.
We have some versions of Dédalo with the new schema of "Matrix" (id, parent, dato, tipo, lang) in MySQL, that run very very slowly. We are working in the new format the last 4 years and the Beta 1 of Dédalo can run acceptably well. Dédalo does some caches for run the searchers but this version don't work "fine" with a large amount of data >100.000 rows (>100.000 interviews, or >100.000 heritage goods...).

But

Postgres with JSONB run ~1000 times faster!!!! and the GIN index have very good optimization for the new schema model of Dédalo.

We think that the new model is a future for Dédalo, and with PostgreSQL 9.4+ is possible!!!!

We are very exited with the new JSONB and are expectant and waiting VODKA!

Very, very thanks for the excelent work of Oleg Bartunov, Teodor Sigaev and Alexander Korotkov.

*For install with PostgreSQL:*

The schema of "matrix" into the database has significant changes:
  - The fields: 
  	parent, dato, tipo, lang
    are removed, now the schema only have the field "data" in JSON format, with all previous data
    The final schema of matrix for version 4 is:

**TABLES FOR THE DATABASE**

- jer_xx (you can change the "xx" with the TLD of the country, for ex: «es» for Spain or «fr» for France, etc)
- jer_ts
- jerarquia
- jerarquia_tipos
- main_dd
- matrix
- matrix_activities
- matrix_activity
- matrix_counter
- matrix_counter_dd
- matrix_dd
- matrix_descriptors
- matrix_descriptors_dd
- matrix_layout
- matrix_layout_dd
- matrix_list
- matrix_profiles
- matrix_projects
- matrix_stat
- matrix_time_machine
- matrix_users

**Structures of the Tables**

*jer_xx:(you can change the "xx" with the TLD of the country, for ex: «es» for Spain or «fr» for France, etc. The structure is the same for all countries)*

Column  |  Type Comment
--------- | ---------
id  |  integer Auto Increment [nextval('jer_es_id_seq')]
terminoID  | character varying(8) NULL
parent  |  character varying(8)
modelo  |  character varying(8) NULL
esmodelo  |  sino NULL
esdescriptor  |  sino NULL
visible  | sino NULL
norden	|	numeric(4,0) NULL
usableIndex	|	sino NULL
traducible	|	sino NULL
relaciones	|	text NULL
propiedades	|	text NULL

*jerarquia:*

Column	|	Type Comment
--------- | ---------
id	|	integer Auto Increment [nextval('jerarquia_id_seq')]	 
alpha3	|	character varying(3) NULL	 
alpha2	|	character varying(2)	 
nombre	|	character varying(255)	 
tipo	|	numeric(8,0)	 
activa	|	sino [si]	 
mainLang|	character varying(8)

*jerarquia_tipos:*

Column	|	Type Comment
--------- | ---------
id	|	integer Auto Increment [nextval('jerarquia_tipos_id_seq')]	 
nombre	|	character varying(256)	 
orden	|	numeric(4,0)

*main_dd:*

Column	|	Type Comment
--------- | ---------
id	|	integer Auto Increment [nextval('main_dd_id_seq')]	 
tld	|	character varying(32) NULL	 
counter	|	integer NULL	 
name	|	character varying(255) NULL

*matrix:*

Column	|Type	Comment
--------- | ---------
id	|	integer Auto Increment [nextval('matrix_id_seq')]	 
section_id	|	integer NULL	 
section_tipo	|	character varying NULL	 
datos	|	jsonb NULL

*matrix_activities:*

Column	|Type	Comment
--------- | ---------
id	|	integer Auto Increment [nextval('matrix_activities_id_seq')]	 
section_id	|	integer NULL	 
section_tipo	|	character varying NULL	 
datos	|	jsonb NULL

*matrix_activity:*

Column	|	Type	Comment
--------- | ---------
id	|	integer Auto Increment [nextval('matrix_activity_id_seq')]	 
date	|	timestamp NULL [now()]	 
section_id	|	integer NULL Auto Increment [nextval('matrix_activity_section_id_seq')]	 
section_tipo	|	character varying [dd542]	 
datos	|	jsonb NULL

*matrix_counter:*

Column	|	Type	Comment
--------- | ---------
id	|	integer Auto Increment [nextval('matrix_counter_id_seq')]	 
parent	|	integer	 
dato	|	integer NULL	 
tipo	|	character varying(16)	 
lang	|	character varying(16)	 
ref	|	text NULL

*matrix_counter_dd:*

Column	|	Type	Comment
--------- | ---------
id	|	integer Auto Increment [nextval('matrix_counter_dd_id_seq')]	 
parent	|	integer	NULL 
dato	|	integer NULL	 
tipo	|	character varying(16) NULL	 
lang	|	character varying(16) NULL	 
ref	|	text NULL

*matrix_dd:*

Column	|	Type	Comment
--------- | ---------
id	|	integer Auto Increment [nextval('matrix_dd_id_seq')]	 
section_id	|	integer NULL	 
section_tipo	|	character varying NULL	 
datos	|	jsonb NULL

*matrix_descriptors:*

Column	|	Type	Comment
--------- | ---------
id	|	integer Auto Increment [nextval('matrix_descriptors_id_seq')]	 
parent	|	character varying(8)	 
dato	|	text NULL	 
tipo	|	character varying(16)	 
lang	|	character varying(8)

*matrix_descriptors_dd:*

Column	|	Type	Comment
--------- | ---------
id	|	integer Auto Increment [nextval('matrix_descriptors_dd_id_seq')]	 
parent	|	character varying(32)	 
dato	|	text NULL	 
tipo	|	character varying(8)	 
lang	|	character varying(8)

*matrix_layout:*

Column	|	Type	Comment
--------- | ---------
id	|	integer Auto Increment [nextval('matrix_layout_id_seq')]	 
section_id	|	integer NULL	 
section_tipo	|	character varying NULL	 
datos	|	jsonb NULL

*matrix_layout_dd:*

Column	|	Type	Comment
--------- | ---------
id	|	integer Auto Increment [nextval('matrix_layout_dd_id_seq')]	 
section_id	|	integer NULL	 
section_tipo	|	character varying NULL	 
datos	|	jsonb NULL

*matrix_list:*

Column	|	Type	Comment
--------- | ---------
id	|	integer Auto Increment [nextval('matrix_list_id_seq')]	 
section_id	|	integer NULL	 
section_tipo	|	character varying NULL	 
datos	|	jsonb NULL

*matrix_notifications:*

Column	|	Type	Comment
--------- | ---------
id	|	integer Auto Increment [nextval('matrix_notifications_id_seq')]	 
datos	|	jsonb NULL

*matrix_profiles:*

Column	|	Type	Comment
--------- | ---------
id	|	integer Auto Increment [nextval('matrix_profiles_id_seq')]	 
section_id	|	integer NULL	 
section_tipo	|	character varying NULL	 
datos	|	jsonb NULL

*matrix_projects:*

Column	|	Type	Comment
--------- | ---------
id	|	integer Auto Increment [nextval('matrix_projects_id_seq')]	 
section_id	|	integer NULL	 
section_tipo	|	character varying NULL	 
datos	|	jsonb NULL

*matrix_stat:*

Column	|	Type	Comment
--------- | ---------
id	|	integer Auto Increment [nextval('matrix_stat_id_seq')]	 
datos	|	jsonb NULL

*matrix_time_machine:*

Column	|	Type	Comment
--------- | ---------
id	|	integer Auto Increment [nextval('matrix_time_machine_id_seq')]	 
id_matrix	|	integer NULL	 
section_id	|	integer NULL	 
tipo	|	character varying NULL	 
lang	|	character varying NULL	 
timestamp	|	timestamp NULL	 
userID	|	integer NULL	 
state	|	character(32) NULL	 
dato	|	jsonb NULL

*matrix_updates:*

Column	|	Type	Comment
--------- | ---------
id	|	integer Auto Increment [nextval('matrix_updates_id_seq')]	 
datos	|	jsonb NULL

*matrix_users:*

Column	|	Type	Comment
--------- | ---------
id	|	integer Auto Increment [nextval('matrix_users_id_seq')]	 
section_id	|	integer NULL	 
section_tipo	|	character varying NULL	 
datos	|	jsonb NULL


*Notes of Beta 1 for MySQL:*

- If you need install the beta 1, we recomended MySQL 5.6 and PHP 5.6.

- For Intangible Heritage with the Render model (standar schema) for the IPCE you will need install Memcache or Redis.

- For the Oral History no is necessary Memcache or Redis.


