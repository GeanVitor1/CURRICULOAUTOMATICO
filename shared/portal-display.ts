// CSS coordinates stay independent of the transmitted image's pixel density.
export const portalDisplay = {
  minWidth: 375,
  maxWidth: 1600,
  minHeight: 480,
  maxHeight: 1000,
};
export function portalViewport(width = 1024, height = 720) {
  return {
    width: Math.max(
      portalDisplay.minWidth,
      Math.min(portalDisplay.maxWidth, Math.round(width)),
    ),
    height: Math.max(
      portalDisplay.minHeight,
      Math.min(portalDisplay.maxHeight, Math.round(height)),
    ),
  };
}
export const portalPixelRatio = 1.5;
