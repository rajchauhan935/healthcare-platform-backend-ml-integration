const AppError = require('../utils/AppError');

function notFound(req, _res, next) {
  next(new AppError(404, 'NOT_FOUND', `Route ${req.method} ${req.originalUrl} was not found`));
}

function errorHandler(err, req, res, _next) {
  let error = err;
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    error = new AppError(400, 'VALIDATION_ERROR', 'Malformed JSON body');
  }
  if (error.code === '23505') {
    error = new AppError(409, 'CONFLICT', 'A record with these details already exists');
  } else if (error.code === '23503') {
    error = new AppError(400, 'VALIDATION_ERROR', 'A referenced record does not exist');
  }

  const status = error.statusCode || 500;
  const body = { error: {
    code: error.code || 'INTERNAL_ERROR',
    message: status >= 500 && process.env.NODE_ENV === 'production'
      ? 'An unexpected error occurred'
      : (error.message || 'An unexpected error occurred'),
  }};
  if (error.details) body.error.details = error.details;
  if (status >= 500) console.error(JSON.stringify({ requestId: req.id, status, code: body.error.code }));
  res.status(status).json(body);
}

module.exports = { notFound, errorHandler };
