// Run only against an explicit disposable CI database; never fall back to Calc config.
import mysql from 'mysql2/promise';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {assertEditRevision,appendCalculationChange} from '../apps/api/dist/calculationChangeHistory.js';
if(process.env.CALC_TEST_DB_NAME!=='calc_change_history_test')throw new Error('Explicit disposable database required.');
const pool=mysql.createPool({host:process.env.CALC_TEST_DB_HOST??'127.0.0.1',user:process.env.CALC_TEST_DB_USER??'root',password:process.env.CALC_TEST_DB_PASSWORD,database:process.env.CALC_TEST_DB_NAME,multipleStatements:true,connectionLimit:4});
try{
 // Empty schema owned only by this CI job.
 await pool.query('CREATE TABLE calculations(id BIGINT UNSIGNED PRIMARY KEY); CREATE TABLE calculation_versions(id BIGINT UNSIGNED PRIMARY KEY,calculation_id BIGINT UNSIGNED NOT NULL);');
 await pool.query(await readFile('database/051_calculation_change_history.sql','utf8'));
 await pool.query('INSERT INTO calculations(id) VALUES(1); INSERT INTO calculation_versions(id,calculation_id) VALUES(1,1);');
 const save=async(actorId,expected,failAudit=false)=>{
  const connection=await pool.getConnection();
  try{
   await connection.beginTransaction();
   const [rows]=await connection.execute('SELECT edit_revision FROM calculation_versions WHERE id=1 FOR UPDATE');
   assertEditRevision(expected,rows[0].edit_revision);
   await connection.execute('UPDATE calculation_versions SET edit_revision=edit_revision+1 WHERE id=1');
   await appendCalculationChange(connection,{calculationId:1,versionId:1,actorId:failAudit?0:actorId,kind:'draft_saved',editRevision:expected+1,reason:'Test saving authorized user',changes:{lines:[]}});
   await connection.commit();return 'saved';
  }catch(error){await connection.rollback();throw error;}finally{connection.release();}
 };
 const outcomes=await Promise.allSettled([save(17,0),save(23,0)]);
 assert.equal(outcomes.filter(result=>result.status==='fulfilled').length,1);
 assert.equal(outcomes.filter(result=>result.status==='rejected').length,1);
 let [rows]=await pool.execute('SELECT edit_revision FROM calculation_versions WHERE id=1');assert.equal(Number(rows[0].edit_revision),1);
 let [events]=await pool.execute('SELECT actor_id,edit_revision FROM calculation_change_events');assert.equal(events.length,1);assert.ok([17,23].includes(Number(events[0].actor_id)));
 await assert.rejects(save(17,1,true));
 [rows]=await pool.execute('SELECT edit_revision FROM calculation_versions WHERE id=1');assert.equal(Number(rows[0].edit_revision),1);
 [events]=await pool.execute('SELECT id FROM calculation_change_events');assert.equal(events.length,1);
 console.log('MYSQL PASS: migration, two authorized users, one winning save, stale-write rejection, atomic audit rollback.');
}finally{await pool.end();}
