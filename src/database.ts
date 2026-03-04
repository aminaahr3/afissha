import { Pool } from "pg";
import * as fs from "fs";
import * as path from "path";

let pool: Pool | null = null;
let dbAvailable = false;

export function isDbAvailable(): boolean {
  return dbAvailable;
}

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

export function tryGetPool(): Pool | null {
  if (!dbAvailable) return null;
  try {
    return getPool();
  } catch {
    return null;
  }
}

export async function initDatabase(): Promise<void> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.warn("⚠️ DATABASE_URL not set — running without database (using in-memory data)");
    return;
  }

  try {
    const p = new Pool({ connectionString: dbUrl });
    await p.query("SELECT 1");
    console.log("✅ Database connection successful");
    dbAvailable = true;

    const initSqlPath = path.join(__dirname, "..", "init.sql");
    if (fs.existsSync(initSqlPath)) {
      const sql = fs.readFileSync(initSqlPath, "utf-8");
      await p.query(sql);
      console.log("✅ init.sql executed");
    }

    const catCount = await p.query("SELECT COUNT(*) FROM categories");
    const cityCount = await p.query("SELECT COUNT(*) FROM cities");
    const tmplCount = await p.query("SELECT COUNT(*) FROM event_templates");
    console.log(`📊 Data: ${catCount.rows[0].count} categories, ${cityCount.rows[0].count} cities, ${tmplCount.rows[0].count} templates`);

    if (parseInt(catCount.rows[0].count) === 0) {
      console.log("⚠️ Empty tables — seeding from code...");
      await runSeedData(p);
    }

    await p.end();
    pool = null;
  } catch (error: any) {
    console.error("❌ Database unavailable:", error.message);
    console.log("⚠️ Running without database — using in-memory fallback data");
    dbAvailable = false;
  }
}

async function runSeedData(p: Pool): Promise<void> {
  const { CATEGORIES, CITIES, EVENT_TEMPLATES } = await import("./seedData");

  for (const c of CATEGORIES) {
    await p.query("INSERT INTO categories (id, name, name_ru) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING", [c.id, c.name, c.name_ru]);
  }
  await p.query("SELECT setval('categories_id_seq', (SELECT COALESCE(MAX(id),1) FROM categories))");

  for (const c of CITIES) {
    await p.query("INSERT INTO cities (id, name) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING", [c.id, c.name]);
  }
  await p.query("SELECT setval('cities_id_seq', (SELECT COALESCE(MAX(id),1) FROM cities))");

  for (const t of EVENT_TEMPLATES) {
    await p.query("INSERT INTO event_templates (id, name, description, category_id, ticket_image_url, is_active) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (id) DO NOTHING",
      [t.id, t.name, t.description, t.category_id, t.ticket_image_url, t.is_active]);
  }
  await p.query("SELECT setval('event_templates_id_seq', (SELECT COALESCE(MAX(id),1) FROM event_templates))");

  console.log("✅ Seed data inserted");
}
