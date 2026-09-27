import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import jwt from 'jsonwebtoken';
import { prisma } from '../db/prisma.js';

const JWT_SECRET = process.env['JWT_SECRET'] || 'fallback-secret-for-dev-only-do-not-use-in-prod';
const GOOGLE_CLIENT_ID = process.env['GOOGLE_CLIENT_ID'] || 'mock-client-id';
const GOOGLE_CLIENT_SECRET = process.env['GOOGLE_CLIENT_SECRET'] || 'mock-client-secret';
const BACKEND_URL = process.env['BACKEND_URL'] || 'http://localhost:3000';

passport.use(
  new GoogleStrategy(
    {
      clientID: GOOGLE_CLIENT_ID,
      clientSecret: GOOGLE_CLIENT_SECRET,
      callbackURL: `${BACKEND_URL}/api/auth/google/callback`,
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const email = profile.emails?.[0]?.value;
        if (!email) {
          return done(new Error('No email found from Google profile'));
        }

        const name = profile.displayName;
        const avatarUrl = profile.photos?.[0]?.value;
        const googleSubject = profile.id;

        // Upsert user
        const user = await prisma.user.upsert({
          where: { googleSubject },
          update: {
            name,
            avatarUrl,
            // If they signed in with the same Google account but a new email, update email
            email, 
          },
          create: {
            googleSubject,
            email,
            name,
            avatarUrl,
          },
        });

        return done(null, user);
      } catch (err) {
        return done(err as Error);
      }
    }
  )
);

export const generateToken = (userId: string): string => {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '7d' });
};

export const verifyToken = (token: string): { userId: string } => {
  return jwt.verify(token, JWT_SECRET) as { userId: string };
};

export { passport };
