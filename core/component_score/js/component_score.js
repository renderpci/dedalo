//"use strict"
/**
* COMPONENT_SCORE CLASS
*
*
*/
var component_score = new function() {


	/**
	* init
	*/
	this.init = function(options) {

		if(page_globals.modo=='list') return false;

		const wrapper_id = options.id_wrapper

		$(function() {

			const wrapper 	= $('#'+wrapper_id);
			var canvas_id 	= $(wrapper).find('canvas').attr('id');
			var error_id 	= $(wrapper).find('DIV.div_error_score').attr('id');


			var	textarea_rel_tipo   = $(wrapper).data('textarea_rel_tipo');
			var	parent 				= $(wrapper).data('parent');
			var textarea_id 		= $("TEXTAREA[data-tipo='"+textarea_rel_tipo+"'][data-parent='"+parent+"']").attr('id');
				//console.log(error_id)

			if( $(wrapper).length !=1 ) return alert("wrapper not found") 
			if( $("TEXTAREA[data-tipo='"+textarea_rel_tipo+"'][data-parent='"+parent+"']").length !=1 ) return alert("component_text not found") 
			

			//$(wrapper).find('DIV.div_error_score').append(error_id)

		 // Vex.Flow.Artist.DEBUG = false;
		  //Vex.Flow.VexTab.DEBUG = false;

		 renderer = new Vex.Flow.Renderer($("#"+canvas_id)[0], Vex.Flow.Renderer.Backends.CANVAS);
		

		  artist 	= new Vex.Flow.Artist(10, 10, 600, {scale: 0.8});
		  vextab 	= new Vex.Flow.VexTab(artist);
		  vexplayer = new Vex.Flow.Player(artist,{
		  	'soundfont_url':DEDALO_ROOT_WEB+'/lib/vexflow/MIDI/soundfont/'
		  });

		  function render() {
			try {
			  vextab.reset();
			  artist.reset();
			  vextab.parse($("#"+textarea_id).val());
			  artist.render(renderer);
			  $("#"+error_id).text("");
			} catch (e) {
			  console.log(e);
			  $("#"+error_id).html(e.message.replace(/[\n]/g, '<br/>'));
			}
		  }

		  $("#"+textarea_id).keyup(_.throttle(render, 250));
		  render();
		 
		})//$(function() {
		//s};//end $(function() {

		return true
	}//end init

	


}; //end class