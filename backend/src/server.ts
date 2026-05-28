import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { analyticsRouter } from './routes/analytics.route.js';
import { chatRouter } from './routes/chat.route.js';
import { dashboardRouter } from './routes/dashboard.routes.js';
import { metaRouter } from './routes/meta.routes.js';
import { platformConnectionsRouter } from './routes/platform-connections.route.js';
import { syncRouter } from './routes/sync.routes.js';
import { brainRouter } from './routes/brain.routes.js';
import { reportRouter } from './routes/report.routes.js';
import { startMetaSyncJob, initializeMetaConnectionFromEnv } from './jobs/meta.sync.job.js';
import { setIo } from './services/realtime.service.js';

// Setup global error and promise rejection handlers to protect process stability
process.on('unhandledRejection', (reason, promise) => {
  console.error('⚠️ [CRITICAL] Unhandled Promise Rejection detected:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('⚠️ [CRITICAL] Uncaught Exception detected:', error);
});


const app = express();
const port = Number(process.env.PORT || 3000);
const frontendOrigin = process.env.CORS_ORIGIN || process.env.FRONTEND_URL || 'http://localhost:5173';
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: frontendOrigin,
  },
});

setIo(io);

io.on('connection', socket => {
  const tenantId = String(socket.handshake.query.tenantId || '');
  if (tenantId) {
    socket.join(tenantId);
  }
});

app.use(cors({ origin: frontendOrigin }));
app.use(express.json({ limit: '1mb' }));

app.get('/', (_req, res) => {
  res.json({
    name: 'MIP backend',
    ok: true,
    apiBase: '/api/v1',
    health: '/health',
    routes: [
      'GET /api/v1/clients',
      'GET /api/v1/campaigns',
      'GET /api/v1/analytics/spend-trend',
      'POST /api/v1/chat',
      'GET /api/v1/platform-connections',
      'POST /api/v1/platform-connections',
    ],
  });
});

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/api/v1', (_req, res) => {
  res.json({
    ok: true,
    message: 'MIP API v1 is running',
  });
});

app.use('/api/v1', analyticsRouter);
app.use('/api/v1', chatRouter);
app.use('/api/v1', dashboardRouter);
app.use('/api/v1', metaRouter);
app.use('/api/v1', platformConnectionsRouter);
app.use('/api/v1', syncRouter);
app.use('/api/v1', brainRouter);
app.use('/api/v1', reportRouter);

app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  res.status(500).json({
    error: error.message || 'Internal server error',
  });
});

initializeMetaConnectionFromEnv();
startMetaSyncJob();

httpServer.listen(port, () => {
  console.log(`MIP backend listening on http://localhost:${port}`);
});
