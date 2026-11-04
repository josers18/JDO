/** Data Cloud returns free-text strings HTML-escaped (e.g. "O&#39;Connor"); undo that for display. */
export const decodeEntities = (s: string) =>
  s.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
