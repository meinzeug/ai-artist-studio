import "dotenv/config";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
const globalDb = globalThis as unknown as { studioPool?: pg.Pool };
export const pool =
  globalDb.studioPool ??
  new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
if (process.env.NODE_ENV !== "production") globalDb.studioPool = pool;
export const db = drizzle(pool);
export type Client = Pick<pg.PoolClient, "query">;
export async function query<T = Record<string, any>>(
  text: string,
  params: unknown[] = [],
  client: Client = pool,
): Promise<T[]> {
  return (await client.query(text, params)).rows as T[];
}
export async function one<T = Record<string, any>>(
  text: string,
  params: unknown[] = [],
  client: Client = pool,
): Promise<T | undefined> {
  return (await query<T>(text, params, client))[0];
}
export async function transaction<T>(
  fn: (c: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    const result = await fn(c);
    await c.query("COMMIT");
    return result;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
