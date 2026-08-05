import { detectsBotChoice, detectsHumanRequest, extractResidualAfterBotChoice } from "./conversation-handler";

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

  it("extrae pregunta residual tras elegir bot en el mismo mensaje", () => {
    expect(extractResidualAfterBotChoice("bot")).toBeNull();
    expect(extractResidualAfterBotChoice("un bot por favor")).toBeNull();
    expect(extractResidualAfterBotChoice("bot, disculpa que productos tienen disponibles")).toBe(
      "que productos tienen disponibles",
    );
  });
});
