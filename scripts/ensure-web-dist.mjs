// wrangler dev refuses to start if the assets directory is missing.
// In dev the UI is served by Vite (:5173), so an empty dist is enough.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dist = join(dirname(fileURLToPath(import.meta.url)), "..", "apps", "web", "dist");
if (!existsSync(dist)) {
  mkdirSync(dist, { recursive: true });
  writeFileSync(
    join(dist, "index.html"),
    '<!doctype html><p>Dev mode: open <a href="http://localhost:5173">http://localhost:5173</a> (Vite). Run <code>npm run build</code> to serve the real UI from the Worker.</p>',
  );
  console.log("[ensure-web-dist] created placeholder", dist);
}
