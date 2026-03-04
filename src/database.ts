import { Pool } from "pg";
import * as fs from "fs";
import * as path from "path";

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
      throw new Error("DATABASE_URL not set");
    }
    pool = new Pool({ connectionString: dbUrl });
  }
  return pool;
}

export async function initDatabase(): Promise<void> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.warn("DATABASE_URL not set, skipping DB init");
    return;
  }

  try {
    const p = new Pool({ connectionString: dbUrl });

    const initSqlPath = path.join(__dirname, "..", "init.sql");
    if (fs.existsSync(initSqlPath)) {
      const sql = fs.readFileSync(initSqlPath, "utf-8");
      await p.query(sql);
    }

    await p.end();
    console.log("Database initialized");
  } catch (error) {
    console.error("Database init error:", error);
  }
}
