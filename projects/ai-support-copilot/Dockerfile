FROM node:25-bookworm-slim AS web
WORKDIR /web
RUN npm install --global pnpm@11.19.0
COPY frontend/package.json frontend/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY frontend/ ./
RUN pnpm build:demo

FROM python:3.12-slim
WORKDIR /project
COPY backend/ ./backend/
COPY data/ ./data/
RUN pip install --no-cache-dir -r backend/requirements.lock && pip install --no-deps ./backend
COPY --from=web /web/.static-build/out /project/web
RUN useradd --create-home app
USER app
ENV HARBOR_PROJECT_DIR=/project
ENV HARBOR_STATIC_DIR=/project/web
ENV PYTHONUNBUFFERED=1
CMD ["sh", "-c", "exec uvicorn app.hosted:app --host 0.0.0.0 --port ${PORT:-8000}"]
