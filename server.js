/**
 * Production server wrapper with graceful shutdown handling
 * This wraps the SvelteKit build to properly handle PM2 signals
 */

import { handler } from './build/handler.js';
import http from 'http';

const host = process.env.HOST || '0.0.0.0';
const port = process.env.PORT || 3000;

const server = http.createServer(handler);

// Track active connections for graceful shutdown
let connections = new Set();

server.on('connection', (conn) => {
  connections.add(conn);
  conn.on('close', () => connections.delete(conn));
});

// Start server
server.listen({ host, port }, () => {
  console.log(`Listening on ${host}:${port}`);

  // Signal PM2 that we're ready (if using wait_ready: true)
  if (process.send) {
    process.send('ready');
  }
});

// Graceful shutdown handler
function gracefulShutdown(signal) {
  console.log(`Received ${signal}, starting graceful shutdown...`);

  // Stop accepting new connections
  server.close((err) => {
    if (err) {
      console.error('Error during server close:', err);
      process.exit(1);
    }
    console.log('Server closed successfully');
    process.exit(0);
  });

  // Force close existing connections after timeout
  setTimeout(() => {
    console.log(`Forcing ${connections.size} connections closed`);
    connections.forEach((conn) => conn.destroy());
  }, 4000); // 4 seconds before force close

  // Final safety exit
  setTimeout(() => {
    console.error('Graceful shutdown timed out, forcing exit');
    process.exit(1);
  }, 5000);
}

// Handle shutdown signals from PM2
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught errors
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
