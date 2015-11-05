// JavaScript Document

/**
 * Author: Rob Audenaerde
 */
function resetTableSizes (table, change, columnIndex)
{
	//calculate new width;
	var tableId = table.attr('id'); 
	var myWidth = $('#'+tableId+' TR TH').get(columnIndex).offsetWidth;
	var newWidth = (myWidth+change)+'px';

	$('#'+tableId+' TR').each(function() 
	{
		$(this).find('TD').eq(columnIndex).css('width',newWidth);
		$(this).find('TH').eq(columnIndex).css('width',newWidth);
	});
	resetSliderPositions(table);
};

function resetSliderPositions(table)
{
	var tableId = table.attr('id'); 
	//put all sliders on the correct position
	table.find(' TR:first TH').each(function(index)
	{ 
		var td = $(this);
		var newSliderPosition = td.offset().left+td.outerWidth() ;
		$("#"+tableId+"_id"+(index+1)).css({  left:   newSliderPosition , height: table.height() + 'px'}  );
	});
}

function makeResizable(table)
{		
	//get number of columns
	var numberOfColumns = table.find('TR:first TH').size();

	//id is needed to create id's for the draghandles
	var tableId = table.attr('id'); 
	
	for (var i=0; i<=numberOfColumns; i++)
	{
		//enjoy this nice chain :)
		$('<div class="draghandle" id="'+tableId+'_id'+i+'"></div>').insertBefore(table).data('tableid', tableId).data('myindex',i).draggable(
		{ axis: "x",
		  start: function () 
		  {
			var tableId = ($(this).data('tableid'));
			$(this).toggleClass( "dragged" );
			//set the height of the draghandle to the current height of the table, to get the vertical ruler
			$(this).css({ height: $('#'+tableId).height() + 'px'} );
		  },
		  stop: function (event, ui) 
		  {
			var tableId = ($(this).data('tableid'));
			$( this ).toggleClass( "dragged" ); 
			var oldPos  = ($( this ).data("draggable").originalPosition.left);
			var newPos = ui.position.left;
			var index =  $(this).data("myindex");
			resetTableSizes($('#'+tableId), newPos-oldPos, index-1);
		  }		  
		}
		);;
	};
	resetSliderPositions(table);

}