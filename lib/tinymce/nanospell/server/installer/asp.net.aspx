<%@ Page Language="C#" AutoEventWireup="true" Debug="true" MaintainScrollPositionOnPostback="false" StylesheetTheme="" Theme="" EnableTheming="false"  ValidateRequest="false"  %><%@ OutputCache Location="None" VaryByParam="None" %><script type="text/C#" runat="server">

protected void Page_Init(object sndr, EventArgs e)
    {
        bool foundAssembly = false;
        bool canRead = true;

        foreach (System.Reflection.Assembly currentAssembly in AppDomain.CurrentDomain.GetAssemblies())
        {
            if (currentAssembly.GetName().Name == "TinyMCESpell")
            {
                foundAssembly = true;
				break;
            }
        } 

		string dic_net = ListDictionaries(Request.MapPath("../dictionaries/"), ref canRead);
	

       Response.Write("{\"net\": true, \"dll\":" + foundAssembly.ToString().ToLower() + ", \"dic_net\":\""+dic_net+"\" , \"read_net\":\""+canRead.ToString().ToLower()+"\" }");  
       Response.Flush();
       Response.End();

	
    }       

	 string ListDictionaries(string DictionaryPath, ref bool canRead){
        System.IO.DirectoryInfo di = new System.IO.DirectoryInfo(DictionaryPath);
      System.Collections.Generic.List<string> dictList = new System.Collections.Generic.List<string>();
        System.IO.FileInfo[] Dictfiles =  di.GetFiles("*.*");
        foreach(System.IO.FileInfo File in Dictfiles){

            if(File.Name[0]!='.' && File.Name[0]!='_' && (File.Extension==".dic" || File.Name=="custom.txt")){
             dictList.Add(File.Name);

				if(canRead){try{bool test = File.OpenRead().CanRead; }catch(Exception e){canRead = false;}}
			
            }

		 
        }
        return String.Join(",",dictList.ToArray());
	}                                                                                         
</script><!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head id="NotRendered1" runat="server">
    <title>Themes Compatibility</title>
</head>
<body><form runat="server" id="NotRendered2"></form></body>
</html>