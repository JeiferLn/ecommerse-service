const JPEG = Buffer.from([0xff, 0xd8, 0xff]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
const GIF = Buffer.from([0x47, 0x49, 0x46]);

/** Detecta MIME real por magic bytes (JPEG/PNG/WebP/GIF). */
export function detectImageMime(buffer: Buffer): string | null {
  if (buffer.length < 12) {
    return null;
  }
  if (buffer.subarray(0, 3).equals(JPEG)) {
    return "image/jpeg";
  }
  if (buffer.subarray(0, 4).equals(PNG)) {
    return "image/png";
  }
  if (buffer.subarray(0, 3).equals(GIF)) {
    return "image/gif";
  }
  if (
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}
