type QueueRedisConnectionOptions = {
  host: string;
  port: number;
  username?: string;
  password?: string;
  db?: number;
  maxRetriesPerRequest: null;
};

const DEFAULT_REDIS_URL = "redis://localhost:6379";

export function getQueueRedisConnection(): QueueRedisConnectionOptions {
  const redisUrl = new URL(process.env.REDIS_URL || DEFAULT_REDIS_URL);
  const db = redisUrl.pathname.replace("/", "");

  return {
    host: redisUrl.hostname,
    port: Number(redisUrl.port || 6379),
    username: redisUrl.username || undefined,
    password: redisUrl.password || undefined,
    db: db ? Number(db) : undefined,
    maxRetriesPerRequest: null
  };
}

export async function closeQueueRedisConnection() {
  return Promise.resolve();
}
