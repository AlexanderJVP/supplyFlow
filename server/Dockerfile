FROM node:22-bookworm-slim

WORKDIR /workspace

RUN corepack enable
ENV HUSKY=0

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY client/package.json client/package.json
COPY server/package.json server/package.json
COPY packages/shared/package.json packages/shared/package.json

RUN pnpm install --frozen-lockfile

COPY . .

EXPOSE 8787

CMD ["pnpm", "--filter", "server", "run", "dev"]