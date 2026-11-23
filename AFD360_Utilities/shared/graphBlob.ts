// A graph response can contain either literal JSON or one layer of HTML-encoded JSON.
export function decodeGraphBlob(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    const decoded = text
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&");
    if (decoded !== text) {
      try {
        return JSON.parse(decoded);
      } catch {
        return decoded;
      }
    }
    return text;
  }
}
