# Stage 1: Build frontend
FROM node:22-alpine AS frontend-builder
WORKDIR /build
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ .
RUN npm run build

# Stage 2: Python dependencies
FROM python:3.13-alpine AS python-builder
WORKDIR /build
RUN apk add --no-cache gcc g++ musl-dev postgresql-dev python3-dev jpeg-dev zlib-dev
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
COPY requirements.txt .
RUN pip install --upgrade pip --no-cache-dir && pip install --no-cache-dir -r requirements.txt

# Stage 3: Runtime
FROM python:3.13-alpine AS runtime
WORKDIR /app
RUN apk add --no-cache tini bash libpq libjpeg-turbo curl
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
COPY --from=python-builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH" DJANGO_SETTINGS_MODULE=cookless.settings
COPY backend/ .
COPY --from=frontend-builder /build/dist /app/frontend_dist
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh
RUN mkdir -p /app/staticfiles /app/data /data/media && chown -R appuser:appgroup /app /data
USER appuser
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:8000/health/ || exit 1
ENTRYPOINT ["/sbin/tini", "--", "docker-entrypoint.sh"]
CMD ["gunicorn", "cookless.wsgi:application", "--bind", "0.0.0.0:8000"]
