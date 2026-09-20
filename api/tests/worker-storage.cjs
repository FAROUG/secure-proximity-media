const fs = require('node:fs/promises');
const path = require('node:path');
const storage = require('../dist/storage/s3.js');
storage.getUploadedMediaMetadata = async () => ({contentType:'video/mp4',contentLength:1000});
storage.downloadMediaObject = async (_key, destination, signal) => {
 if(process.env.WORKER_TEST_MODE==='shutdown') {
  process.stdout.write('TEST_DOWNLOAD_STARTED\n');
  await new Promise((resolve,reject)=>{signal.addEventListener('abort',()=>reject(signal.reason),{once:true});});
 } else if(process.env.WORKER_TEST_MODE==='invalid') await fs.writeFile(destination,'invalid video');
 else await fs.copyFile(process.env.WORKER_TEST_VIDEO,destination);
};
storage.uploadMediaObject = async (key, source, _type, signal) => {
 signal?.throwIfAborted();
 const target=path.join(process.env.WORKER_TEST_OUTPUT,key);
 await fs.mkdir(path.dirname(target),{recursive:true});
 if(key.endsWith('.m3u8')) {
  const playlist=await fs.readFile(source,'utf8');
  for(const segment of playlist.split('\n').filter(l=>l && !l.startsWith('#'))) await fs.access(path.join(path.dirname(target),segment));
 }
 await fs.copyFile(source,target);
};
