import { detectsBotChoice, detectsHumanRequest } from "./conversation-handler";

describe("conversation-handler", () => {
  it("detecta pedido de asesor / persona real", () => {
    expect(detectsHumanRequest("quiero un asesor")).toBe(true);
    expect(detectsHumanRequest("persona real por favor")).toBe(true);
    expect(detectsHumanRequest("pásame con un asesor")).toBe(true);
    expect(detectsHumanRequest("hola jeans")).toBe(false);
  });

  it("detecta elección de bot", () => {
    expect(detectsBotChoice("bot")).toBe(true);
    expect(detectsBotChoice("asistente virtual")).toBe(true);
    expect(detectsBotChoice("asesor")).toBe(false);
  });
});
