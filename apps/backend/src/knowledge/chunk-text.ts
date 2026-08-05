/**
 * Divide texto en chunks por párrafos / tamaño, con overlap opcional.
 */
export function chunkText(
  text: string,
  options: { chunkSize: number; overlap: number },
): string[] {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) {
    return [];
  }

  const { chunkSize, overlap } = options;
  const safeSize = Math.max(100, chunkSize);
  const safeOverlap = Math.max(0, Math.min(overlap, Math.floor(safeSize / 2)));

  const paragraphs = normalized
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);

  const units: string[] = [];
  for (const paragraph of paragraphs.length > 0 ? paragraphs : [normalized]) {
    if (paragraph.length <= safeSize) {
      units.push(paragraph);
      continue;
    }
    let start = 0;
    while (start < paragraph.length) {
      const end = Math.min(start + safeSize, paragraph.length);
      units.push(paragraph.slice(start, end).trim());
      if (end >= paragraph.length) {
        break;
      }
      start = Math.max(end - safeOverlap, start + 1);
    }
  }

  const chunks: string[] = [];
  let buffer = "";

  for (const unit of units) {
    if (!buffer) {
      buffer = unit;
      continue;
    }
    if (`${buffer}\n\n${unit}`.length <= safeSize) {
      buffer = `${buffer}\n\n${unit}`;
      continue;
    }
    chunks.push(buffer);
    if (safeOverlap > 0 && buffer.length > safeOverlap) {
      const tail = buffer.slice(-safeOverlap);
      buffer = `${tail}\n\n${unit}`.slice(0, safeSize * 2);
      if (buffer.length > safeSize) {
        chunks.push(buffer.slice(0, safeSize).trim());
        buffer = buffer.slice(Math.max(0, safeSize - safeOverlap));
      }
    } else {
      buffer = unit;
    }
  }

  if (buffer.trim()) {
    chunks.push(buffer.trim());
  }

  return chunks.filter(Boolean);
}
