/** Reads a provider's error response for a log line: the status plus at most 300 chars of body. */
export async function readErrorDetail(res: Response, provider: string): Promise<string> {
  let detail = `${provider} HTTP ${res.status}`;
  try {
    const text = (await res.text()).slice(0, 300);
    if (text) detail += ` · ${text}`;
  } catch {
    // unreadable body — the status is enough
  }
  return detail;
}
