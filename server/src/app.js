import express from 'express';
import cors from 'cors';
import session from 'express-session';
import pgSession from 'connect-pg-simple';
import { pool } from './db.js';
import passport from './auth/googleStrategy.js';
import authRoutes from './routes/authRoutes.js';
import taskRoutes from './routes/taskRoutes.js';
import userRoutes from './routes/userRoutes.js';
import cronRoutes from './routes/cronRoutes.js';
import tenantRoutes from './routes/tenantRoutes.js';
import { requireAuth } from './middleware/requireAuth.js';
import { requireTenant } from './middleware/tenant.js';

export const app = express();

// Needed for secure cookies to work behind a platform's TLS-terminating
// proxy (Railway/Render/etc.) — without it, express-session sees a plain
// http request and refuses to set a `Secure` cookie at all.
app.set('trust proxy', 1);

app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5173', credentials: true }));
app.use(express.json());
const PgSessionStore = pgSession(session);

app.use(
  session({
    // Deployed as Vercel serverless functions — no in-memory state survives
    // between invocations, so sessions must live in Postgres instead of the
    // default MemoryStore (which only worked for the single long-running
    // dev/Railway process).
    store: new PgSessionStore({ pool, tableName: 'user_sessions', createTableIfMissing: true }),
    secret: process.env.SESSION_SECRET || 'change-me',
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days — otherwise it's a session
      // cookie that some browsers drop on their own schedule anyway.
      // Client and server live on different domains in production, so the
      // cookie must be SameSite=None (+ Secure, which None requires) or the
      // browser silently refuses to send it back on the API fetch() calls —
      // that's the "logged out on every refresh" symptom.
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    },
  })
);
app.use(passport.initialize());
app.use(passport.session());

app.use('/api/auth', authRoutes);
// Super-admin only (each route checks req.user itself — no tenant to scope
// to yet when listing/creating businesses, see tenantRoutes.js).
app.use('/api/tenants', tenantRoutes);
// Called by n8n, not by a logged-in user — protected internally via CRON_SECRET.
app.use('/api/cron', cronRoutes);
app.use('/api/tasks', requireAuth, requireTenant, taskRoutes);
app.use('/api/users', requireAuth, requireTenant, userRoutes);

app.get('/api/health', (req, res) => res.json({ ok: true }));
