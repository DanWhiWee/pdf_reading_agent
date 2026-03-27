import type { PDFDocumentProxy } from "pdfjs-dist";

/** Horizontal inset so the page does not touch the scrollbar (matches .pdf-content padding). */
const EXTRA_MARGIN_PX = 8;

/**
 * pdf.js canvas uses this as render scale factor vs CSS size.
 * - Floor at 1 when browser zoom is under 100% avoids canvas upscale blur.
 * - Mild boost + cap: sharper strokes without the huge canvases from a flat ×2.
 */
export function getPdfRenderDevicePixelRatio(): number {
  if (typeof window === "undefined") return 1;
  const dpr = window.devicePixelRatio || 1;
  const floor = Math.max(dpr, 1);
  const sharpen = 1.2;
  return Math.min(2.25, floor * sharpen);
}

function contentInnerWidth(el: HTMLElement): number {
  const style = getComputedStyle(el);
  const pl = parseFloat(style.paddingLeft) || 0;
  const pr = parseFloat(style.paddingRight) || 0;
  return Math.max(120, el.clientWidth - pl - pr - EXTRA_MARGIN_PX * 2);
}

/**
 * Scale so page width matches the scroll area (Chrome "fit to width" default).
 */
export async function computeFitWidthScale(
  pdf: PDFDocumentProxy,
  containerEl: HTMLElement,
  min = 0.5,
  max = 3
): Promise<number> {
  const page = await pdf.getPage(1);
  const rotate = page.rotate ?? 0;
  const vp = page.getViewport({ scale: 1, rotation: rotate });
  const avail = contentInnerWidth(containerEl);
  let s = avail / vp.width;
  s = Math.min(max, Math.max(min, s));
  return Math.round(s * 1000) / 1000;
}
