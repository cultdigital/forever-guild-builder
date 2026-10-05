// Multi-guild storage must never fall back to the single-guild development file.
export class GuildError extends Error {
  constructor(message, status = 503) {
    super(message);
    this.status = status;
  }
}

export function createRedisClient({ env = process.env, fetchImpl = fetch } = {}) {
  // Select a complete pair, rather than accidentally mixing providers' settings.
  const upstash = env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN;
  const url = upstash ? env.UPSTASH_REDIS_REST_URL : env.KV_REST_API_URL;
  const token = upstash ? env.UPSTASH_REDIS_REST_TOKEN : env.KV_REST_API_TOKEN;
  const configured = Boolean(url && token);

  function requireConfigured() {
    if (!configured) {
      throw new GuildError('Guild storage is not connected. Configure KV_REST_API_URL and KV_REST_API_TOKEN (or the Upstash equivalents).');
    }
  }

  async function command(args) {
    requireConfigured();
    let response;
    try {
      response = await fetchImpl(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(args),
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new GuildError('Guild storage is temporarily unavailable. Please try again shortly.');
    }
    if (!response.ok) throw new GuildError('Guild storage is temporarily unavailable. Please try again shortly.');
    let result;
    try { result = await response.json(); } catch {
      throw new GuildError('Guild storage returned an invalid response. Please try again shortly.');
    }
    if (!result || typeof result !== 'object' || result.error || !Object.hasOwn(result, 'result')) {
      // Never include upstream responses: they may contain sensitive information.
      throw new GuildError('Guild storage could not complete the request. Please try again shortly.');
    }
    return result.result;
  }

  return { configured, requireConfigured, command };
}