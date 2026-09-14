FROM node:22-bookworm-slim AS web
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY . .
ENV NEXT_PUBLIC_DEPLOYMENT=server
RUN node scripts/copy-wasm-files.js && npm run build && npm prune --omit=dev --ignore-scripts

FROM python:3.11-slim-bookworm AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends procps ffmpeg libgl1 libglib2.0-0 libgomp1 libstdc++6 libatomic1 ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=web /usr/local/bin/node /usr/local/bin/node
WORKDIR /app
COPY requirements-analysis.txt ./
RUN python -m venv /app/.venv-analysis && \
    /app/.venv-analysis/bin/pip install --no-cache-dir torch==2.8.0 torchvision==0.23.0 --index-url https://download.pytorch.org/whl/cpu && \
    /app/.venv-analysis/bin/pip install --no-cache-dir -r requirements-analysis.txt
COPY --from=web /app/.next ./.next
COPY --from=web /app/node_modules ./node_modules
COPY --from=web /app/public ./public
COPY package.json next.config.js ./
COPY scripts ./scripts
COPY deploy ./deploy
RUN useradd --uid 10001 --create-home app && mkdir -p /app/.local-run/models /app/.local-run/workbench /app/.local-run/yolo-config /app/.next/cache && chown -R app:app /app/.local-run /app/.next/cache
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PYTHONUNBUFFERED=1 YOLO_AUTOINSTALL=false BASKETBALL_REID_DEVICE=cpu OMP_NUM_THREADS=2 OPENBLAS_NUM_THREADS=2
USER app
EXPOSE 3001
CMD ["sh", "deploy/start-server.sh"]
