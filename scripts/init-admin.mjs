import {mkdir,readFile,writeFile,rename,rm} from 'node:fs/promises';
import {randomBytes,randomUUID,scryptSync} from 'node:crypto';
import path from 'node:path';
const root=path.resolve(process.env.BASKETBALL_DATA_DIR||'.local-run/workbench');
const dir=path.join(root,'access');await mkdir(dir,{recursive:true});
const lock=path.join(dir,'lock');await mkdir(lock);
try{
 const file=path.join(dir,'accounts.json');const db=await readFile(file,'utf8').then(JSON.parse).catch(e=>{if(e.code==='ENOENT')return {users:[],sessions:[]};throw e;});
 if(db.users.some(u=>u.role==='admin'))console.log('Administrator already initialized.');
 else{
  const password=process.env.BASKETBALL_ADMIN_PASSWORD||randomBytes(18).toString('base64url');
  if(password.length<12||password.length>128)throw new Error('Admin password must have 12–128 characters');
  const salt=randomBytes(16).toString('hex');db.users.push({id:randomUUID(),username:'admin',role:'admin',salt,passwordHash:scryptSync(password,salt,32).toString('hex')});
  const temp=file+'.'+randomUUID();await writeFile(temp,JSON.stringify(db),{mode:0o600});await rename(temp,file);
  const credentials=path.join(dir,'admin-initial.json');await writeFile(credentials,JSON.stringify({username:'admin',password}),{mode:0o600});
  console.log('Administrator initialized. Credentials saved to',credentials);
 }
}finally{await rm(lock,{recursive:true,force:true});}
