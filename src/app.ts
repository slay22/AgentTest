import { Hono } from 'hono';
import { channel as telegram } from './channels/telegram.ts';

// The application's route map. Every HTTP surface is mounted here explicitly;
// nothing is generated from filenames.
//
// Note what is NOT mounted: BloggerAgent. An agent is registered by its module's
// 'use agent' directive, and that registration is all `dispatch(...)` needs, so
// the agent stays reachable from Telegram without a public HTTP route of its own.
// Mounting it with createAgentRouter would expose every conversation to anyone
// who can reach this server, which is not wanted while it runs on a laptop.

const app = new Hono();

app.route('/channels/telegram', telegram.route());

app.get('/healthz', (c) => c.json({ ok: true }));

export default app;
