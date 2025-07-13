# Use the official Deno runtime image
FROM denoland/deno:alpine-2.4.1

# Set up workdir and copy in your code
WORKDIR /home/deno/app
COPY . .

# Environment variables
ENV JELLYFIN_USERNAME="changeme"
ENV JELLYFIN_PW="changeme"
ENV JELLYFIN_SERVER="http://localhost"
ENV PORT=60421
ENV DENO_ENV="production"

RUN deno cache main.ts

# Switch to non-root user
USER deno

# Expose the port your app listens on
EXPOSE $PORT

# Run your server with the minimal required permissions
ENTRYPOINT ["deno", "run", "--allow-net", "--allow-env", "--allow-sys", "--allow-read" "main.ts"]
