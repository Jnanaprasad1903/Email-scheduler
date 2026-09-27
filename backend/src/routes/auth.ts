import { Router } from 'express';
import { passport, generateToken } from '../lib/auth.js';
import { requireAuth } from '../middleware/auth.js';

export const authRouter = Router();

// 1. Initiate Google OAuth
authRouter.get(
  '/google',
  passport.authenticate('google', {
    scope: ['profile', 'email'],
  })
);

// 2. Google OAuth Callback
authRouter.get(
  '/google/callback',
  passport.authenticate('google', { session: false, failureRedirect: '/login?error=true' }),
  (req, res) => {
    // Cast req.user to our Prisma user shape
    const user = req.user as any; 
    
    // Generate JWT
    const token = generateToken(user.id);
    
    // Set HTTP-only cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    // Redirect to frontend dashboard
    const frontendUrl = process.env['FRONTEND_URL'] || 'http://localhost:5173';
    res.redirect(`${frontendUrl}/dashboard`);
  }
);

// 3. Get current logged-in user info
authRouter.get('/me', requireAuth, (req, res) => {
  // requireAuth attached res.locals.user
  res.json({ user: res.locals['user'] });
});

// 4. Logout
authRouter.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ success: true });
});
