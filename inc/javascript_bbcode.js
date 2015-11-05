function bbcode(v)
 {
 if (document.selection) // für IE
   {
    var str = document.selection.createRange().text;
    document.forms['entryform'].elements['texto'].focus();
    var sel = document.selection.createRange();
    sel.text = "<" + v + ">" + str + "</" + v + ">";
    return;
   }
  else if ((typeof document.forms['entryform'].elements['texto'].selectionStart) != 'undefined') // für Mozilla
   {
    var txtarea = document.forms['entryform'].elements['texto'];
    var selLength = txtarea.textLength;
    var selStart = txtarea.selectionStart;
    var selEnd = txtarea.selectionEnd;
    //if (selEnd == 1 || selEnd == 2)
    //selEnd = selLength;
    var s1 = (txtarea.value).substring(0,selStart);
    var s2 = (txtarea.value).substring(selStart, selEnd)
    var s3 = (txtarea.value).substring(selEnd, selLength);
    txtarea.value = s1 + '<' + v + '>' + s2 + '</' + v + '>' + s3;
    txtarea.selectionStart = s1.length;
    txtarea.selectionEnd = s1.length + 5 + s2.length + v.length * 2;
    return;
   }
  else input('<' + v + '></' + v + '> ');
 }

function input(what)
 {
  if (document.forms['entryform'].elements['texto'].createTextRange)
   {
    document.forms['entryform'].elements['texto'].focus();
    document.selection.createRange().duplicate().text = what;
   }
  else if ((typeof document.forms['entryform'].elements['texto'].selectionStart) != 'undefined') // für Mozilla
   {
    var tarea = document.forms['entryform'].elements['texto'];
    var selEnd = tarea.selectionEnd;
    var txtLen = tarea.value.length;
    var txtbefore = tarea.value.substring(0,selEnd);
    var txtafter =  tarea.value.substring(selEnd, txtLen);
    tarea.value = txtbefore + what + txtafter;
    tarea.selectionStart = txtbefore.length + what.length;
    tarea.selectionEnd = txtbefore.length + what.length;
   }
  else
   {
    document.forms['entryform'].elements['texto'].value += what;
   }
 }

function insert_link()
 {
 if (document.selection) // für IE
   {
    var str = document.selection.createRange().text;
    document.forms['entryform'].elements['texto'].focus();
    var sel = document.selection.createRange();
    sel.text = "[link=" + str + "]Link[/link]";
    return;
   }
  else if ((typeof document.forms['entryform'].elements['texto'].selectionStart) != 'undefined') // für Mozilla
   {
    var txtarea = document.forms['entryform'].elements['texto'];
    var selLength = txtarea.textLength;
    var selStart = txtarea.selectionStart;
    var selEnd = txtarea.selectionEnd;
    //if (selEnd == 1 || selEnd == 2)
    //selEnd = selLength;
    var s1 = (txtarea.value).substring(0,selStart);
    var s2 = (txtarea.value).substring(selStart, selEnd)
    var s3 = (txtarea.value).substring(selEnd, selLength);
    txtarea.value = s1 + '[link=' + s2 + ']Link[/link]' + s3;
    txtarea.selectionStart = s1.length;
    txtarea.selectionEnd = s1.length + 18 + s2.length;
    return;
   }
  else input('[link=]Link[/link] ');
 }

function clear()
 {
  document.forms['entryform'].elements['texto'].value = "";
 }

function more_smilies()
 {
  var popurl="more_smilies.php";
  winpops=window.open(popurl,"","width=250,height=250,scrollbars,resizable");
 }

function upload()
 {
  var popurl="upload.php";
  winpops=window.open(popurl,"","width=330,height=330");
 }

img1 = new Image();
img1.src ="img/link_mo.gif";
img2 = new Image();
img2.src ="img/top_mo.gif";
img3 = new Image();
img3.src ="img/board_mo.gif";
img4 = new Image();
img4.src ="img/thread_mo.gif";
img5 = new Image();
img5.src ="img/mix_mo.gif";
img6 = new Image();
img6.src ="img/next_mo.gif";
img7 = new Image();
img7.src ="img/prev_mo.gif";
img8 = new Image();
img8.src ="img/update_mo.gif";