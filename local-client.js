/* Same-origin SQLite API client; sessions use HttpOnly cookies. */
(() => {
  const listeners=new Set();let session=null;let authRevision=0,sessionInitialized=false;
  async function request(path,body){
    try{const response=await fetch('/api/'+path,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-UNLIVED-Request':'1'},body:JSON.stringify(body)});const result=await response.json();if(result.data?.user?.role==='admin'||result.data?.session?.user?.role==='admin'){try{localStorage.setItem('unlived-analytics-exclude','1')}catch{}}return result}
    catch{return {data:null,error:{message:'Le serveur partagé est indisponible.'}}}
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
    const version=++authRevision;
    const result=await request('auth',{action,...values});
    if(version!==authRevision)return result;
    if(!result.error){sessionInitialized=true;session=result.data?.session||null;if(action==='logout')emit('SIGNED_OUT');else if(session)emit(action==='update'?'USER_UPDATED':'SIGNED_IN')}
    return result;
  }
  const client={from:table=>new Query(table),auth:{
    async getSession(){const version=authRevision;const result=await request('auth',{action:'session'});if(version!==authRevision)return {data:{session,user:session?.user||null},error:null};if(!result.error){const previous=session?.user?.id||null;session=result.data?.session||null;const changed=sessionInitialized&&previous!==(session?.user?.id||null);sessionInitialized=true;if(changed){authRevision++;emit(session?'SIGNED_IN':'SIGNED_OUT');}}return result},
    async getUser(){const result=await this.getSession();return {data:{user:result.data?.session?.user||null},error:result.error}},
    signInWithPassword:values=>auth('login',values),
    signUp:values=>auth('signup',{...values,display_name:values.options?.data?.display_name||''}),
    signOut:()=>auth('logout'),
    updateUser:values=>auth('update',values),
    resetPasswordForEmail:email=>request('auth',{action:'reset_request',email}),
    resendVerification:email=>request('auth',{action:'resend_verification',email}),
    onAuthStateChange(callback){listeners.add(callback);return {data:{subscription:{unsubscribe:()=>listeners.delete(callback)}}}}
  }};
  window.UNLIVEDLocal=client;
  window.addEventListener('focus',()=>client.auth.getSession().catch(()=>{}));
})();
