# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Veda-Tele-Agent Docker Build
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# Use Node.js 20 LTS as the base image
FROM node:20-slim AS builder

# Set working directory
WORKDIR /app

# Copy package management files
COPY backend/package*.json ./

# Install production dependencies
RUN npm ci --omit=dev

# Copy backend source code
COPY backend/src ./src

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Final Runtime Stage
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FROM node:20-slim

WORKDIR /app

# Copy built assets from builder
COPY --from=builder /app /app

# Expose the Cloud Run standard port
EXPOSE 8080

# Configure environment variables
ENV NODE_ENV=production
ENV PORT=8080

# Run the backend
CMD ["node", "src/index.js"]
