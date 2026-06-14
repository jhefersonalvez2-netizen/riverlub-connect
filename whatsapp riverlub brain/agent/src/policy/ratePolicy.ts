const autoReplyRateLimitMap = new Map<string, number[]>();

function currentWindow(nowMs: number) {
  return nowMs - 60 * 60 * 1000;
}

export function isAutoReplyRateLimited(contactId: string, maxPerHour: number, now = Date.now()) {
  const oneHourAgo = currentWindow(now);
  const recent = (autoReplyRateLimitMap.get(contactId) ?? []).filter(
    (timestamp) => timestamp >= oneHourAgo
  );

  autoReplyRateLimitMap.set(contactId, recent);
  return recent.length >= maxPerHour;
}

export function recordAutoReplySent(contactId: string, now = Date.now()) {
  const oneHourAgo = currentWindow(now);
  const recent = (autoReplyRateLimitMap.get(contactId) ?? []).filter(
    (timestamp) => timestamp >= oneHourAgo
  );

  autoReplyRateLimitMap.set(contactId, [...recent, now]);
}
