# ============================================================
# Stage 1: builder
# Install ALL dependencies and build the application
# ============================================================
FROM node:22-slim AS builder

WORKDIR /app

# Copy package manifests first for layer caching
COPY package.json package-lock.json ./

# Install all deps (including devDependencies needed for build)
RUN npm ci --ignore-scripts

# Copy source files required for the build.
# firebase-applet-config.json contains only public Firebase Web SDK config
# (apiKey is intentionally public, protected by Firestore Security Rules)
COPY firebase-applet-config.json ./
COPY index.html ./
COPY vite.config.ts ./
COPY tsconfig.json ./
COPY server.ts ./
COPY src/ ./src/

# public/ may be empty or contain only static assets; copy if present
COPY public ./public

# Build frontend (Vite -> dist/assets + dist/index.html)
# and server bundle (esbuild -> dist/server.cjs)
RUN npm run build

# ============================================================
# Stage 2: runner
# Production image - only built artifacts, no source or devDeps
# ============================================================
FROM node:22-slim AS runner

WORKDIR /app

ENV NODE_ENV=production

# Copy package manifests for production-only install
COPY package.json package-lock.json ./

# Install production dependencies only
RUN npm ci --omit=dev --ignore-scripts

# Copy built artifacts from the builder stage
COPY --from=builder /app/dist ./dist

# Copy public Firebase Web SDK config (intentionally public, needed at runtime
# by server.ts to resolve firestoreDatabaseId and Firebase project config)
COPY firebase-applet-config.json ./

# Cloud Run injects PORT at runtime; default to 3000 for local testing.
# server.ts reads: parseInt(process.env.PORT || '3000', 10)
EXPOSE 3000

# Start the compiled production server
CMD ["node", "dist/server.cjs"]