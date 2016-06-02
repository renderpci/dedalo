**UPDATES AND CHANGES**

*Ver 4.0.11 - 02-06-2016*

Today we introduce the update of the V4 to 4.0.11

This update fixed some issues and bugs for the V4.0.10

Changes comments are coming soon



*Ver 4.0.11 - 02-06-2016*

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


