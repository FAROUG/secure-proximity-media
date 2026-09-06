import { createClient } from "redis";

export interface Presence {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
}

export const redis = createClient({
  url:
    process.env.REDIS_URL ??
    "redis://localhost:6379"
});

redis.on(
  "error",
  (error) => {
    console.error(
      "Redis error:",
      error
    );
  }
);

export async function connectRedis() {
  if (!redis.isOpen) {
    await redis.connect();
  }
}

function presenceKey(
  userId: string,
  shareId: string
) {
  return `presence:${shareId}:${userId}`;
}

export async function setPresence(
  userId: string,
  shareId: string,
  presence: Presence,
//   ttlSeconds = 30
  ttlSeconds = 120

) {
  const key =
    presenceKey(
      userId,
      shareId
    );

  await redis.set(
    key,
    JSON.stringify(presence),
    {
      EX: ttlSeconds
    }
  );
}

export async function getPresence(
  userId: string,
  shareId: string
): Promise<Presence | null> {

  const key =
    presenceKey(
      userId,
      shareId
    );

  const value =
    await redis.get(key);

  if (!value) {
    return null;
  }

  return JSON.parse(value);
}