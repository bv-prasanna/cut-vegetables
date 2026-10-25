import { serve } from '@hono/node-server';
import { createApp } from './app.js';
// Never expose unprotected developer endpoints on a public interface.
const port = Number(process.env.PORT || 3000);
serve({ fetch: createApp().fetch, port, hostname: '127.0.0.1' });
console.log(`FreshPrep LOCAL-ONLY development API at http://127.0.0.1:${port}`);
