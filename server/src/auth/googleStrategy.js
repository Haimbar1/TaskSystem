import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { pool } from '../db.js';

passport.serializeUser((user, done) => done(null, user.id));

passport.deserializeUser(async (id, done) => {
  const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
  done(null, rows[0] || null);
});

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL,
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const email = profile.emails?.[0]?.value;
        const { rows } = await pool.query(
          'SELECT * FROM users WHERE google_id = $1 OR email = $2',
          [profile.id, email]
        );
        let user = rows[0];

        if (!user) {
          // No pre-existing row for this email: admin hasn't invited them yet.
          // Matches the spec — admin adds users first, then they sign in.
          return done(null, false, { message: 'User not invited yet' });
        }

        if (!user.google_id) {
          await pool.query('UPDATE users SET google_id = $1 WHERE id = $2', [
            profile.id,
            user.id,
          ]);
          user.google_id = profile.id;
        }

        done(null, user);
      } catch (err) {
        done(err);
      }
    }
  )
);

export default passport;
