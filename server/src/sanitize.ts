import sanitizeHtml from "sanitize-html";

/**
 * Email HTML is hostile input (CLAUDE.md security rule #2). We sanitize every
 * body server-side and block remote images by default to defeat tracking
 * pixels. The result is additionally rendered inside a script-disabled
 * sandboxed iframe on the client as defense-in-depth.
 *
 * (We use sanitize-html rather than DOMPurify here: DOMPurify needs a browser
 * DOM, and jsdom's dependency tree breaks under Node's ESM loader in the
 * compiled production build. sanitize-html is a Node-native equivalent.)
 *
 * `sawRemoteImage` is module-level and reset at the start of each call —
 * JavaScript is single-threaded, so this is race-free.
 */
let sawRemoteImage = false;

function isRemoteUrl(url: string): boolean {
  return /^\s*(https?:)?\/\//i.test(url);
}

const ALLOWED_TAGS = [
  ...sanitizeHtml.defaults.allowedTags,
  "img",
  "h1",
  "h2",
  "span",
  "center",
  "font",
  "u",
  "s",
  "hr",
  "figure",
  "figcaption",
  "col",
  "colgroup",
  "tbody",
  "thead",
  "tfoot",
  "caption",
  "pre",
];

export interface SanitizedBody {
  html: string;
  hasRemoteImages: boolean;
}

export function sanitizeEmailHtml(
  rawHtml: string,
  options: { allowRemoteImages?: boolean } = {},
): SanitizedBody {
  const allowRemoteImages = options.allowRemoteImages ?? false;
  sawRemoteImage = false;

  const html = sanitizeHtml(rawHtml, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {
      "*": [
        "style",
        "class",
        "dir",
        "align",
        "valign",
        "width",
        "height",
        "bgcolor",
        "color",
        "colspan",
        "rowspan",
      ],
      a: ["href", "name", "target", "rel"],
      img: ["src", "alt", "title", "width", "height", "data-blocked-src"],
      font: ["face", "color", "size"],
      table: ["border", "cellpadding", "cellspacing", "width", "bgcolor", "align"],
    },
    // No "javascript:" — only safe link/image schemes.
    allowedSchemes: ["http", "https", "mailto", "tel"],
    allowedSchemesByTag: { img: ["http", "https", "data", "cid"] },
    allowProtocolRelative: true,
    transformTags: {
      a: (tagName, attribs) => {
        attribs.target = "_blank";
        attribs.rel = "noopener noreferrer nofollow";
        return { tagName, attribs };
      },
      img: (tagName, attribs) => {
        const src = attribs.src;
        if (src && isRemoteUrl(src)) {
          sawRemoteImage = true;
          if (!allowRemoteImages) {
            attribs["data-blocked-src"] = src;
            delete attribs.src;
          }
        }
        return { tagName, attribs };
      },
    },
  });

  return { html, hasRemoteImages: sawRemoteImage };
}
