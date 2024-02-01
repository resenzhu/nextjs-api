import {config} from 'dotenv';
import mysql from 'mysql2/promise';

if (process.env.NODE_ENV !== 'production') {
  config();
}

export const database = mysql.createPool({
  host: process.env.MYSQL_HOST,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
  connectionLimit: 200
});
