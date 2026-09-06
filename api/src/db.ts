import pg from "pg";

const { Pool } = pg;

export const pool = new Pool({
  host: process.env.DB_HOST ?? "localhost",
  port: Number(process.env.DB_PORT ?? 5432),
  database: process.env.DB_NAME ?? "secure_media",
  user: process.env.DB_USER ?? "secure_media",
  password: process.env.DB_PASSWORD ?? "secure_media_password",
});

export async function query<
  T extends pg.QueryResultRow = any
>(
  text: string,
  params: any[] = []
): Promise<pg.QueryResult<T>> {
  return pool.query<T>(text, params);
}