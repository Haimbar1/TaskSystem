import express from 'express';
import cors from 'cors';
import session from 'express-session';
import passport from './auth/googleStrategy.js';
import authRoutes from './routes/authRoutes.js';
import taskRoutes from './routes/taskRoutes.js';
import userRoutes from './routes/userRoutes.js';
import cronRoutes from './routes/cronRoutes.js';
import tenantRoutes from './routes/tenantRoutes.js';
import { requireAuth } from './middleware/requireAuth.js';
import { requireTenant } from './middleware/tenant.js';

export const app = express();

app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5173', credentials: true }));
app.use(express.json());
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'change-me',
    resave: false,
    saveUninitialized: false,
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
