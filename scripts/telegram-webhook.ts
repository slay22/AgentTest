// Manage the Telegram webhook. Run with `npm run telegram`.
//
//   npm run telegram -- whoami        # verify the bot token and show the bot
//   npm run telegram -- info          # what Telegram currently has registered
//   npm run telegram -- set <origin>  # register the webhook against <origin>
//   npm run telegram -- delete        # stop deliveries
//
// Registering is a one-time call and it needs the bot token, so this reads the
// project `.env` the same way `vite dev` does. Telegram will only deliver to a
// public HTTPS URL, so `<origin>` is the tunnel or deployment, not localhost.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Api } from 'grammy';

const ROOT = resolve(import.meta.dirname, '..');

/** Minimal .env reader — Flue loads it for the app, but this script is standalone. */
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
    const value = match[2].trim().replace(/^["']|["']$/g, '');
    // Shell-exported values win, matching Flue's own precedence.
    process.env[match[1]] ??= value;
  }
}

loadEnv();

function token(): string {
  const value = process.env.TELEGRAM_BOT_TOKEN;
  if (!value) {
    throw new Error(
      'TELEGRAM_BOT_TOKEN is empty. Create a bot with @BotFather in Telegram, then put its token in .env.',
    );
  }
  return value;
}

function secret(): string {
  const value = process.env.TELEGRAM_WEBHOOK_SECRET_TOKEN;
  if (!value) {
    throw new Error('TELEGRAM_WEBHOOK_SECRET_TOKEN is empty. Generate one into .env first.');
  }
  // Telegram rejects anything outside this set, and the value must not be shared
  // between bots: it is the entire authentication of the webhook.
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error(
      'TELEGRAM_WEBHOOK_SECRET_TOKEN may contain only letters, numbers, underscores and hyphens.',
    );
  }
  return value;
}

const WEBHOOK_PATH = '/channels/telegram/webhook';

/** Update families the agent actually handles. */
const ALLOWED_UPDATES = ['message', 'edited_message', 'callback_query'];

async function main(): Promise<void> {
  const [command, argument] = process.argv.slice(2);
  const api = new Api(token());

  switch (command) {
    case 'whoami': {
      // Also the cheapest way to prove the token is valid before anything else.
      const me = await api.getMe();
      console.log(`bot:      @${me.username ?? '(no username)'}  (id ${me.id})`);
      console.log(`name:     ${me.first_name}`);
      console.log(`can join groups: ${me.can_join_groups ?? 'unknown'}`);
      console.log(`reads all group messages: ${me.can_read_all_group_messages ?? 'unknown'}`);
      break;
    }

    case 'info': {
      const info = await api.getWebhookInfo();
      console.log(`url:                  ${info.url || '(none registered)'}`);
      console.log(`pending updates:      ${info.pending_update_count}`);
      console.log(`last error:           ${info.last_error_message ?? '(none)'}`);
      console.log(`last error at:        ${info.last_error_date ? new Date(info.last_error_date * 1000).toISOString() : '(never)'}`);
      if (info.last_error_message) {
        console.log('\nA last error usually means Telegram could not reach the URL, or the');
        console.log('secret token changed. Re-run `set` after fixing it.');
      }
      break;
    }

    case 'set': {
      if (!argument) throw new Error('Usage: npm run telegram -- set https://<public-origin>');
      if (!argument.startsWith('https://')) {
        throw new Error('Telegram only delivers to a public HTTPS URL.');
      }
      if (/localhost|127\.0\.0\.1/.test(argument)) {
        throw new Error(
          'localhost cannot receive Telegram deliveries. Use the tunnel or deployment URL.',
        );
      }

      const url = `${argument.replace(/\/$/, '')}${WEBHOOK_PATH}`;
      await api.setWebhook(url, { secret_token: secret(), allowed_updates: ALLOWED_UPDATES });
      console.log(`registered: ${url}`);
      console.log(`allowed updates: ${ALLOWED_UPDATES.join(', ')}`);

      const check = await api.getWebhookInfo();
      console.log(`telegram confirms: ${check.url}`);
      break;
    }

    case 'delete': {
      await api.deleteWebhook();
      console.log('webhook removed; the bot will no longer deliver anything.');
      break;
    }

    default:
      console.log(`Usage: npm run telegram -- <command>

  whoami        verify the bot token and print the bot
  info          show what Telegram has registered, including the last error
  set <origin>  register ${WEBHOOK_PATH} against <origin>
  delete        stop deliveries

Note: webhook delivery and getUpdates polling are mutually exclusive, so
registering a webhook disables polling permanently. That is intended here.`);
  }
}

try {
  await main();
} catch (error) {
  console.error(`\n${(error as Error).message}\n`);
  process.exit(1);
}
