import { defineTool } from '@flue/runtime';
import type { TelegramConversationRef } from '@flue/telegram';
import * as v from 'valibot';
import { telegramApi } from './telegram-client.ts';

// The agent's side of Telegram: the reply tool and the creation-data schema.
//
// Importing this must stay free of ingress configuration, because the agent is
// also run directly (`flue run`) where no Telegram webhook exists. The webhook
// itself lives in ./telegram.ts.

/**
 * Instance-creation data schema for the agent's `initialData` static.
 *
 * `chatTitle` is a Telegram group title, not the blog's title.
 */
export const telegramInitialData = v.variant('type', [
  v.object({
    type: v.literal('chat'),
    chatId: v.number(),
    messageThreadId: v.optional(v.number()),
    directMessagesTopicId: v.optional(v.number()),
    chatTitle: v.optional(v.string()),
  }),
  v.object({
    type: v.literal('business-chat'),
    businessConnectionId: v.string(),
    chatId: v.number(),
    messageThreadId: v.optional(v.number()),
    directMessagesTopicId: v.optional(v.number()),
    chatTitle: v.optional(v.string()),
  }),
]);

export interface ReplyRejection {
  reason: string;
  detail: string;
}

/**
 * Reject a reply the user could not act on.
 *
 * A file path is not a link, and Telegram linkifies one into a fake domain:
 * `drafts/post.md` becomes https://post.md/, which serves nothing. That is exactly
 * what happened on a real run — the model reported the path faithfully and had
 * simply not called preview_draft, so the prompt was not enough.
 *
 * Kept as a pure function of the text rather than inline in the tool, so the policy
 * is testable without a Telegram token or a network call.
 */
export function rejectReply(text: string): ReplyRejection | null {
  const namesADraft = /(?:^|[\s(])(?:\/)?drafts\/[\w.-]+\.md\b/.test(text);
  const givesAUrl = /https?:\/\/\S+/.test(text);
  if (!namesADraft || givesAUrl) return null;

  return {
    reason: 'path_instead_of_link',
    detail:
      'This message names a draft file but gives no URL the user can open, and Telegram turns a bare path into a link to something that does not exist. Call preview_draft with that draft path, then send the URL it returns. If the preview cannot be saved, describe the draft without naming the file path.',
  };
}

/**
 * Post into the Telegram conversation bound to this agent.
 *
 * Trusted code binds the chat — the model chooses the text, never the
 * destination. Telegram rejects messages over 4096 characters, so anything
 * oversized is refused here with an actionable message rather than left to fail
 * opaquely at the API.
 */
export function postMessage(ref: TelegramConversationRef) {
  return defineTool({
    name: 'post_telegram_message',
    description:
      'Post a message into the Telegram conversation bound to this agent. The destination is fixed; you choose only the text. Keep it short: Telegram rejects messages over 4096 characters, so summarise and link to the draft preview or published post rather than pasting the text.',
    input: v.object({ text: v.pipe(v.string(), v.minLength(1)) }),
    async run({ data }) {
      const rejection = rejectReply(data.text);
      if (rejection) return { output: { posted: false, ...rejection } };

      if (data.text.length > 4096) {
        return {
          output: {
            posted: false,
            reason: 'too_long',
            detail: `Telegram rejects messages over 4096 characters and this one is ${data.text.length}. Send a short summary plus a link instead.`,
          },
        };
      }

      const message = await telegramApi().sendMessage(ref.chatId, data.text, {
        ...(ref.type === 'business-chat'
          ? { business_connection_id: ref.businessConnectionId }
          : {}),
        ...(ref.messageThreadId ? { message_thread_id: ref.messageThreadId } : {}),
        ...(ref.directMessagesTopicId
          ? { direct_messages_topic_id: ref.directMessagesTopicId }
          : {}),
      });
      return { output: { posted: true, messageId: message.message_id } };
    },
  });
}
