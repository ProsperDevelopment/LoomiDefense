// ============================================================
// Server entry point: Express REST API + WebSocket lobby.
// Run with: npm run server  (tsx server/index.ts)
// ============================================================
import { createServer } from 'node:http';
import { app } from './api';
import { attachLobbyServer } from './lobby';

const PORT = Number(process.env.PORT ?? 4000);

const server = createServer(app);
const wss = attachLobbyServer(server);

// The ws library re-emits HTTP server errors on the WebSocketServer.
// Without a listener Node throws an unhandled 'error' event, which would
// bypass the friendly message below.
wss.on('error', () => {
  // Already reported by the server 'error' handler.
});

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(
      `\nPort ${PORT} is already in use.\n` +
      `Another game server is probably already running — try http://localhost:${PORT}\n` +
      `or stop the other process and run: npm run server\n`,
    );
  } else {
    console.error('Server error:', err);
  }
  process.exit(1);
});

server.listen(PORT, () => {
  console.log(`LoomiDefense server listening on http://localhost:${PORT}`);
  console.log(`  REST:  http://localhost:${PORT}/api/...`);
  console.log(`  Lobby: ws://localhost:${PORT}/ws`);
});
