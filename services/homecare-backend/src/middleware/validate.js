const AppError = require('../utils/AppError');

function validate({ body, query, params } = {}) {
  return (req, _res, next) => {
    const details = [];
    for (const [key, schema] of Object.entries({ body, query, params })) {
      if (!schema) continue;
      const { error, value } = schema.validate(req[key], {
        abortEarly: false,
        stripUnknown: false,
        convert: true,
      });
      if (error) {
        details.push(...error.details.map((item) => ({
          field: item.path.length ? `${key}.${item.path.join('.')}` : key,
          message: item.message,
        })));
      } else {
        req[key] = value;
      }
    }
    if (details.length) {
      return next(new AppError(400, 'VALIDATION_ERROR', 'Request validation failed', details));
    }
    next();
  };
}

module.exports = validate;
