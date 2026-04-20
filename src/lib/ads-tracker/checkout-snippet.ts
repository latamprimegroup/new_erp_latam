/**
 * Snippet browser para anexar parâmetros da página atual a links de checkout (data-ads-checkout-tunnel).
 */

export function buildAppendParamsSnippet(opts: { paramKeys: string[]; payBaseUrl: string }): string {
  const keys = JSON.stringify(opts.paramKeys)
  const pay = JSON.stringify(opts.payBaseUrl)
  return `;(function(w){
  var KEYS=${keys};
  var PAY=${pay};
  function paramsFromLocation(){
    var cur=new URLSearchParams(w.location.search);
    var out=new URLSearchParams();
    KEYS.forEach(function(k){
      var v=cur.get(k);
      if(v!=null&&v!=="")out.set(k,v);
    });
    return out;
  }
  function applyToHref(href){
    try{
      var u=new URL(href,w.location.href);
      var extra=paramsFromLocation();
      extra.forEach(function(v,k){
        if(!u.searchParams.has(k))u.searchParams.set(k,v);
      });
      return u.toString();
    }catch(e){return href;}
  }
  w.adsAtivosAppendCheckoutParams=function(href){
    var base=href||PAY;
    return applyToHref(base);
  };
  w.addEventListener("click",function(ev){
    var el=ev.target&&ev.target.closest&&ev.target.closest("a[data-ads-checkout-tunnel]");
    if(!el)return;
    var href=el.getAttribute("href");
    if(!href)return;
    ev.preventDefault();
    w.location.href=applyToHref(href);
  },true);
})(window);`
}
