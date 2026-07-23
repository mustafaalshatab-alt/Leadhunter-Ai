import { spawn } from "bun";

// Kill any existing process on port 3000
try {
  const result = Bun.spawnSync(["sh", "-c", "lsof -t -iTCP:3000 -sTCP:LISTEN | xargs -r kill"], {
    stdout: "pipe",
    stderr: "pipe",
  });
} catch {}

console.log("🚀 Starting LeadHunter AI dev mode...\n");

// Start Hono API server on port 3001
const server = spawn(["bun", "run", "--watch", "server/index.ts"], {
  cwd: import.meta.dir,
  env: { ...process.env, LH_PORT: "3001", NODE_ENV: "development" },
  stdio: ["inherit", "inherit", "inherit"],
});

// Start Vite dev server on port 3000
const vite = spawn(["bun", "run", "--cwd", "client", "vite", "--port", "3000", "--strictPort"], {
  cwd: import.meta.dir,
  stdio: ["inherit", "inherit", "inherit"],
});

// Handle shutdown gracefully
const cleanup = () => {
  server.kill();
  vite.kill();
  process.exit(0);
};

process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);
