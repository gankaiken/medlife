/** <Typesetter>.getTransferables **/

troikaDefine(
function getTransferables(s){const e=[];for(let t in s)s[t]&&s[t].buffer&&e.push(s[t].buffer);return e}
)