import { Redis } from "ioredis";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

let publisher: Redis | null = null;
let subscriber: Redis | null = null;

function getPublisher(): Redis {
  if (!publisher) {
    publisher = new Redis(REDIS_URL);
  }
  return publisher;
}

function getSubscriber(): Redis {
  if (!subscriber) {
    subscriber = new Redis(REDIS_URL);
  }
  return subscriber;
}

export function publishMessage(channel: string, message: string): void {
  getPublisher().publish(channel, message);
}

export function subscribeToChannel(
  channel: string,
  callback: (message: string) => void,
): void {
  const sub = getSubscriber();

  sub.subscribe(channel).then((count) => {
    console.log(
      `Subscribed to ${count} channel(s). Listening on "${channel}".`,
    );
  }).catch((err: unknown) => {
    console.error(`Failed to subscribe to channel ${channel}:`, err);
  });

  sub.on("message", (chan: string, message: string) => {
    if (chan === channel) {
      callback(message);
    }
  });
}
