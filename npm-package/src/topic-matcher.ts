/**
 * Match a topic against a subscription pattern with wildcard support.
 * - `*` matches exactly one segment
 * - `#` matches one or more segments
 */
export function topicMatches(pattern: string, topic: string): boolean {
  if (pattern === topic) return true;

  const pp = pattern.split(".");
  const tp = topic.split(".");

  for (let i = 0; i < pp.length; i++) {
    if (pp[i] === "#") {
      // # matches one or more remaining segments
      return tp.length >= i + 1;
    }
    if (i >= tp.length) return false;
    if (pp[i] === "*") continue;
    if (pp[i] !== tp[i]) return false;
  }

  return pp.length === tp.length;
}
