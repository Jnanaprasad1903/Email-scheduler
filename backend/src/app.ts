import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { router } from './routes/index.js';
import { errorHandler } from './middleware/errorHandler.js';

const app = express();

// Security headers
app.use(helmet());

// CORS — frontend dev server (Vite default port 5173)
app.use(
  cors({
    origin: process.env['CORS_ORIGIN'] ?? 'http://localhost:5173',
    credentials: true,
  }),
);

// Parse JSON request bodies
app.use(express.json());

// All API routes under /api
app.use('/api', router);

// Central error handler — must be last
app.use(errorHandler);

export { app };
