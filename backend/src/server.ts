import 'dotenv/config';
import { app } from './app.js';
import { startOutboxDispatcher } from './workers/outboxDispatcher.js';
import './workers/emailWorker.js';

const PORT = Number(process.env['PORT'] ?? 3000);

app.listen(PORT, () => {
  console.log(`[server] Listening on http://localhost:${PORT}`);
  console.log(`[server] Health: http://localhost:${PORT}/api/health`);
  console.log(`[server] Email worker started`);
  
  // Start the transactional outbox dispatcher process
  startOutboxDispatcher().catch(console.error);
});
