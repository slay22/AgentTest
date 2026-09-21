// Run the agent against real Telegram, locally.
//
//   terminal 1:  npm run dev
//   terminal 2:  npm run telegram:dev
//
// Starts a Cloudflare quick tunnel to the dev server, registers the webhook at
// the tunnel URL, and removes the webhook again on Ctrl-C.
//
// Why a script: a quick tunnel gets a new random hostname every time it starts,
// so the webhook has to be re-registered on every run. Doing that by hand is the
// step that gets forgotten, and a stale webhook looks exactly like a broken agent.
//
// A quick tunnel needs no Cloudflare account and is fine for trying the bot out.
// It is not a production path: the URL is random and public, so the webhook secret
// and the sender allowlist are what actually protect the agent.

import { spawn, type ChildProcess } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Api } from 'grammy';

const ROOT = resolve(import.meta.dirname, '..');
// The BUILT server, not `vite dev`. See assertSafeToExpose below.
const DEV_ORIGIN = process.env.DEV_ORIGIN ?? 'http://localhost:3000';
const WEBHOOK_PATH = '/channels/telegram/webhook';

// Two tunnel modes.
//
// Named (TELEGRAM_TUNNEL_NAME + TELEGRAM_PUBLIC_ORIGIN set): a permanent tunnel
// with a DNS record, so the hostname never changes. Nothing is parsed out of
// cloudflared's output and the URL is known up front.
//
// Quick (neither set): a throwaway trycloudflare.com hostname, read from
// cloudflared's stderr, different on every run.
const TUNNEL_NAME = process.env.TELEGRAM_TUNNEL_NAME;
const PUBLIC_ORIGIN = process.env.TELEGRAM_PUBLIC_ORIGIN;
const NAMED = Boolean(TUNNEL_NAME && PUBLIC_ORIGIN);

function loadEnv(): void {
  let text: string;
  try {
    text = readFileSync(resolve(ROOT, '.env'), 'utf8');
  } catch {
    return;
  }
  for (const line of text.split('\n')) {
    const match = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    process.env[match[1]] ??= match[2].trim().replace(/^["']|["']$/g, '');
  }
}

loadEnv();

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is empty. See the README section on Telegram.`);
  return value;
}

/** The server must be up first, or the tunnel only ever returns 502. */
async function assertServerRunning(): Promise<void> {
  try {
    const response = await fetch(`${DEV_ORIGIN}/healthz`, { signal: AbortSignal.timeout(4000) });
    if (!response.ok) throw new Error(`/healthz returned ${response.status}`);
  } catch (error) {
    throw new Error(
      `Nothing healthy at ${DEV_ORIGIN} (${(error as Error).message}).\n` +
        'Start the agent first, in another terminal:\n' +
        '  npm run build && npm start',
    );
  }
}

/**
 * Refuse to tunnel the Vite dev server.
 *
 * `vite dev` serves the project root, not just the application: /src/**, 
 * package.json, node_modules metadata, and drafts/*.md all came back 200 through
 * a tunnel during testing. Only dotfiles like .env are blocked. The built server
 * serves app.ts's routes and nothing else, which is also what would be deployed.
 *
 * Detected by probing for Vite's dev client rather than by checking the port,
 * because the port is configurable and this must not be fooled by it.
 */
async function assertSafeToExpose(): Promise<void> {
  try {
    const probe = await fetch(`${DEV_ORIGIN}/@vite/client`, {
      signal: AbortSignal.timeout(4000),
    });
    if (probe.ok) {
      throw new Error(
        `${DEV_ORIGIN} is the Vite dev server, which serves the whole project root —\n` +
          'source files, package.json, node_modules, and drafts/*.md are all readable\n' +
          'through a tunnel. Only .env is blocked, which is not enough.\n\n' +
          'Tunnel the built server instead:\n' +
          '  npm run build && npm start          # serves app.ts routes only\n' +
          'or point DEV_ORIGIN at it if it runs elsewhere.',
      );
    }
  } catch (error) {
    if ((error as Error).message.includes('Vite dev server')) throw error;
    // A failed probe means it is not the dev server, which is what we want.
  }
}

/** A permanent tunnel: the hostname comes from DNS, not from cloudflared. */
function startNamedTunnel(name: string): ChildProcess {
  return spawn(
    'cloudflared',
    ['tunnel', 'run', '--url', DEV_ORIGIN, name],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
}

/** cloudflared prints the assigned hostname to stderr, not stdout. */
function startTunnel(): { child: ChildProcess; url: Promise<string> } {
  const child = spawn('cloudflared', ['tunnel', '--url', DEV_ORIGIN, '--no-autoupdate'], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const url = new Promise<string>((resolveUrl, rejectUrl) => {
    const timer = setTimeout(
      () => rejectUrl(new Error('cloudflared did not report a URL within 45s.')),
      45_000,
    );
    let buffered = '';

    const inspect = (chunk: Buffer): void => {
      buffered += chunk.toString();
      const match = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/.exec(buffered);
      if (match) {
        clearTimeout(timer);
        resolveUrl(match[0]);
      }
    };

    child.stdout?.on('data', inspect);
    child.stderr?.on('data', inspect);
    child.on('exit', (code) => {
      clearTimeout(timer);
      rejectUrl(new Error(`cloudflared exited early (code ${code}).`));
    });
  });

  return { child, url };
}

async function main(): Promise<void> {
  const token = required('TELEGRAM_BOT_TOKEN');
  const secret = required('TELEGRAM_WEBHOOK_SECRET_TOKEN');
  if (!/^[A-Za-z0-9_-]+$/.test(secret)) {
    throw new Error('TELEGRAM_WEBHOOK_SECRET_TOKEN may contain only letters, numbers, _ and -.');
  }

  await assertServerRunning();
  await assertSafeToExpose();
  const api = new Api(token);
  const me = await api.getMe();

  console.log(`bot:    @${me.username ?? '(no username)'}`);
  console.log(`local:  ${DEV_ORIGIN}`);

  let child: ChildProcess;
  let origin: string;

  if (NAMED) {
    console.log(`tunnel: ${TUNNEL_NAME} (named, stable hostname)`);
    child = startNamedTunnel(TUNNEL_NAME!);
    // The connection takes a moment to register; the hostname itself is fixed.
    await new Promise((r) => setTimeout(r, 6000));
    origin = PUBLIC_ORIGIN!.replace(/\/$/, '');
  } else {
    console.log('tunnel: starting a quick tunnel...');
    const quick = startTunnel();
    child = quick.child;
    origin = await quick.url;
  }

  const webhookUrl = `${origin}${WEBHOOK_PATH}`;

  await api.setWebhook(webhookUrl, {
    secret_token: secret,
    allowed_updates: ['message', 'edited_message', 'callback_query'],
  });

  console.log(`tunnel: ${origin}`);
  console.log(`hook:   ${webhookUrl}`);
  console.log('');

  const allowed = (process.env.TELEGRAM_ALLOWED_USER_IDS ?? '').trim();
  if (!allowed) {
    console.log('TELEGRAM_ALLOWED_USER_IDS is empty, so nobody is allowed yet.');
    console.log('Message the bot now and watch this terminal: the rejection line');
    console.log('prints your own fromId. Put that number in .env, restart, and');
    console.log('message again.');
  } else {
    console.log(`allowed senders: ${allowed}`);
    console.log('Message the bot.');
  }
  console.log('\nCtrl-C to stop and remove the webhook.');

  const shutdown = async (): Promise<void> => {
    console.log('\nremoving webhook...');
    try {
      await api.deleteWebhook();
    } catch (error) {
      console.warn(`could not remove the webhook: ${(error as Error).message}`);
    }
    child.kill('SIGTERM');
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

try {
  await main();
} catch (error) {
  console.error(`\n${(error as Error).message}\n`);
  process.exit(1);
}
