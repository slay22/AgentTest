// flue-blueprint: channel/telegram@1
//
// Verified Telegram webhook ingress. The agent's reply tool lives in
// ./telegram-reply.ts so that importing it does not pull in this module's
// configuration — `createTelegramChannel` validates its secret token at module
// load, and the agent also runs without Telegram via `flue run`.
//
// One deliberate addition to the blueprint: a sender allowlist, checked before
// dispatch. A Telegram bot is publicly messageable, so without it anyone who
// finds the bot can talk to an agent that has a shell on the host.

import { createTelegramChannel, type TelegramConversationRef } from '@flue/telegram';
import { dispatch } from '@flue/runtime';
import type { Message } from 'grammy/types';
import { BloggerAgent } from '../agents/blogger-agent.ts';
import { isAllowedSender, refusalReason, telegramApi } from './telegram-client.ts';

export const channel = createTelegramChannel({
  secretToken: process.env.TELEGRAM_WEBHOOK_SECRET_TOKEN!,

  // Path: /channels/telegram/webhook
  async webhook({ update }) {
    const incoming = update.message ?? update.channel_post ?? update.business_message;
    if (incoming) {
      // Refuse before dispatch, and acknowledge rather than error: a non-200 would
      // make Telegram retry a message we are never going to accept. Blocking here
      // means the agent never runs, so no tool — including the shell — is reached.
      if (!isAllowedSender(incoming.from?.id)) {
        console.warn('telegram_sender_rejected', {
          fromId: incoming.from?.id,
          chatId: incoming.chat.id,
          reason: refusalReason(),
        });
        return;
      }

      const conversation = conversationFromMessage(incoming);
      await dispatch(BloggerAgent, {
        id: channel.instanceId(conversation),
        // Recorded once when this event creates the instance; ignored after.
        initialData: conversationData(conversation, incoming),
        // Telegram retries unsuccessful deliveries, so the update id names the
        // delivery and a redelivery converges instead of running a second turn.
        idempotencyKey: String(update.update_id),
        message: {
          kind: 'signal',
          type: 'telegram.message',
          body: messageBody(incoming),
          attributes: { updateId: String(update.update_id) },
        },
      });
      return;
    }

    if (update.callback_query) {
      const query = update.callback_query;
      // Callback queries are the approval path, so they get the same check.
      if (!isAllowedSender(query.from.id)) {
        await telegramApi().answerCallbackQuery(query.id, { text: 'Not authorized.' });
        console.warn('telegram_callback_rejected', {
          fromId: query.from.id,
          reason: refusalReason(),
        });
        return;
      }

      await telegramApi().answerCallbackQuery(query.id);
      if (!query.message) return;

      const conversation = conversationFromMessage(query.message);
      await dispatch(BloggerAgent, {
        id: channel.instanceId(conversation),
        initialData: conversationData(conversation, query.message),
        idempotencyKey: String(update.update_id),
        message: {
          kind: 'signal',
          type: 'telegram.callback_query',
          body: query.data ?? '',
          attributes: {
            updateId: String(update.update_id),
            fromId: String(query.from.id),
            ...(query.from.username === undefined ? {} : { fromUsername: query.from.username }),
          },
        },
      });
      return;
    }
  },
});

/** Message text, or a short placeholder describing a media-only message. */
function messageBody(message: Message): string {
  if (message.text !== undefined) return message.text;
  if (message.caption !== undefined) return message.caption;
  if (message.photo) return '[photo message]';
  if (message.video) return '[video message]';
  if (message.voice) return '[voice message]';
  if (message.document) return '[document message]';
  if (message.sticker) return '[sticker message]';
  return '[non-text message]';
}

/** Build the canonical destination identity from a native Telegram Message. */
function conversationFromMessage(message: Message): TelegramConversationRef {
  const topic = {
    ...(message.message_thread_id === undefined
      ? {}
      : { messageThreadId: message.message_thread_id }),
    ...(message.direct_messages_topic?.topic_id === undefined
      ? {}
      : { directMessagesTopicId: message.direct_messages_topic.topic_id }),
  };
  return message.business_connection_id
    ? {
        type: 'business-chat',
        businessConnectionId: message.business_connection_id,
        chatId: message.chat.id,
        ...topic,
      }
    : { type: 'chat', chatId: message.chat.id, ...topic };
}

/** Instance-creation data: the destination ref plus small instance-constant context. */
function conversationData(conversation: TelegramConversationRef, message: Message) {
  return {
    type: conversation.type,
    chatId: conversation.chatId,
    ...(conversation.type === 'business-chat'
      ? { businessConnectionId: conversation.businessConnectionId }
      : {}),
    ...(conversation.messageThreadId === undefined
      ? {}
      : { messageThreadId: conversation.messageThreadId }),
    ...(conversation.directMessagesTopicId === undefined
      ? {}
      : { directMessagesTopicId: conversation.directMessagesTopicId }),
    ...(message.chat.title === undefined ? {} : { chatTitle: message.chat.title }),
  };
}
