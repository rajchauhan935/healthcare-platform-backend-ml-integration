function ok(res, data, statusCode = 200) {
  return res.status(statusCode).json({ data });
}

function list(res, data, { limit = 50, offset = 0 } = {}) {
  return res.status(200).json({ data, count: data.length, limit, offset });
}

module.exports = { ok, list };
