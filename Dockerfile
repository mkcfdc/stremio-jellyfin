# Use the official Deno runtime image
FROM denoland/deno-bin-2.4.1

# Set up workdir and copy in your code
WORKDIR /home/deno/app
COPY . .

# Environment variables
ENV JELLYFIN_USER="changeme"
ENV JELLYFIN_PASSWORD="changeme"
ENV JELLYFIN_SERVER="http://localhost"
ENV SERVER_PORT=60421

RUN deno cache main.ts

# Switch to non-root user
USER deno

# Expose the port your app listens on
EXPOSE $SERVER_PORT

# Run your server with the minimal required permissions
ENTRYPOINT ["deno", "run", "--allow-net", "--allow-env", "main.ts"]
