import 'dotenv/config';

// Clear proxy environment variables to bypass misconfigured local developer proxies (e.g., loopbacks to port 9)
delete process.env.http_proxy;
delete process.env.HTTP_PROXY;
delete process.env.https_proxy;
delete process.env.HTTPS_PROXY;

import cors from 'cors';
import cron from 'node-cron';
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
import { googleRouter } from './routes/google.route.js';
import { mailRouter } from './routes/mail.routes.js';
import { startMetaSyncJob, initializeMetaConnectionFromEnv } from './jobs/meta.sync.job.js';
import { setIo } from './services/realtime.service.js';
import { exportAgentDataSnapshotsForTenant } from './services/ai-brain.service.js';

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

app.use(cors({ origin: true }));
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
app.use('/api/v1', googleRouter);
app.use('/api/v1', platformConnectionsRouter);
app.use('/api/v1', syncRouter);
app.use('/api/v1', brainRouter);
app.use('/api/v1', reportRouter);
app.use('/api/v1', mailRouter);

app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  res.status(500).json({
    error: error.message || 'Internal server error',
  });
});

initializeMetaConnectionFromEnv();
startMetaSyncJob();

function refreshAgentSnapshot() {
  void exportAgentDataSnapshotsForTenant('agency')
    .then(snapshots => {
      console.log('[AgentSnapshot] scheduled refresh complete', {
        count: snapshots.length,
        snapshots: snapshots.map(snapshot => ({
          tenantId: snapshot.tenantId,
          clientId: snapshot.clientId,
          rows: snapshot.rows,
          mdPath: snapshot.mdPath,
        })),
      });
    })
    .catch(error => {
      console.error('[AgentSnapshot] scheduled refresh failed:', error);
    });
}

cron.schedule('*/30 * * * *', refreshAgentSnapshot);
refreshAgentSnapshot();

httpServer.listen(port, '0.0.0.0', () => {
  console.log(`MIP backend listening on 0.0.0.0:${port}`);
});

export { app };
