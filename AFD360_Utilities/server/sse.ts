export interface SseEvent {
  event: string;
  data: unknown; // parsed JSON when possible, else the raw string
}

function toEvent(lines: string[]): SseEvent | null {
  let event = "message";
  const data: string[] = [];
  for (const line of lines) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
  }
  if (!data.length) return null;
  const raw = data.join("\n");
  try {
    return { event, data: JSON.parse(raw) };
  } catch {
    return { event, data: raw };
  }
}

// Parses a text/event-stream body into events (blank line = event boundary).
export async function* parseSse(body: ReadableStream<Uint8Array> | AsyncIterable<Uint8Array>): AsyncGenerator<SseEvent> {
  const decoder = new TextDecoder();
  let buffer = "";
  let lines: string[] = [];
  for await (const chunk of body as AsyncIterable<Uint8Array>) {
    buffer += decoder.decode(chunk, { stream: true });
    let nl: number;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl).replace(/\r$/, "");
      buffer = buffer.slice(nl + 1);
      if (line === "") {
        const ev = toEvent(lines);
        lines = [];
        if (ev) yield ev;
      } else {
        lines.push(line);
      }
    }
  }
  const ev = toEvent(buffer ? [...lines, buffer] : lines);
  if (ev) yield ev;
}
