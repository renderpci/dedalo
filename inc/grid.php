<?php
require_once( dirname(dirname(__FILE__)).'/lib/dedalo/config/config4.php');

die("GRID STOP . IN PROCESS ");

/**
* LOGIN
*/
$is_logged	= login::is_logged();
	
if($is_logged!==true) {
	$url =  DEDALO_ROOT_WEB ."/main/";
	header("Location: $url");
	exit();
}

require_once(DEDALO_ROOT . '/Connections/config.php');
require_once(DEDALO_ROOT . '/inc/funciones.php');

$t 			= false ;	if(isset($_REQUEST['t']))			$t 			= $_REQUEST['t']; 		if(!$t) exit("Tabla $no_definido_title ");
$accion 	= false ; 	if(isset($_REQUEST['accion'])) 		$accion 	= $_REQUEST['accion'];	if(!$accion) exit("accion $no_definido_title !");

$accionForm = false ; 	if(isset($_REQUEST['accionForm'])) 	$accionForm = $_REQUEST['accionForm']; 
$id_get 	= false ; 	if(isset($_REQUEST['id'])) 			$id_get 	= $_REQUEST['id'];


/*********************************************************
 * DELETE 
*********************************************************/
if( $accion=="delete" )
{
	
	if($t=='jerarquia_tipos') {
		$id = $_POST['id']; if(!$id) die("Error deleting tipo !");
		
		if($id<3) die( $codHeader . " Unauthorized action ! ( Delete typologies reserved id: 1 or 2 ) ");
		
		#verificamos que NO se usa
		$query_RS 		= "SELECT nombre FROM jerarquia WHERE tipo = '$id'  " ;
		$RS 			= mysql_query($query_RS, DB::_getConnection()) or die("delete:  $query_RS ".mysql_error());
		$row_RS 		= mysql_fetch_assoc($RS);
		$totalRows_RS 	= mysql_num_rows($RS);

		$sql 		= $query_RS;
		$result 	= DBi::_getConnection()->query($sql);
			#dump($result,'$result');
		$totalRows_RS 	= $result->num_rows;
		
		if($totalRows_RS>0) 
		{
			do{
				$jerarquiaActual = $row_RS['nombre'];
				$html .= " <ul> $jerarquiaActual </ul>";				
				
			#}while ($row_RS = mysql_fetch_assoc($RS)); mysql_free_result($RS);
			}while ($row_RS = $result->fetch_array(MYSQLI_ASSOC) ); $result->close();
			
			die("$codHeader <div class=\"errorMsg\">". ucfirst($no_se_puede_borrar_title)." $tipo_title $id $porque_se_usa_en_title $jerarquia_title <hr>" .
				 ucfirst($usados_title).":
				 $html 			 
				 <br>
				 <a href=\"javascript:listJerTipo()\"> $volver_title </a> </div>
				 " ) ;
		}		
		
		#die("STOP");
		
		# borrar
		$updateSQL = " DELETE FROM $t WHERE id = '$id' " ;
		#$Result1 = mysql_query($updateSQL, DB::_getConnection()) or die(mysql_error());
		$sql 		= $updateSQL;
		$result 	= DBi::_getConnection()->query($sql);		
		

	}//if($t=='jerarquia_tipos')
		 
		 
	# visualizamos el listado
	$accion = 'list';
  
};// if delete




/*********************************************************
 * INSERT  
*********************************************************/
if( $accion == "insertSubmit" )
{		
	if($t == 'jerarquia_tipos') {	
		#print_r($_POST); die();
		$nombrePost = $_POST['nombre'];
		$ordenPost 	= $_POST['orden'];
		
		$insertSQL = " INSERT INTO $t (nombre,orden) VALUES ('$nombrePost','$ordenPost')  "; #die("$insertSQL");
		#$Result1 = mysql_query($insertSQL, DB::_getConnection()) or die(mysql_error());
		$sql 		= $insertSQL;
		$result 	= DBi::_getConnection()->query($sql);
				
		$accion = 'list';
			
	};//fin if($t == 'informants_rel' && $accion == "new")
	   

	# visualizamos el listado	
	
};


/*********************************************************
 * EDIT  
*********************************************************/
if( $accion == 'edit' )
{

	if($t=='jerarquia_tipos') {		
		$query_Recordset1 = "
		SELECT id, nombre, orden FROM 
		$t 
		WHERE id = $id_get  
		";		
		#$Recordset1 = mysql_query($query_Recordset1, DB::_getConnection()) or die(mysql_error());
		#$row_Recordset1 = mysql_fetch_assoc($Recordset1);
		#$totalRows_Recordset1 = mysql_num_rows($Recordset1); #print($query_Recordset1);		
		$sql 	= $query_Recordset1;
		$result = DBi::_getConnection()->query($sql);
			#dump($result,'$result');
		$row_Recordset1 		= $result->fetch_array(MYSQLI_ASSOC);
		$totalRows_Recordset1 	= $result->num_rows;
		
		$id 	= $row_Recordset1['id'];
		$nombre	= $row_Recordset1['nombre'];
		$orden	= $row_Recordset1['orden'];
	}//if($t=='jerarquia_tipos')

}
# edit submit
if( $accion == 'editSubmit' )
{		
	if($t=='jerarquia_tipos') {
		#print_r($_POST); die();
		$nombrePost = $_POST['nombre'];
		$ordenPost 	= $_POST['orden'];
		
		$query_Update = "
		UPDATE $t
		SET 
		nombre = '$nombrePost',
		orden  = '$ordenPost' 
		WHERE id = $id_get 
		LIMIT 1 
		";
		#$update = mysql_query($query_Update, DB::_getConnection()) or die("$query_Update <hr>".mysql_error());
		$sql 		= $query_Update;
		$result 	= DBi::_getConnection()->query($sql);
			#dump($result,'$result');		
	}//if($t=='jerarquia_tipos')
	
	
	$accion = 'list' ;
};



/*********************************************************
 * LIST  
*********************************************************/
if($accion == 'list' || $accion == 'select' || $accion == '')
{	  
	
	if($t=='jerarquia_tipos') {		
		$query_Recordset1 = "
		SELECT * FROM 
		$t 
		ORDER BY orden ASC, id ASC ";
		#$Recordset1 = mysql_query($query_Recordset1, DB::_getConnection()) or die(mysql_error());
		#$row_Recordset1 = mysql_fetch_assoc($Recordset1);
		#$totalRows_Recordset1 = mysql_num_rows($Recordset1);
		
		$sql 		= $query_Recordset1;
		$result 	= DBi::_getConnection()->query($sql);
			#dump($result,'$result');
		$row_Recordset1 		= $result->fetch_array(MYSQLI_ASSOC);
		$totalRows_Recordset1 	= $result->num_rows;
	}
	
};

?>




<!-- LIST -->
<?php if($accion == 'list') {?>

    <table width="100%" border="0" cellpadding="2" cellspacing="1" id="TablaRgrid3t">    

    <?php if ($t=='jerarquia_tipos'){ ?>
  		<tr bgcolor="#565656">
        	<td width="1%" align="center" nowrap class="td_header_grid" >ID</td>
            <td width="1%" align="center" nowrap class="td_header_grid" ><?php echo $orden_title ?></td>
            <td width="30%" align="left" class="td_header_grid" >            
            <?php echo $nombre_title ?> 
            <a href="javascript:insertJerTipo();" style="float:right;color:#CCC"> [+] </a>
            </td>
        </tr>
               
		<?php 
		if($totalRows_Recordset1<1) {

				echo "<tr><td colspan=\"5\" ><div style=\"padding:5px;padding-left:12px; font-size:11px\"> $no_hay_resultados_coincidentes_title </div></tr>";
						
		}else{		
			
				do {	
			
				$id 	= $row_Recordset1['id'];
				$nombre = $row_Recordset1['nombre'];
				$orden 	= intval($row_Recordset1['orden']); 
				$bgc= '#CCCCCC'; 
				?>        
			<tr align="center"  bgcolor="<?php echo $bgc ?>" onMouseOver="bg(this,'#DDDDDD')" onMouseOut="bg(this,'')" >
	        
	          <td align="center"><?php echo $id ?></td>
	          <td align="center"><?php echo $orden ?></td>
	       	  <td align="left">
	          <img src="../images/iconos/button_drop.png" style="margin-top:0px; margin-right:2px; cursor:pointer" onclick="deleteJerTipo('<?php echo $id ?>')" />
	          <img src="../images/iconos/edit_grey.png" width="15" height="15" style="vertical-align:bottom; cursor:pointer" onclick="editJerTipo('<?php echo $id ?>')" />          
			  <?php echo $nombre ?>
	          </td>
	        
			</tr>
	    	<?php } while ($row_Recordset1 = $result->fetch_array(MYSQLI_ASSOC) );?>
    	<?php } #end if($totalRows_Recordset1<1)?>
	<?php }#end if($t=='jerarquia_tipos') ?>    
    
    </table>
    
<?php }//if($accion=='list' )?>






<!-- INSERT -->
<?php if($accion=='new'){ ?>

	<form  id="formNew" name="formNew" method="post"  >  
    <table width="100%" border="0" cellpadding="4" cellspacing="0" bgcolor="#999999">

    
    <?php if ($t=='jerarquia_tipos'){ ?>
	<tr bgcolor="#4E7681">
        <td width="86%" align="left" class="td_header_grid"> <?php echo $nombre_title ?> <a href="javascript:listJerTipo();" style="float:right; color:#CCC"> [X] </a> </td>                   
	</tr>        
	<tr align="center"  bgcolor="#CCCCCC" >        
        <td align="center" nowrap >
            <input id="nombreTipo" name="nombreTipo" type="text" value="" style="width:85%">
            <input type="button" name="button" id="button" value=" OK "  onclick="javascript:insertSubmitJerTipo();" class="SubmitButon">
        </td>
	</tr>  
	<?php } //if ($t=='jerarquia_tipos')?>  
        
	 
	</table>
	</form>
  
<?php } //if($accion=='new'){ ?>





<!-- EDIT -->
<?php if($accion == 'edit'){?>

    <form  id="formEdit"  name="formEdit" method="post" >
    <table width="100%" border="0" cellpadding="4" cellspacing="0" bgcolor="#999999">
	
 
    <?php if ($t=='jerarquia_tipos'){ ?>
	<tr bgcolor="#E15A00" >
        <td width="10%" align="center" nowrap class="td_header_grid" >ID</td>
        <td width="10%" align="center" nowrap class="td_header_grid" ><?php echo $orden_title ?></td>
        <td width="86%" align="left" class="td_header_grid" style="padding-left:10px;"><?php echo $nombre_title ?> <a href="javascript:listJerTipo();" style="float:right; color:#CCC"> [X] </a></td>
	</tr>
	<tr align="center"  bgcolor="#CCCCCC" >     
		<td align="center" style="padding-left:10px"><input  id="id" name="id" type="text" style="width:100%" value="<?php echo $id ?>" readonly="readonly"></td>
        <td align="center" style="padding-left:10px"><input  id="orden" name="orden" type="text" style="width:100%; text-align:center" value="<?php echo intval($orden) ?>" ></td>
        <td align="left" nowrap="nowrap">
        	<input  id="nombreTipo" name="nombreTipo" type="text" value="<?php echo $nombre ?>" style="width:85%; text-align:left" />                    	    
            <input  id="MM_accion" name="MM_accion" type="hidden" value="formEdit">
            <input type="button" name="button" id="button" value=" OK "  onclick="javascript:editSubmitJerTipo('<?php echo $id ?>');" class="SubmitButon" />
        </td>
	</tr>
	<?php }#if ($t=='reels')?>		
                     
	   
    </table>
    </form>
<?php }//if($accion=='edit' )?>






<?php
# Free result set
#$result->close();
?>