import { BadRequestException } from "@nestjs/common";
import pdfParse from "pdf-parse";

const PDF_MAGIC = Buffer.from("%PDF");

export function assertPdfBuffer(buffer: Buffer): void {
  if (!buffer || buffer.length < 5 || !buffer.subarray(0, 4).equals(PDF_MAGIC)) {
    throw new BadRequestException("Solo se aceptan archivos PDF válidos");
  }
}

export async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  assertPdfBuffer(buffer);
  try {
    const parsed = await pdfParse(buffer);
    const text = (parsed.text ?? "").replace(/\s+/g, " ").trim();
    if (text.length < 40) {
      throw new BadRequestException(
        "El PDF no tiene texto suficiente. Usa un PDF con texto seleccionable (no escaneado).",
      );
    }
    return text;
  } catch (error) {
    if (error instanceof BadRequestException) {
      throw error;
    }
    throw new BadRequestException("No se pudo leer el PDF. Verifica que el archivo no esté dañado.");
  }
}
