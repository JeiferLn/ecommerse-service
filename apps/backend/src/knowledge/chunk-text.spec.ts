import { chunkText } from "./chunk-text";

describe("chunkText", () => {
  it("devuelve vacío para texto en blanco", () => {
    expect(chunkText("   ", { chunkSize: 100, overlap: 10 })).toEqual([]);
  });

  it("mantiene un párrafo corto como un solo chunk", () => {
    expect(
      chunkText("Política de devoluciones en 15 días.", { chunkSize: 200, overlap: 20 }),
    ).toEqual(["Política de devoluciones en 15 días."]);
  });

  it("parte texto largo respetando el tamaño", () => {
    const body = "a".repeat(250);
    const chunks = chunkText(body, { chunkSize: 100, overlap: 10 });
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.length <= 100)).toBe(true);
  });
});
