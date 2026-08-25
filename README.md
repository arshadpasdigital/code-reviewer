# review-rabbit-clone

## Local setup

Copy `.example.env` to `.env` and provide the GitHub App, OpenAI, and PostgreSQL values. Start PostgreSQL, apply the schema, then run the server:

```sh
bun install
docker compose up -d db
bun run migrate
bun run dev
```

The GitHub App webhook endpoint is `/webhooks/github`. Subscribe the app to `pull_request` and `check_run` events, and grant Checks write, Contents read/write, Pull requests read/write, and Metadata read permissions.

The validation runner requires Docker. It downloads the pull-request archive, runs JavaScript/TypeScript install, typecheck, and test commands in a constrained container, then destroys the workspace. Public fork branches receive a patch comment instead of an automatic commit.

To install dependencies:

```bash
bun install
```

To run:

```bash
bun run index.ts
```

This project was created using `bun init` in bun v1.3.14. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.
