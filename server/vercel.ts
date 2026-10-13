import { buildApp } from "./app";
import { createServerlessHandler } from "./serverless-handler";

// Vercel serves the Vite build through its CDN. No background scheduler starts here.
export default createServerlessHandler(() => buildApp({ serveStatic: false }));
