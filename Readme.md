**README**

*Ver 4 Release Candidate - 23-06-2015*

We are very pleased to introduce the Release candidate of the version 4 of Dédalo.

VERY IMPORTANT:
- The Release candidate is the first version of Dédalo with Postgres.

- The new version will run in PostgreSQL 9.4+ ONLY.

- The MySQL support is FULL removed for the investigation system.

- But you can use MySQL with the publication part (only with the publication).


*NOTE: Run the Beta 1 if you want to run with MySQL, but think that the development of Dédalo will not come back to MySQL.*

Finally Postgres comunity has made a impresionant job with the JSONB. We have some versions of Dédalo with the new schema of "Matrix" (id, parent, dato, tipo, lang) in MySQL than run very very slowly. We are working in the new format the last 4 years and the Beta 1 of Dédalo can run acceptably well. Dédalo have some caches for run the searchers but this version don't work "fine" with a large amount of data >100.000 rows (>100.000 interviews, or >100.000 heritage goods...).

But

Postgres with JSONB run ~1000 times faster!!!! and the GIN index have very good optimization for the new schema model of Dédalo.

We think that the new model is a future for Dédalo, and with PostgreSQL 9.4+ is possible!!!!

We are very exited with the new JSONB and are expectant and waiting VODKA!

*For install with postges:*

The schema of "matrix" into the database has significant changes:
  - The fields: parent, dato, tipo, lang
    Are changed and removed, now the schema only have the field "data" in JSON format, with all previous data
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


*Notes of Beta 1 for MySQL:*
- If you need install the beta 1, we recomended MySQL 5.6 and PHP 5.6.

- For Intangible Heritage with the Render model (standar schema) for the IPCE you will need install Memcache or Redis.

- For the Oral History no is necessary Memcache or Redis.


**DEPENDENCES**

*Required for the OS*

- PHP 5.6+
- Apache 2.2.3+
- Postgres 9.4+
- MySQL 5.6+ (NOT REQUIRED, only if you want use it for publication)

*libs required for the Dédalo*

- Jquery 2.1.4
- bootstrap 3.1.1
- calendar 1.25
- Captionator 0.5.1
- ffmpeg 2.6.1
- qtfaststart 1.0
- ImageMagick 6.9+
- FullCalendar v2.3.1
- geoip
- gruntfile
- jshash md5 v2.2
- SWFObject v1.5
- jwplayer 5.9.2118
- leaflet 0.8
- lessphp v0.4.0
- MediaElement 2.14.2
- nvd3 1.7.1
- paper 0.9.20
- pdfjs 1.1.1
- pdfkit
- predis 0.8.5
- PdfParser (2014)
- tcpdf 6.2.5
- tinymce 4.1.10
- wexflow 1.2
- videojs 3.0r2
- wkhtmltopdf 0.12.1-08b0817
- Zend: Bit
-       Exception
-       Io
-       Media
-       Mime

**INSTALLATION**

1.- Download Dédalo and copy to the root web server
2.- Create a DB in PostgreSQL and name it to: dedalo_xx (you can change the xx with own name).
3.- Restore the file /install/db/dedalo4_install.backup to the postgres created DB. 
		pg_restore /install/db/dedalo4_install.backup dedalo_xx
4.- Download the dependences and libs for Dédalo and install it into the /lib/ folder. In some cases you need see the /lib/dedalo/config/sample.config4.php file in order to change or customize the installation.
5.- Rename the /lib/dedalo/config/sample.config4.php to /lib/dedalo/config/config4.php.
6.- Change the file /lib/dedalo/config/sample.config4_db.php with your DB configuration.
7.- Rename the /lib/dedalo/config/sample.config4_db.php to /lib/dedalo/config/config4_db.php.
8.- Run Dédalo into the browser. 
9.- Fix your admin password (you can change only once), the default account is: admin (this user is a root and only for development or debuger the application).
10.- Create one Administrator user account with all access to the system.(this user will be the administrator of the system)
11.- Logout and login with the Administrator acount.
12.- Create Users and Projects as you need.


**USE**

Dédalo version 4, is only certificated and proved into the webkit browsers (Chrome, Safari,...). Is possible use Firefox but no is tested and maybe Dédalo can't run fine.

