import { BadRequestException } from "@nestjs/common";

import { assertPdfBuffer } from "./pdf-text";

describe("pdf-text", () => {
  it("rechaza buffers que no son PDF", () => {
    expect(() => assertPdfBuffer(Buffer.from("not-a-pdf"))).toThrow(BadRequestException);
  });

  it("acepta magic bytes %PDF", () => {
    expect(() => assertPdfBuffer(Buffer.from("%PDF-1.4 rest"))).not.toThrow();
  });
});
