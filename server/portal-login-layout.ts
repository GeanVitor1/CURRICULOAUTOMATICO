import type { Page, ElementHandle } from "playwright";

// Repair only the visible layout of LinkedIn's embedded verification page.
// Never read challenge text/images/answers, click controls, or submit forms.
export async function fitLinkedInVerification(page: Page) {
  const url = new URL(page.url());
  if (
    !["www.linkedin.com", "linkedin.com"].includes(url.hostname) ||
    !/^\/checkpoint\//.test(url.pathname)
  )
    return;
  for (const frame of page.frames().slice(1).reverse()) {
    let element: ElementHandle | undefined;
    try {
      element = await frame.frameElement();
      const box = await element.boundingBox();
      // Ignore invisible telemetry frames and small checkbox/anchor widgets.
      if (!box || box.width < 200 || box.height < 100 || box.height > 900)
        continue;
      const size = await frame.evaluate(() => {
        // Fixed/centered widget panels may extend outside a short iframe
        // without contributing their full height to the document's scroll size.
        const panels = Array.from(document.body?.children || [])
          .filter((node) => getComputedStyle(node).visibility !== "hidden")
          .map((node) => node.getBoundingClientRect());
        return {
          width: Math.max(
            document.documentElement.scrollWidth,
            document.body?.scrollWidth || 0,
            ...panels.map((rect) => rect.width),
          ),
          height: Math.max(
            document.documentElement.scrollHeight,
            document.body?.scrollHeight || 0,
            ...panels.map((rect) => rect.height),
          ),
        };
      });
      const width = Math.min(700, size.width);
      const height = Math.min(900, size.height);
      if (height <= box.height + 24 && width <= box.width + 4) continue;
      await element.evaluate(
        (node, size) => {
          const iframe = node as HTMLIFrameElement;
          if (size.height > iframe.clientHeight + 24) {
            iframe.style.setProperty("height", `${size.height}px`, "important");
            iframe.style.setProperty("max-height", "none", "important");
          }
          if (size.width > iframe.clientWidth + 4) {
            iframe.style.setProperty("width", `${size.width}px`, "important");
            iframe.style.setProperty("max-width", "none", "important");
          }
          // Some portal wrappers keep the original 150px height and clip the
          // expanded iframe. Let those wrappers grow while preserving the form.
          let parent = iframe.parentElement;
          for (
            let i = 0;
            parent && parent !== document.body && i < 3;
            i++, parent = parent.parentElement
          ) {
            const style = getComputedStyle(parent);
            if (
              /hidden|clip/.test(style.overflowX) &&
              parent.clientWidth < size.width
            )
              parent.style.setProperty(
                "min-width",
                `${size.width}px`,
                "important",
              );
            if (
              /hidden|clip/.test(style.overflowY) &&
              parent.clientHeight < size.height
            ) {
              parent.style.setProperty(
                "min-height",
                `${size.height}px`,
                "important",
              );
              parent.style.setProperty("max-height", "none", "important");
              parent.style.setProperty("overflow-y", "visible", "important");
            }
          }
        },
        { width, height },
      );
    } catch {
      // Frames can be replaced while a provider navigates or loads a widget.
    } finally {
      await element?.dispose().catch(() => {});
    }
  }
}
