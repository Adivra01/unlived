/* Same-origin SQLite API client; sessions use HttpOnly cookies. */
(() => {
  const listeners=new Set();let session=null;
  async function request(path,body){
    try{const response=await fetch('/api/'+path,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-UNLIVED-Request':'1'},body:JSON.stringify(body)});return await response.json()}
    catch{return {data:null,error:{message:'Le serveur local est indisponible.'}}}
  }
  const emit=(event)=>listeners.forEach(fn=>fn(event,session));
  class Query{
    constructor(table){this.body={table,action:'select',filters:[],orders:[]};this.singleRow=false}
    select(columns='*'){this.body.columns=columns;return this}
    eq(key,value){this.body.filters.push({op:'eq',key,value});return this}
    in(key,value){this.body.filters.push({op:'in',key,value});return this}
    order(key,options={}){this.body.orders.push({key,ascending:options.ascending!==false});return this}
    range(start,end){this.body.offset=start;this.body.limit=end-start+1;return this}
    limit(count){this.body.limit=count;return this}
    insert(values){this.body.action='insert';this.body.values=values;return this}
    upsert(values){this.body.action='upsert';this.body.values=values;return this}
    update(values){this.body.action='update';this.body.values=values;return this}
    delete(){this.body.action='delete';return this}
    single(){this.singleRow=true;return this}
    maybeSingle(){this.singleRow=true;return this}
    then(resolve,reject){return request('data',this.body).then(result=>{if(this.singleRow&&!result.error)result.data=result.data?.[0]||null;return result}).then(resolve,reject)}
  }
  async function auth(action,values={}){
    const result=await request('auth',{action,...values});
    if(!result.error){session=result.data?.session||null;emit(action==='logout'?'SIGNED_OUT':action==='update'?'USER_UPDATED':'SIGNED_IN')}
    return result;
  }
  const client={from:table=>new Query(table),auth:{
    async getSession(){const result=await request('auth',{action:'session'});session=result.data?.session||null;return result},
    async getUser(){const result=await this.getSession();return {data:{user:result.data?.session?.user||null},error:result.error}},
    signInWithPassword:values=>auth('login',values),
    signUp:values=>auth('signup',{...values,display_name:values.options?.data?.display_name||''}),
    signOut:()=>auth('logout'),
    updateUser:values=>auth('update',values),
    resetPasswordForEmail:()=>Promise.resolve({data:null,error:{message:'La récupération par e-mail sera activée après configuration de l’expéditeur.'}}),
    onAuthStateChange(callback){listeners.add(callback);return {data:{subscription:{unsubscribe:()=>listeners.delete(callback)}}}}
  }};
  window.UNLIVEDLocal=client;
})();
