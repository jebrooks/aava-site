const attempts = new Map<string, number[]>();

export function allowRequest(key: string, limit = 5, windowMs = 10 * 60 * 1000) {
  const now = Date.now();
  const recent = (attempts.get(key) || []).filter((timestamp) => now - timestamp < windowMs);
  if (recent.length >= limit) return false;
  recent.push(now);
  attempts.set(key, recent);

  if (attempts.size > 500) {
    for (const [storedKey, timestamps] of attempts) {
      if (!timestamps.some((timestamp) => now - timestamp < windowMs)) attempts.delete(storedKey);
    }
  }
  return true;
}
