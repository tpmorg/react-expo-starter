const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const { DatabaseSync } = require('node:sqlite');
require.extensions['.ts'] = (module, filename) => {
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}
  }).outputText;
  module._compile(code, filename);
};
const {coreMigrations} = require('../src/framework/storage/coreMigrations.ts');
const {SyncQueueRepository} = require('../src/framework/storage/syncQueueRepository.ts');
function adapter(raw) {
  return {
    execAsync: async sql => raw.exec(sql),
    getAllAsync: async (sql,...params) => raw.prepare(sql).all(...params),
    runAsync: async (sql,...params) => raw.prepare(sql).run(...params)
  };
}
(async () => {
  for(const legacy of [false,true]) {
    const raw = new DatabaseSync(':memory:');
    if(legacy) raw.exec(`
      CREATE TABLE generation_jobs(id TEXT PRIMARY KEY, owner_id TEXT, idempotency_key TEXT UNIQUE,
        status TEXT, request_json TEXT, result_json TEXT, error_json TEXT, created_at INTEGER, updated_at INTEGER);
      INSERT INTO generation_jobs VALUES('job','alice','key','queued','{}',NULL,NULL,1,1);
      CREATE TABLE sync_queue(id TEXT PRIMARY KEY,owner_id TEXT,entity_type TEXT,entity_id TEXT,
        operation TEXT,payload_json TEXT,attempts INTEGER,next_attempt_at INTEGER,created_at INTEGER,
        UNIQUE(entity_type,entity_id,operation));
      INSERT INTO sync_queue VALUES('old','alice','note','1','upsert','{}',0,NULL,1);
    `);
    const db = adapter(raw);
    for(const migration of coreMigrations) await migration.migrate(db);
    if(legacy) assert.equal(raw.prepare('SELECT operation FROM generation_jobs').get().operation,'generation');
    let counter = 0;
    const queue = new SyncQueueRepository({connection:async()=>db},{create:()=>String(++counter)});
    const input = {ownerId:'alice',entityType:'note',entityId:'2',operation:'upsert',payload:{v:1},nextAttemptAt:null};
    await queue.enqueue(input);
    const old = (await queue.listReady('alice')).find(item=>item.entityId==='2');
    await queue.enqueue({...input,payload:{v:2}});
    await queue.markComplete(old.id);
    assert.equal((await queue.listReady('alice')).find(item=>item.entityId==='2').payload.v,2);
    await queue.enqueue({...input,ownerId:'bob'});
    assert.equal((await queue.listReady('bob')).length,1);
    if(legacy) assert.equal((await queue.listReady('alice')).find(item=>item.id==='old').entityId,'1');
    raw.close();
  }
  console.log('Fresh/legacy migrations, data preservation, queue replacement and owner isolation passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
