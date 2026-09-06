import { query } from "../db.js";

export interface User {
  id: string;
  email: string;
  name: string;
  created_at: Date;
}

export async function createUser(
  id: string,
  email: string,
  name: string
) {
  const result = await query<User>(
    `
    INSERT INTO users (
      id,
      email,
      name
    )
    VALUES ($1, $2, $3)
    RETURNING *
    `,
    [id, email, name]
  );

  return result.rows[0];
}

export async function getUserById(
  id: string
) {
  const result = await query<User>(
    `
    SELECT *
    FROM users
    WHERE id = $1
    `,
    [id]
  );

  return result.rows[0] ?? null;
}

export async function getUserByEmail(
  email: string
) {
  const result = await query<User>(
    `
    SELECT *
    FROM users
    WHERE email = $1
    `,
    [email]
  );

  return result.rows[0] ?? null;
}