export function isEffectivelyMaximizedBounds(bounds = {}, { minWidth = 1600, minHeight = 900 } = {}) {
  if (bounds?.windowState === "maximized") return true;
  const width = Number(bounds?.width || 0);
  const height = Number(bounds?.height || 0);
  return width >= minWidth && height >= minHeight;
}

export async function maximizeChromiumWindow(page, {
  width = 1920,
  height = 1080,
  minWidth = 1600,
  minHeight = 900,
  label = "Chrome",
} = {}) {
  const session = await page.context().newCDPSession(page);
  try {
    const { windowId } = await session.send("Browser.getWindowForTarget");
    await session.send("Browser.setWindowBounds", {
      windowId,
      bounds: { windowState: "maximized" },
    });
    let bounds = await session.send("Browser.getWindowBounds", { windowId });
    if (isEffectivelyMaximizedBounds(bounds?.bounds, { minWidth, minHeight })) {
      return {
        ...(bounds?.bounds || {}),
        effectivelyMaximized: true,
        maximizedStateAccepted: bounds?.bounds?.windowState === "maximized",
      };
    }

    await session.send("Browser.setWindowBounds", {
      windowId,
      bounds: { windowState: "normal", left: 0, top: 0, width, height },
    });
    bounds = await session.send("Browser.getWindowBounds", { windowId });
    if (!isEffectivelyMaximizedBounds(bounds?.bounds, { minWidth, minHeight })) {
      throw new Error(`${label} window is too small after maximize attempts: ${JSON.stringify(bounds?.bounds || {})}`);
    }
    return {
      ...(bounds?.bounds || {}),
      effectivelyMaximized: true,
      maximizedStateAccepted: false,
      fallbackWindowBoundsApplied: true,
    };
  } finally {
    await session.detach().catch(() => {});
  }
}
