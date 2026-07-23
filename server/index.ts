import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { join } from "path";
import health from "./routes/health";
import { getDb } from "./db";

const app = new Hono();
const isProduction = process.env.NODE_ENV === "production";
// Use LH_PORT env var (not PORT, which is set to 80 globally in this sandbox)
const port = parseInt(process.env.LH_PORT || (isProduction ? "3000" : "3001"));

// Initialize database on startup
getDb();

// API routes
app.route("/api/health", health);

// In production, serve static frontend from client/dist/
if (isProduction) {
  const distPath = join(import.meta.dir, "..", "client", "dist");
  app.use("/*", serveStatic({ root: distPath }));
  // SPA fallback: serve index.html for non-API, non-file routes
  app.get("/*", serveStatic({ path: "index.html", root: distPath }));
}

// Start the server
Bun.serve({
  port,
  fetch: app.fetch,
});

console.log(`🔥 LeadHunter API running on http://localhost:${port} [${process.env.NODE_ENV || "development"}]`);
