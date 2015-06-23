**README**

*Ver 4 Release Candidate - 23-06-2015*

We are very pleased to introduce the Release candidate of the version 4 of Dédalo.

VERY IMPORTANT:
The Release candidate is the first version of Dédalo with Postgres.

The MySQL support is FULL removed.

The new version will run in PostgreSQL 9.4+ ONLY.

Run the Beta 1 if you want to run with MySQL, but think that the development of Dédalo will not come back to MySQL.

Finally Postgres comunity has made a impresionant job with the JSONB. We have some versions of Dédalo with the new schema of "Matrix" (id, parent, dato, tipo, lang) in MySQL than run very very slowly. We are working in the new format the last 4 years and the Beta 1 of Dédalo can run acceptably well. Dédalo have some caches for run the searchers but this version don't work "fine" with a large amount of data >100.000 rows (>100.000 interviews, or >100.000 heritage goods...).

But

Postgres with JSONB run ~1000 times faster!!!! and the GIN index have very good optimization for the new schema model of Dédalo.

We think that the new model is a future for Dédalo, and with PostgreSQL 9.4 is possible!!!!

We are very exited with the new JSONB and are expectant and waiting VODKA!

*For install with postges:*

The schema of "matrix" into the database has significant changes:
  - The fields: parent, dato, tipo, lang
    Are changed and removed, now the schema only have the field "data" in JSON format, with all previous data
    The final schema of matrix for version 4 is:

**TABLES**

jer_es

jer_ts

jerarquia

jerarquia_tipos

main_dd

matrix

matrix_activities

matrix_activity

matrix_counter

matrix_counter_dd

matrix_dd

matrix_descriptors

matrix_descriptors_dd

matrix_layout

matrix_layout_dd

matrix_list

matrix_profiles

matrix_projects

matrix_stat

matrix_time_machine

matrix_users

**Structures**

*jer_xx:*

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

*matrix_users:*

Column	|	Type	Comment
--------- | ---------
id	|	integer Auto Increment [nextval('matrix_users_id_seq')]	 
section_id	|	integer NULL	 
section_tipo	|	character varying NULL	 
datos	|	jsonb NULL


*Notes for Beta 1 for MySQL:*
- If you need install the beta 1, we recomended MySQL 5.6 and PHP 5.5.

- For Intangible Heritage with the Render model (standar schema) for the IPCE you will need install Memcache or Redis.

- For the Oral History no is necessary Memcache or Redis.


