const config = require('../config');

function webhookAuth(req, res, next) {
  if (!config.webhookSecret) return next();

  const token =
    req.headers['x-webhook-secret'] ||
    req.headers['authorization']?.replace(/^Bearer\s+/i, '') ||
    req.query.token;

  if (token !== config.webhookSecret) {
    return res.status(401).json({ success: false, error: 'Unauthorized webhook' });
  }
  return next();
}

module.exports = { webhookAuth };
