export type ParsedEventType = {
  base: string;
  version: number | null;
  raw: string;
};

const VERSION_PATTERN = /^(.+):v(\d+)$/;

export function parseEventType(eventType: string): ParsedEventType {
  const match = eventType.match(VERSION_PATTERN);
  if (match) {
    return { base: match[1]!, version: parseInt(match[2]!, 10), raw: eventType };
  }
  return { base: eventType, version: null, raw: eventType };
}

export function isVersionedEvent(eventType: string): boolean {
  return VERSION_PATTERN.test(eventType);
}
