let counter = 0;

export function generateId(prefix = "msg"): string {
  counter++;
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).substring(2, 8);
  return `${prefix}_${ts}_${rand}_${counter}`;
}

export function generateClientId(): string {
  return generateId("client");
}

export function generateMessageId(): string {
  return generateId("msg");
}
