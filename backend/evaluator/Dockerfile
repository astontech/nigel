# DORIS evaluator image: Node 22 + Claude Code CLI + the backend's shared data code.
FROM node:22-slim
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates && rm -rf /var/lib/apt/lists/* \
 && npm install -g @anthropic-ai/claude-code tsx
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY tsconfig.json ./
COPY lambda/shared ./lambda/shared
COPY evaluator ./evaluator
# Claude Code refuses to run as root; grading needs no privileges anyway.
RUN useradd -m grader && mkdir -p /home/grader/.claude && chown -R grader /app /home/grader
USER grader
ENV HOME=/home/grader
CMD ["tsx", "evaluator/run.ts"]
