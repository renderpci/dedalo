<?php
/************************************************************************
	
    Dédalo : Cultural Heritage & Oral History Management Platform
	
	Copyright (C) 1998 - 2014  Authors: Juan Francisco Onielfa, Alejandro Peña

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU Affero General Public License as
    published by the Free Software Foundation, either version 3 of the
    License, or (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public License
    along with this program.  If not, see <http://www.gnu.org/licenses/>.
	
	http://www.fmomo.org
	dedalo@fmomo.org
	
************************************************************************/

require_once(DEDALO_LIB_BASE_PATH . '/db/class.RecordDataBoundObject.php');
require_once(DEDALO_ROOT . '/jer/class.Jerarquia.php');


class RecordObj_jer_tipos extends RecordDataBoundObject {
	
	# FIELDS
	protected $nombre;
	protected $orden;
	
	
	function __construct($id=NULL) {		
		
		parent::__construct($id);
	}
	
	
	# define current table (tr for this obj)
	protected function defineTableName() {
		return ('jerarquia_tipos');
	}
	
	# define PrimaryKeyName (id)
	protected function definePrimaryKeyName() {
		return ('id');	
	}
	
	# array of pairs db field name, obj property name like fieldName => propertyName
	protected function defineRelationMap() {
		return (array(
			# db fieldn ame						# property name
			"id" 								=> "ID",
			"nombre"							=> "nombre",
			"orden" 							=> "orden",
			));
	}
	
	
	# nombre functions
	public function get_nombre() {
		$string = parent::get_nombre();
		if($string) stripslashes($string);
		return $string;	
	}
	public function set_nombre($string) {
		$string = stripslashes($string); 
		$string = addslashes($string);
		parent::set_nombre($string);
	}
	
	
	public static function order_by_tipo_sql_string() {
		
		$idString = NULL;		
		
		$arguments=array();
		$arguments['sql_code']		= 'id IS NOT NULL ORDER BY orden, nombre ASC';
		
		$RecordObj_jer_tipos		= new RecordObj_jer_tipos(NULL);		
		$ar_id						= $RecordObj_jer_tipos->search($arguments);
		
		foreach($ar_id as $id) {
			
			$idString 	.= "$id,";		
		}
		
		$idString = substr($idString,0,-1); 
		
		return $idString ;
	}	
	
	
}
?>