const cache = new Map();

function responseCache(ttlMs, keyFn = (req) => req.originalUrl) {
  return (req, res, next) => {
    const key = `${req.user ? req.user.role : 'public'}:${keyFn(req)}`;
    const entry = cache.get(key);
    if (entry && entry.expiresAt > Date.now()) return res.status(entry.status).json(entry.body);

    const originalJson = res.json.bind(res);
    res.json = (body) => {
      if (res.statusCode < 400) {
        cache.set(key, { status: res.statusCode, body, expiresAt: Date.now() + ttlMs });
      }
      return originalJson(body);
    };
    next();
  };
}

function clearCache() { cache.clear(); }

module.exports = { responseCache, clearCache };
