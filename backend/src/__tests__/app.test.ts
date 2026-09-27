import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../app.js';

describe('App Integration Tests', () => {
  describe('GET /api/health', () => {
    it('should return a 200 OK and status ok', async () => {
      const response = await request(app).get('/api/health');
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'ok');
      expect(response.body).toHaveProperty('timestamp');
    });
  });

  describe('Authentication Endpoints', () => {
    it('should reject unauthenticated access to protected routes', async () => {
      // /api/auth/me is protected by requireAuth
      const response = await request(app).get('/api/auth/me');
      
      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error', 'Unauthorized: No token provided');
    });

    it('should require email and password for registration', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({ email: 'test@example.com' }); // missing password
        
      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Email and password are required');
    });
  });

  describe('404 Handling', () => {
    it('should return 404 for unknown API routes', async () => {
      const response = await request(app).get('/api/unknown-route-123');
      expect(response.status).toBe(404);
    });
  });
});
