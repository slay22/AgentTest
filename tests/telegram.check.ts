// The Telegram channel's authorization boundary.
//
// A Telegram bot is publicly messageable: anyone who finds it can send it
// messages. This agent also has a shell on the host, so an allowlist that fails
// open would hand a stranger a remote shell. These tests exist to keep it failing
// closed.
//
// Run with `npm run check:telegram`.

import { allowedUserIds, isAllowedSender, refusalReason } from '../src/channels/telegram-client.ts';
import { postMessage } from '../src/channels/telegram-reply.ts';

let failures = 0;
function check(name: string, ok: boolean, detail = ''): void {
  console.log(`${ok ? 'pass' : 'FAIL'}  ${name}${ok || !detail ? '' : `  -> ${detail}`}`);
  if (!ok) failures++;
}

const env = (values: Record<string, string | undefined>): NodeJS.ProcessEnv =>
  values as NodeJS.ProcessEnv;

// --- the critical property: fail closed ---------------------------------
{
  check('an unset allowlist allows nobody', !isAllowedSender(123, env({})));
  check('an empty allowlist allows nobody', !isAllowedSender(123, env({ TELEGRAM_ALLOWED_USER_IDS: '' })));
  check(
    'a whitespace-only allowlist allows nobody',
    !isAllowedSender(123, env({ TELEGRAM_ALLOWED_USER_IDS: '  ,  ' })),
  );
  check('no sender id is never allowed', !isAllowedSender(undefined, env({ TELEGRAM_ALLOWED_USER_IDS: '123' })));
  check(
    'the refusal reason says why when nobody is allowed',
    refusalReason(env({})).includes('nobody is allowed'),
    refusalReason(env({})),
  );
}

// --- parsing ------------------------------------------------------------
{
  check(
    'comma-separated ids are parsed and trimmed',
    allowedUserIds(env({ TELEGRAM_ALLOWED_USER_IDS: ' 111 , 222,333 ' })).join(',') === '111,222,333',
    allowedUserIds(env({ TELEGRAM_ALLOWED_USER_IDS: ' 111 , 222,333 ' })).join(','),
  );
  check('a single id works', allowedUserIds(env({ TELEGRAM_ALLOWED_USER_IDS: '999' })).length === 1);
  check(
    'trailing commas do not create empty entries',
    allowedUserIds(env({ TELEGRAM_ALLOWED_USER_IDS: '111,,' })).join(',') === '111',
  );
}

// --- allowing the right people, and only them ---------------------------
{
  const e = env({ TELEGRAM_ALLOWED_USER_IDS: '111,222' });
  check('a listed user is allowed', isAllowedSender(111, e));
  check('another listed user is allowed', isAllowedSender(222, e));
  check('an unlisted user is refused', !isAllowedSender(333, e));
  check('a prefix of a listed id is refused', !isAllowedSender(11, e));
  check('a longer id is refused', !isAllowedSender(1111, e));
  check('a negative id is refused', !isAllowedSender(-111, e));
  check(
    'the refusal reason distinguishes not-listed from empty',
    refusalReason(e).includes('not in'),
    refusalReason(e),
  );
}

// --- the reply tool refuses what Telegram would reject ------------------
{
  const ref = { type: 'chat' as const, chatId: 1 };
  const tool = postMessage(ref) as unknown as {
    run: (context: { data: { text: string } }) => Promise<{ output?: unknown }>;
  };

  // Over the Bot API limit, so this returns before any network call — the guard
  // is the point, and it should not need a Telegram token to test.
  const long = await tool.run({ data: { text: 'x'.repeat(4097) } });
  const output = long.output as { posted: boolean; reason: string; detail: string };
  check('an oversized reply is refused, not sent', output.posted === false);
  check('the refusal names the reason', output.reason === 'too_long', output.reason);
  check('the refusal is actionable', output.detail.includes('4096') && output.detail.includes('summary'));
}

console.log(failures === 0 ? '\nall checks passed' : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
