const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const {randomUUID}=require('node:crypto');
const {spawn}=require('node:child_process');
const path=require('node:path');
const os=require('node:os');
const root=path.resolve(__dirname,'../..');
if (!process.env.WORKER_TEST_DATABASE_URL) throw new Error('Set WORKER_TEST_DATABASE_URL to a disposable PostgreSQL database.');
const database=new URL(process.env.WORKER_TEST_DATABASE_URL);
process.env.DB_HOST=database.hostname;
process.env.DB_PORT=database.port || '5432';
process.env.DB_NAME=decodeURIComponent(database.pathname.slice(1));
process.env.DB_USER=decodeURIComponent(database.username);
process.env.DB_PASSWORD=decodeURIComponent(database.password);
const schema='worker_test_'+randomUUID().replaceAll('-','');
process.env.PGOPTIONS='-c search_path='+schema;
let outputDirectory;

const {query,pool}=require(root+'/api/dist/db.js');
const repo=require(root+'/api/dist/repositories/media.js');
async function runWorker(id, mode='success') {
 return new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,['--require',path.join(__dirname,'worker-storage.cjs'),root+'/api/dist/worker/process-media.js',id],{env:{...process.env,WORKER_TEST_MODE:mode,WORKER_TEST_VIDEO:root+'/api/test-video-two.mp4',WORKER_TEST_OUTPUT:outputDirectory},stdio:['ignore','pipe','pipe']});
  let output=''; let shutdownSent=false;
  const timeout=setTimeout(()=>{child.kill('SIGKILL');reject(new Error('worker timeout: '+output));},90000);
  child.stdout.on('data',chunk=>{output+=chunk;if(mode==='shutdown' && !shutdownSent && output.includes('TEST_DOWNLOAD_STARTED')) { shutdownSent=true; child.kill('SIGTERM'); }});
  child.stderr.on('data',chunk=>output+=chunk);
  child.on('error',reject);child.on('close',code=>{clearTimeout(timeout);resolve({code,output});});
 });
}
(async()=>{
 try {
  outputDirectory=await fs.mkdtemp(path.join(os.tmpdir(),'worker-test-output-'));
  await query('CREATE SCHEMA '+schema);
  // First create the old schema, then exercise the new migration twice.
  const init=(await fs.readFile(root+'/database/init.sql','utf8')).replace('    processing_claim_id UUID,\n    processing_lease_expires_at TIMESTAMP,\n','');
  await query(init);
  const migration=await fs.readFile(root+'/database/migrations/003_media_processing_leases.sql','utf8');
  await query(migration);await query(migration);
  const owner=randomUUID();await query('INSERT INTO users(id,email,name) VALUES ($1,$2,$3)',[owner,owner+'@example.test','Test Owner']);
  async function job(){const id=randomUUID();await repo.createPendingMediaUpload(id,owner,'test.mp4',`test/${id}/original`,'video/mp4');await repo.markMediaUploaded(id,owner);return id;}
  const id=await job(), a=randomUUID(), b=randomUUID();
  const attempts=await Promise.all([repo.claimMediaForProcessing(id,a),repo.claimMediaForProcessing(id,b)]);
  assert.equal(attempts.filter(Boolean).length,1);
  const claim=attempts.find(Boolean).processing_claim_id, stale=claim===a?b:a;
  assert.equal(await repo.renewMediaProcessingLease(id,stale),false);
  assert.equal(await repo.markMediaReady(id,stale,'wrong'),null);
  assert.equal(await repo.renewMediaProcessingLease(id,claim),true);
  await query("UPDATE media SET processing_lease_expires_at=NOW()-INTERVAL '1 second' WHERE id=$1",[id]);
  assert.equal(await repo.markMediaReady(id,claim,'expired'),null);
  const reclaimed=await repo.claimMediaForProcessing(id,stale);assert.ok(reclaimed);
  assert.equal(await repo.markMediaProcessingFailed(id,claim,'stale'),null);
  assert.equal(await repo.releaseMediaProcessingClaim(id,stale),true);
  assert.equal((await repo.getMediaById(id)).processing_status,'UPLOADED');
  await repo.claimMediaForProcessing(id,a);assert.ok(await repo.markMediaProcessingFailed(id,a,'expected failure'));
  const success=await job();let result=await runWorker(success);assert.equal(result.code,0,result.output);
  const media=await repo.getMediaById(success);assert.equal(media.processing_status,'READY');assert.equal(media.processing_claim_id,null);
  const manifest=await fs.readFile(path.join(outputDirectory,media.storage_key),'utf8');assert.ok(manifest.startsWith('#EXTM3U'));assert.ok(manifest.includes('#EXT-X-ENDLIST'));
  const invalid=await job();result=await runWorker(invalid,'invalid');assert.equal(result.code,1,result.output);assert.equal((await repo.getMediaById(invalid)).processing_status,'FAILED');
  const shutdown=await job();result=await runWorker(shutdown,'shutdown');assert.equal(result.code,0,result.output);assert.equal((await repo.getMediaById(shutdown)).processing_status,'UPLOADED');
  console.log('PASS: migration twice; atomic claims; expiry/reclaim; stale-claim rejection; lease renewal/release; real FFmpeg READY path with segments uploaded before manifest; invalid-video FAILED path; SIGTERM returns job to UPLOADED. S3 mocked locally.');
 } finally {
  try {await query('DROP SCHEMA IF EXISTS '+schema+' CASCADE');}
  finally {await pool.end(); if(outputDirectory) await fs.rm(outputDirectory,{recursive:true,force:true});}
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
