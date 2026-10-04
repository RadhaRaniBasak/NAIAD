/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Naiad Modular Monolith Server Entry Point
 * Serves the API (src/api.ts) and the frontend on one port: Vite middleware in development,
 * the built static files in production. Handles graceful shutdown for zero-downtime deploys.
 */

import express from 'express';
import path from 'node:path';
import { createApp } from './src/api.ts';
import { env } from './src/config/env.ts';
import { initServerSentry } from './src/services/sentry.server.ts';

const ROOT_DIR = import.meta.dirname;
const PORT = env.PORT;
const isProd = env.NODE_ENV === 'production';
let isShuttingDown = false;

async function startServer() {
  initServerSentry();

  const app = createApp({ isShuttingDown: () => isShuttingDown });

  // ----------------------------------------------------
  // Frontend: Vite dev middleware, or the static production build
  // ----------------------------------------------------
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // 1-year immutable cache for content-hashed assets
    app.use('/assets', express.static(path.resolve(ROOT_DIR, 'dist/assets'), {
      maxAge: '1y',
      immutable: true,
    }));

    // Static files with revalidation on HTML
    app.use(express.static(path.resolve(ROOT_DIR, 'dist'), {
      maxAge: 0,
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html')) {
          res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
        }
      },
    }));

    app.get('*', (_req, res) => {
      res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
      res.sendFile(path.resolve(ROOT_DIR, 'dist', 'index.html'));
    });
  }

  // ----------------------------------------------------
  // Server Lifecycle & Graceful Shutdown
  // ----------------------------------------------------
  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Naiad modular monolith server running at http://0.0.0.0:${PORT} [${env.NODE_ENV}]`);
    console.log(`🩺 Health check endpoint: http://0.0.0.0:${PORT}/api/health`);
  });

  const handleShutdown = (signal: string) => {
    console.log(`\n🛑 Received ${signal}. Starting graceful shutdown...`);
    isShuttingDown = true;

    // Stop accepting new connections
    server.close((err) => {
      if (err) {
        console.error('Error during HTTP server shutdown:', err);
        process.exit(1);
      }
      console.log('✅ HTTP server closed. In-flight requests completed.');
      console.log('👋 Clean graceful shutdown complete. Exiting.');
      process.exit(0);
    });

    // Force exit if hanging connections persist beyond 10 seconds
    setTimeout(() => {
      console.error('⚠️ Graceful shutdown timeout (10s) expired. Forcing process exit.');
      process.exit(1);
    }, 10000).unref();
  };

  process.on('SIGTERM', () => handleShutdown('SIGTERM'));
  process.on('SIGINT', () => handleShutdown('SIGINT'));
}

startServer().catch((err) => {
  console.error('Fatal error starting Naiad server:', err);
  process.exit(1);
});
