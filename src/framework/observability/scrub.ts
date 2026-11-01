const sensitive = /(token|password|passwd|secret|authorization|cookie|api[-_]?key|signature|credential|email|username)/i;
const patterns: readonly [RegExp, string][] = [
  [/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]'],
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/g, '[jwt]'],
  [/([?&](?:X-Goog-[^=&\s]+|X-Amz-[^=&\s]+|Signature|sig|token|key|api_key|apikey|access_token)=)[^&\s"']+/gi, '$1[redacted]'],
  [/\b(?:AIza[0-9A-Za-z_-]{20,}|sk[-_][A-Za-z0-9_-]{16,}|re_[A-Za-z0-9]{16,})\b/g, '[secret]'],
  [/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]'],
  [/[A-Za-z0-9+/=_-]{200,}/g, '[long-data]']
];
export function scrub(text: string): string {
  return patterns.reduce((value, [pattern, replacement]) => value.replace(pattern, replacement), text);
}

/** Non-mutating and cycle-safe; sensitive objects are redacted in their entirety. */
export function scrubDeep<T>(value: T, maxDepth = 12): T {
  const seen = new WeakSet<object>();
  const walk = (v: unknown, depth: number): unknown => {
    if (typeof v === 'string') return scrub(v);
    if (v === null || typeof v !== 'object') return v;
    if (depth <= 0 || seen.has(v)) return '[omitted]';
    seen.add(v);
    if (v instanceof Error) return { name: scrub(v.name), message: scrub(v.message), stack: scrub(v.stack ?? '') };
    if (Array.isArray(v)) return v.map(x => walk(x, depth - 1));
    return Object.fromEntries(Object.entries(v).map(([key, item]) => [key, sensitive.test(key) ? '[redacted]' : walk(item, depth - 1)]));
  };
  return walk(value, maxDepth) as T;
}
