<%
dim asp_read, asp_dic, basepath, read_asp
basepath  = replace(Request.ServerVariables("PATH_INFO"),"/server/installer/asp.asp","/")
dic_asp = testdicts (basepath&"server/dictionaries/",read_asp)

response.write("{""asp"":true,""dic_asp"":"""&dic_asp&""",""read_asp"":"&read_asp&"}")

''''''' UTIL '''''''

function testdicts(url, byref can_read)
	testdicts=""
	read_asp = true
	dim fs,fo,fn,path,fntxt,fsOut
	path = Server.MapPath(url)
	set fs=Server.CreateObject("Scripting.FileSystemObject")
	set fo=fs.GetFolder(path)


	FOR EACH fn IN fo.files
	
	fntxt = fs.GetFileName(fn) 
	
 
	
	IF(left(fntxt,1)<>".") AND (right(fntxt,4)=".dic" OR fntxt="custom.txt") THEN
	if(Len(testdicts)>0) THEN testdicts = testdicts & "," 
	testdicts = testdicts & fntxt 
	if(read_asp) THEN
	ON ERROR RESUME NEXT
	        Set fsOut = fs.OpenTextFile(fn, 1, True) 
 
	read_asp = Err.Number = 0
	    On Error Goto 0
	END IF
	END IF
	NEXT

	if(read_asp) THEN read_asp = "true" else read_asp = "false"

	set fo=nothing
	set fs=nothing
	end function
%>