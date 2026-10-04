import { rm } from "node:fs/promises";

// Cloudflare's Vite build copies .dev.vars into its generated Worker directory.
// Keep local development credentials out of deployable build artifacts.
await rm(new URL("../dist/gitandem/.dev.vars", import.meta.url), { force: true });
