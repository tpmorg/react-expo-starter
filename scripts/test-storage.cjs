const assert = require('node:assert/strict');
require('./ts-register.cjs');
const {openMemoryDatabase} = require('../src/framework/testing/nodeSqlite.ts');
const {coreMigrations} = require('../src/framework/storage/coreMigrations.ts');
const {SyncQueueRepository} = require('../src/framework/storage/syncQueueRepository.ts');
const {operationMigrations} = require('../src/framework/storage/operationMigrations.ts');
const {PendingOperationStore} = require('../src/framework/operations/pendingOperationStore.ts');
(async () => {
  for(const legacy of [false,true]) {
    const {raw, db, connection} = openMemoryDatabase();
    if(legacy) raw.exec(`
      CREATE TABLE generation_jobs(id TEXT PRIMARY KEY, owner_id TEXT, idempotency_key TEXT UNIQUE,
        status TEXT, request_json TEXT, result_json TEXT, error_json TEXT, created_at INTEGER, updated_at INTEGER);
      INSERT INTO generation_jobs VALUES('job','alice','key','queued','{}',NULL,NULL,1,1);
      CREATE TABLE sync_queue(id TEXT PRIMARY KEY,owner_id TEXT,entity_type TEXT,entity_id TEXT,
        operation TEXT,payload_json TEXT,attempts INTEGER,next_attempt_at INTEGER,created_at INTEGER,
        UNIQUE(entity_type,entity_id,operation));
      INSERT INTO sync_queue VALUES('old','alice','note','1','upsert','{}',0,NULL,1);
    `);
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
    for(const migration of operationMigrations) await migration.migrate(db);
    const operations = new PendingOperationStore({connection}, {create:()=>String(++counter)});
    const op = await operations.create('alice', 'unlock:1', {item:1});
    assert.equal((await operations.create('alice', 'unlock:1', {item:999})).idempotencyKey, op.idempotencyKey);
    const keys = [];
    const send = async value => {keys.push(value.idempotencyKey); throw new Error('uncertain network outcome');};
    assert.equal((await operations.run(op, send)).status, 'pending');
    const malformed = Object.assign(new Error('response unreadable after a possible debit'), {code:'INVALID_RESPONSE'});
    assert.equal((await operations.run(op, async()=>{throw malformed;}, {isTerminal:()=>true})).status, 'pending');
    assert.equal((await operations.list('alice')).length, 1);
    // A new service instance simulates process restart; the same durable key must survive.
    const restarted = new PendingOperationStore({connection}, {create:()=>String(++counter)});
    const results = await restarted.resume('alice', async value=>{keys.push(value.idempotencyKey); return 'done';});
    assert.equal(results[0].status, 'done');
    assert.deepEqual(keys, [op.idempotencyKey, op.idempotencyKey]);
    assert.equal((await restarted.list('alice')).length, 0);
    await operations.create('bob', 'unlock:1', {item:1});
    assert.equal((await operations.list('alice')).length, 0);
    assert.equal((await operations.list('bob')).length, 1);
    await assert.rejects(db.withTransactionAsync(async()=>{
      await db.runAsync("INSERT INTO usage_events(id,owner_id,event_type,source,created_at) VALUES('rollback','alice','completed','free',1)");
      await db.withTransactionAsync(async()=>{throw new Error('rollback');});
    }));
    assert.equal(await db.getFirstAsync("SELECT * FROM usage_events WHERE id='rollback'"), null);
    await db.closeAsync();
  }
  console.log('Fresh/legacy migrations, data preservation, queue replacement, owner isolation, outbox restart/idempotency and nested transaction rollback passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
