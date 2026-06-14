import DOMPurify from "isomorphic-dompurify";

/**
 * Email HTML is hostile input (CLAUDE.md security rule #2). We sanitize every
 * body with DOMPurify and block remote images by default to defeat tracking
 * pixels. Remote <img> sources are stripped and remembered so the client can
 * offer a per-message "Load images" toggle.
 *
 * Hooks are registered once on the shared DOMPurify instance and read
 * module-level state set immediately before each `sanitizeEmailHtml` call.
 * JavaScript is single-threaded, so this is race-free.
 */
let allowRemoteImages = false;
let sawRemoteImage = false;

function isRemoteUrl(url: string | null): boolean {
  if (!url) return false;
  return /^\s*(https?:)?\/\//i.test(url);
}

// Minimal structural view of a DOM element — avoids pulling the whole DOM lib
// into the Node server's tsconfig just for these few methods.
interface MinimalElement {
  tagName: string;
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
}

DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  const el = node as unknown as MinimalElement;

  // Open all links in a new tab and neutralize reverse-tabnabbing.
  if (el.tagName === "A") {
    el.setAttribute("target", "_blank");
    el.setAttribute("rel", "noopener noreferrer nofollow");
  }

  // Block remote images unless explicitly allowed for this message.
  if (el.tagName === "IMG") {
    el.removeAttribute("srcset"); // can't reliably gate responsive sources
    const src = el.getAttribute("src");
    if (isRemoteUrl(src)) {
      sawRemoteImage = true;
      if (!allowRemoteImages) {
        el.removeAttribute("src");
        if (src) el.setAttribute("data-blocked-src", src);
      }
    }
  }
});

export interface SanitizedBody {
  html: string;
  hasRemoteImages: boolean;
}

export function sanitizeEmailHtml(
  rawHtml: string,
  options: { allowRemoteImages?: boolean } = {},
): SanitizedBody {
  allowRemoteImages = options.allowRemoteImages ?? false;
  sawRemoteImage = false;

  const html = DOMPurify.sanitize(rawHtml, {
    WHOLE_DOCUMENT: false,
    FORBID_TAGS: ["script", "iframe", "object", "embed", "base", "form"],
    FORBID_ATTR: ["onerror", "onload", "onclick"],
    ADD_ATTR: ["target"],
  });

  return { html, hasRemoteImages: sawRemoteImage };
}
