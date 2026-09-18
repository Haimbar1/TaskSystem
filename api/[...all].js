// Vercel serverless entry point — wraps the same Express app used by
// server/src/index.js for local/Railway dev, so there's one source of
// truth for routes/middleware. No app.listen() here: Vercel drives the
// request/response cycle itself, and env vars come from its dashboard
// (not from server/.env, which is never deployed).
import { app } from '../server/src/app.js';

export default app;
