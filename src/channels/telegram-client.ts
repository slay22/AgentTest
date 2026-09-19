import { Api } from 'grammy';

// The grammY client and sender authorization, kept apart from the webhook
// ingress so importing the *reply* tool does not drag in channel configuration
// and validation. `createTelegramChannel` validates its secret token at module
// load, so a module-scope channel would break `flue run` on a checkout with no
// Telegram credentials.

let cachedClient: Api | undefined;

/** Created on first use, so importing this needs no Telegram configuration. */
export function telegramApi(): Api {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    throw new Error(
      'TELEGRAM_BOT_TOKEN is not set. Ask the user to add it to .env before the agent replies on Telegram.',
    );
  }
  cachedClient ??= new Api(token);
  return cachedClient;
}

/**
 * Telegram user ids allowed to talk to this agent.
 *
 * Empty means **nobody**, not everybody. A Telegram bot is publicly messageable
 * — anyone who finds it can send messages — and this agent can run shell commands
 * on the host, so an unconfigured allowlist has to fail closed or the bot becomes
 * a remote shell for whoever finds it.
 */
export function allowedUserIds(env: NodeJS.ProcessEnv = process.env): string[] {
  return (env.TELEGRAM_ALLOWED_USER_IDS ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
}

export function isAllowedSender(
  userId: number | undefined,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (userId === undefined) return false;
  return allowedUserIds(env).includes(String(userId));
}

/** Why a sender was refused, for the log line. */
export function refusalReason(env: NodeJS.ProcessEnv = process.env): string {
  return allowedUserIds(env).length === 0
    ? 'TELEGRAM_ALLOWED_USER_IDS is empty, so nobody is allowed'
    : 'sender is not in TELEGRAM_ALLOWED_USER_IDS';
}
