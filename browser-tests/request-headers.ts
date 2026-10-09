// Match the app's actual origin when checking a production build on another port.
export const requestHeaders = {
  "X-Orbita-Request": "1",
  Origin: new URL(process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:5173")
    .origin,
};
