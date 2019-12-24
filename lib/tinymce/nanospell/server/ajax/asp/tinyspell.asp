<%option explicit%><!--#include file="json1.asp"--><script language="JScript" runat="server" src='json2.js'></script><%
Server.ScriptTimeout=30   
Response.Expires = 0
Response.Expiresabsolute = Now() - 1
Response.AddHeader "pragma","no-cache"
Response.AddHeader "cache-control","private"
Response.CacheControl = "no-cache"
Response.Buffer = true
Response.ContentType = "text/javascript"
'################################################################################################################
dim LicenseKey,LicenseFile,fs,t,x,myJSON,word,path
LicenseKey = "TRIAL"
set fs=Server.CreateObject("Scripting.FileSystemObject")
LicenseFile  =  LCASE(Request.ServerVariables("PATH_INFO"))
LicenseFile  = replace(LicenseFile,"/ajax/asp/tinyspell.asp","/license/key.lic")
LicenseFile = Server.MapPath(LicenseFile)
set t=fs.OpenTextFile(LicenseFile,1,false)
LicenseKey=TRIM(t.readline()&"")
t.close
LicenseKey = normalizeKey(LicenseKey)
'################################################################################################################
Dim vntPostedData, lngCount 
vntPostedData =  BinaryToString(Request.BinaryRead(Request.TotalBytes))
if(len(vntPostedData)<1) then
vntPostedData = "{""id"":""c0"",""method"":""spellcheck"",""params"":{""lang"":""en"",""words"":[""helllo"",""worlb""]}}"
end if
'################################################################################################################
Set myJSON = JSON.parse(vntPostedData)  
if(NOT Lcase(myJSON.method)  = "spellcheck") then RESPONSE.WRITE( "UNKNOWN COMMAND" ): RESPONSE.END()
dim objTinyMceSpell
Set objTinyMceSpell = ASPSpellObjectProvider.Create("aspspellcheck")
	  objTinyMceSpell.ignoreCaseMistakes =false
	  objTinyMceSpell.ignoreAllCaps = false
	  objTinyMceSpell.IgnoreNumeric = false
	  objTinyMceSpell.IgnoreEmailAddresses = false
	  objTinyMceSpell.IgnoreWebAddresses = false
	  objTinyMceSpell.newLineNewSentance = false
	  objTinyMceSpell.LicenseKey = LicenseKey
	path = (replace(LCASE(Request.ServerVariables("PATH_INFO")),"/ajax/asp/tinyspell.asp","/dictionaries/"))+""
   objTinyMceSpell.AddCustomDictionary("custom.txt")
   objTinyMceSpell.DictionaryPath = path
		dim arrLangs, i
		arrLangs = Split(myJSON.params.lang,",")
			for i=0 to UBOUND(arrLangs)
			objTinyMceSpell.AddDictionary(trim(arrLangs(i)))
		next
'################################################################################################################
 dim first, suggestions, strsuggestions
				response.write "{""id"":""" & SERVER.HTMLENCODE(myJSON.id) & """,""result"": {"
				first = true
				For Each word In myJSON.params.words
					IF ( NOT objTinyMceSpell.SpellCheck(word)) THEN
								if (first) THEN
										first = false
								ELSE
										response.write ","
								END IF
								suggestions    =  Fetch_Suggestions (word)
								strsuggestions = "["
									FOR i = 0  to UBOUND(suggestions) 
											if (i > 0) THEN
													strsuggestions = strsuggestions& ","
											END IF
												strsuggestions = strsuggestions& """" & SERVER.HTMLENCODE(suggestions(i)) & """"
									NEXT
								strsuggestions = strsuggestions& "]"
								response.write """"&SERVER.HTMLENCODE(word)&""":"&strsuggestions
						}END IF  'SpellCheck(word)
				NEXT 'myJSON.params.words
				response.write "}}"
				FUNCTION  Fetch_Suggestions (word)
				on error resume next
					Fetch_Suggestions = objTinyMceSpell.Suggestions(word)
						if err.number >0 then Fetch_Suggestions = split("","-")
				on error goto 0
				END FUNCTION
'########################################################################################################
%>