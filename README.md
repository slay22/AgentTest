# agenttest

A [Flue](https://flueframework.com) agent project.

## Setup

```sh
npm install
```

Then add a model provider API key to `.env` (any [provider Pi supports](https://pi.dev/docs/latest/providers#api-keys)).

## Talk to your agent

```sh
npx flue run src/agents/blogger-agent.ts --message "Write a short post about my weekend hike"
```

Conversations are durable — pass `--id <id>` to continue one. Before publishing posts, set `BLOG_PUBLISH_DIR` in `.env` to the folder where your site's posts live.

## Learn more

- [Flue docs](https://flueframework.com/docs/) — or `npx flue docs` from the terminal.
