FROM node:20-bookworm-slim AS build

ARG BADGE_ENGINE_REPOSITORY=https://github.com/digital-promise/badge-engine.git
ARG BADGE_ENGINE_REF=bad61f522bc91e370e9b90963c225a86611e981c

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates git python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

RUN git init \
    && git remote add origin "${BADGE_ENGINE_REPOSITORY}" \
    && git fetch --depth 1 origin "${BADGE_ENGINE_REF}" \
    && git checkout --detach FETCH_HEAD \
    && rm -rf .git

RUN npm install --global pnpm@8.8.0 \
    && pnpm install --frozen-lockfile

ENV SKIP_ENV_VALIDATION=1
RUN pnpm style-dictionary \
    && pnpm build


FROM node:20-bookworm-slim AS runtime

ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0

RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/* \
    && npm install --global pnpm@8.8.0 \
    && groupadd --system --gid 1001 badgeengine \
    && useradd --system --uid 1001 --gid badgeengine --home-dir /app badgeengine

WORKDIR /app

COPY --from=build --chown=badgeengine:badgeengine /app/package.json /app/pnpm-lock.yaml ./
COPY --from=build --chown=badgeengine:badgeengine /app/node_modules ./node_modules
COPY --from=build --chown=badgeengine:badgeengine /app/.next ./.next
COPY --from=build --chown=badgeengine:badgeengine /app/public ./public
COPY --from=build --chown=badgeengine:badgeengine /app/prisma ./prisma

USER badgeengine

EXPOSE 3000

CMD ["sh", "-c", "pnpm db:push && pnpm start"]
