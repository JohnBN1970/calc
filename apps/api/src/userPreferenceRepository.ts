import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { db } from "./db.js";

export async function getUserPreference<T>(actorId:number,key:string):Promise<T|null>{
  const [rows]=await db.execute<RowDataPacket[]>(
    "SELECT value_json FROM calc_user_preferences WHERE actor_id=? AND preference_key=? LIMIT 1",
    [actorId,key]
  );
  if(!rows[0])return null;
  const raw=rows[0].value_json;
  if(raw==null)return null;
  if(typeof raw==="string"){
    try{return JSON.parse(raw) as T;}catch{return null;}
  }
  return raw as T;
}

export async function setUserPreference(actorId:number,key:string,value:unknown):Promise<void>{
  const json=JSON.stringify(value);
  await db.execute<ResultSetHeader>(
    `INSERT INTO calc_user_preferences(actor_id,preference_key,value_json)
     VALUES(?,?,?)
     ON DUPLICATE KEY UPDATE value_json=VALUES(value_json),updated_at=CURRENT_TIMESTAMP(6)`,
    [actorId,key,json]
  );
}
