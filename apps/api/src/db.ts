import mysql from "mysql2/promise";
import { config } from "./config.js";

export const db = mysql.createPool({
  host: config.database.host,
  port: config.database.port,
  database: config.database.database,
  user: config.database.user,
  password: config.database.password,
  waitForConnections: true,
  connectionLimit: 10,
  decimalNumbers: false
});
