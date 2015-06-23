// JavaScript Document
  var tagScript = '(?:<script.*?>)((\n|\r|.)*?)(?:<\/script>)';
        /**
        * Eval script fragment
        * @return String
        */
        String.prototype.evalScript = function()
        {
                return (this.match(new RegExp(tagScript, 'img')) || []).evalScript();
        };
        /**
        * strip script fragment
        * @return String
        */
        String.prototype.stripScript = function()
        {
                return this.replace(new RegExp(tagScript, 'img'), '');
        };
        /**
        * extract script fragment
        * @return String
        */
        String.prototype.extractScript = function()
        {
                var matchAll = new RegExp(tagScript, 'img');
                return (this.match(matchAll) || []);
        };
        /**
        * Eval scripts
        * @return String
        */
        Array.prototype.evalScript = function(extracted)
        {
                var s=this.map(function(sr){
                         var sc=(sr.match(new RegExp(tagScript, 'im')) || ['', ''])[1];
                         if(window.execScript){
                              window.execScript(sc);
                         }
                        else
                       {
                           window.setTimeout(sc,0);
                        }
                });
                return true;
        };
        /**
        * Map array elements
        * @param {Function} fun
        * @return Function
        */
        Array.prototype.map = function(fun)
        {
                if(typeof fun!=="function"){return false;}
                var i = 0, l = this.length;
                for(i=0;i<l;i++)
                {
                        fun(this[i]);
                }
                return true;
        }; 