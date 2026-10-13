import { createServerlessHandler } from "./serverless-handler";

// Vercel serves the Vite build through its CDN. No background scheduler starts here.
export default createServerlessHandler(async () => {
  // Load database/configuration inside the handler so startup failures are caught.
  const { buildApp } = await import("./app.js");
  return buildApp({ serveStatic: false });
});
