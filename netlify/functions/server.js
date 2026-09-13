// Netlify Function wrapping the existing Express app (single-deploy setup).
// All routes stay defined once in server.js; this file only adapts the app
// to the serverless handler signature. No routes are duplicated here.
const serverless = require('serverless-http');
const app = require('../../server');

module.exports.handler = serverless(app);
