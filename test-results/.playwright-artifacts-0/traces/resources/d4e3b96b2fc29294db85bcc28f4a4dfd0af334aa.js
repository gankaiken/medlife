/** <Typesetter>.init **/

troikaDefine(
function init(s){return function(e){return new Promise(t=>{s.typeset(e,t)})}}
)