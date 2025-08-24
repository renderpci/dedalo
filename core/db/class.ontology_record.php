<?php declare(strict_types=1);
/**
* RECORDOBJ_TIME_MACHINE
* Handles matrix_time_machine table records
*/
class ontology_record extends RecordDataBoundObject {


	// Columns vars
	protected $tipo;
	protected $parent;
	protected $term;
	protected $model;
	protected $order_number;
	protected $relations;
	protected $tld;
	protected $properties;
	protected $model_tipo;
	protected $is_model;
	protected $is_translatable;
	protected $propiedades; // Deprecated used in v5 and v6

	// table
	protected static $table = 'dd_ontology';

	static $save_time_machine_version = true;

	public $use_cache = false; // overwrite default that is true (for structure only)
	public $use_cache_manager = false;



	public function __construct( ?string $id=null ) {
		parent::__construct($id);
	}

	# define current table (tr for this obj)
	protected function defineTableName() : string {

		// if in recovery mode, changes table name to dd_ontology_recovery
		$DEDALO_RECOVERY_MODE = $_ENV['DEDALO_RECOVERY_MODE'] ?? false;
		if ($DEDALO_RECOVERY_MODE===true) {
			self::$table = 'dd_ontology_recovery';
		}else{
			// restore table name
			self::$table = 'dd_ontology';
		}

		return self::$table;	}
	# define PrimaryKeyName (id)
	protected function definePrimaryKeyName() : string {
		return 'tipo';
	}
	# array of pairs db field name, obj property name like fieldName => propertyName
	protected function defineRelationMap() : array {
		return [
			# db field name		# property name
			'id'				=> 'id',
			'tipo'				=> 'tipo',
			'parent'			=> 'parent',
			'term'				=> 'term',
			'model'				=> 'model',
			'order_number'		=> 'order_number',
			'relations'			=> 'relations',
			'tld'				=> 'tld',
			'properties'		=> 'properties',
			'model_tipo'		=> 'model_tipo',
			'is_model'			=> 'is_model',
			'is_translatable'	=> 'is_translatable',
			'propiedades'		=> 'propiedades'
		];
	}//end defineRelationMap



}//end classRecordObj_time_machine
