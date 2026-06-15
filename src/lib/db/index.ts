import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import postgres from "postgres";

import * as schema from "./schema";

export { schema };

/** True when a DATABASE_URL is configured (false in CI → DB tests skip). */
export function hasDatabaseUrl(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

type Db = PostgresJsDatabase<typeof schema>;

// Cache the client across HMR / repeated imports so we never leak connections.
const globalForDb = globalThis as unknown as {
  __pfmSql?: ReturnType<typeof postgres>;
  __pfmDb?: Db;
};

function createClient(): ReturnType<typeof postgres> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set — PFM needs the `pfm` MyDB role to run.",
    );
  }
  // search_path → financialmanager first; source schemas read-only by role.
  return postgres(url, {
    max: 10,
    onnotice: () => {},
    connection: { search_path: "financialmanager, public" },
  });
}

/** The shared postgres.js client (lazy, cached). */
export function getSql(): ReturnType<typeof postgres> {
  if (!globalForDb.__pfmSql) globalForDb.__pfmSql = createClient();
  return globalForDb.__pfmSql;
}

/** The typed Drizzle instance over MyDB (lazy, cached). */
export function getDb(): Db {
  if (!globalForDb.__pfmDb) {
    globalForDb.__pfmDb = drizzle(getSql(), { schema });
  }
  return globalForDb.__pfmDb;
}

export interface DbHealth {
  user: string;
  database: string;
  /** Whether the `financialmanager` schema exists and is reachable. */
  financialmanagerPresent: boolean;
}

/** Probe connectivity + identity. Throws if the DB is unreachable. */
export async function dbHealth(): Promise<DbHealth> {
  const rows = await getDb().execute<{
    user: string;
    database: string;
    fm: boolean;
  }>(sql`
    select
      current_user as user,
      current_database() as database,
      exists(
        select 1 from information_schema.schemata
        where schema_name = 'financialmanager'
      ) as fm
  `);
  const row = rows[0];
  return {
    user: row.user,
    database: row.database,
    financialmanagerPresent: row.fm,
  };
}
