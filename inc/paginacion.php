<?php 
if($pag=='down')
{
	$estilo = 'pagContDivDown';
	
}else if($pag=='none'){
	
	$estilo = 'pagContDivNoRound';	
	
}else if($pag=='pagContDivNoMargen'){
	
	$estilo = 'pagContDivNoMargen';		
}else{
	
	$estilo = 'pagContDiv';
}
if(!isset($currentPage)) $currentPage = false ;
?>

<?php /* DESACTIVO <div class="zonaListTitle"><?php echo $localizacion ?></div> */ ?>

<div class="<?php echo $estilo ?>">
    <div class="pagElementDiv">
        <?php
        # Show if not first page  
        if ($pageNum_Recordset1 > 0) 
        { 
            $nombre = '<<';
            $enlace = sprintf("%s?pageNum_Recordset1=%d%s", $currentPage, 0, $queryString_Recordset1);      
            #crearBoton($nombre, $enlace, $estilo='botonTablaCentro2'); 
			echo "<img src=\"../images/iconos/barra_primero.png\" onclick=\"window.location='$enlace';\" />";   
        }else{
			echo "<img src=\"../images/iconos/barra_primero.png\" class=\"BtnDesactivo\" />";
		}
        ?>        
    </div>
    <div class="pagElementDiv">
    <?php
        # Show if not first page  
        if ($pageNum_Recordset1 > 0)
        { 
            $nombre = '<';
            $enlace = sprintf("%s?pageNum_Recordset1=%d%s", $currentPage, max(0, $pageNum_Recordset1 - 1), $queryString_Recordset1);     
            #crearBoton($nombre, $enlace, $estilo='botonTablaCentro2');
			echo "<img src=\"../images/iconos/barra_anterior.png\" onclick=\"window.location='$enlace';\" />";
        }else{
			echo "<img src=\"../images/iconos/barra_anterior.png\" class=\"BtnDesactivo\" />";
		}
        ?>
    </div>    
      
    <div class="pagElementDiv">
    <?php
        # Show if not last page  
        if ($pageNum_Recordset1 < $totalPages_Recordset1)
        { 
            $nombre = '>';
            $enlace = sprintf("%s?pageNum_Recordset1=%d%s", $currentPage, min($totalPages_Recordset1, $pageNum_Recordset1 + 1), $queryString_Recordset1);     
            #crearBoton($nombre, $enlace, $estilo='botonTablaCentro2'); 
			echo "<img src=\"../images/iconos/barra_siguiente.png\" onclick=\"window.location='$enlace';\" />";  
        }else{
			echo "<img src=\"../images/iconos/barra_siguiente.png\" class=\"BtnDesactivo\" />";
		}
        ?>
    </div>
    <div class="pagElementDiv">
    <?php
        # Show if not last page  
        if ($pageNum_Recordset1 < $totalPages_Recordset1)
        { 
            $nombre = '>>';
            $enlace = sprintf("%s?pageNum_Recordset1=%d%s", $currentPage, $totalPages_Recordset1, $queryString_Recordset1);    
            #crearBoton($nombre, $enlace, $estilo='botonTablaCentro2');   
			echo "<img src=\"../images/iconos/barra_ultimo.png\" onclick=\"window.location='$enlace';\" />";
        }else{
			echo "<img src=\"../images/iconos/barra_ultimo.png\" class=\"BtnDesactivo\" />";
		}
        ?>
    </div>
    
    <div class="pagElementDiv" style="width:auto;display:block; position:relative; float:left">
        <div id="pagElementDivText">
        <?php
        # info
        echo $mostradas_title .' '. ($startRow_Recordset1 + 1) .' '. $a_title .' '. min($startRow_Recordset1 + $maxRows_Recordset1, $totalRows_Recordset1) .' '. $de_title .' '. $totalRows_Recordset1 ;
        ?>
        </div>
    </div>  
    
</div>



