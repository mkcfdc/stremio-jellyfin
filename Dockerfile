# === 1. Build React App ===
FROM denoland/deno:2.4.1 AS frontend-builder

WORKDIR /app/frontend
COPY frontend/package*.json ./
COPY frontend/deno*.json ./
RUN deno install
COPY frontend .
RUN deno run -A npm:vite build

# === 2. Build Deno App ===
FROM denoland/deno:alpine-2.4.1

# App directory
WORKDIR /app
COPY . .

# Copy frontend build output into Deno's static folder
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Set environment variables
ENV PORT=60421
EXPOSE 60421

# Cache dependencies
RUN deno cache main.ts

# Run as non-root
USER deno

# Run Deno server
ENTRYPOINT ["deno", "run", "--allow-net", "--allow-env", "--allow-sys", "--allow-read", "main.ts"]