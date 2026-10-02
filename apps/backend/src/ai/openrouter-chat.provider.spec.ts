import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";

import { OpenRouterChatProvider } from "./openrouter-chat.provider";

describe("OpenRouterChatProvider", () => {
  let provider: OpenRouterChatProvider;
  let configValues: Record<string, unknown>;
  const originalFetch = global.fetch;

  beforeEach(async () => {
    configValues = {
      OPENROUTER_API_KEY: "sk-or-test",
      AI_BASE_URL: "https://openrouter.ai/api/v1",
      AI_MODEL: "meta-llama/llama-3.2-3b-instruct:free",
      AI_HTTP_REFERER: "http://localhost:3000",
      AI_APP_TITLE: "Commerce AI SaaS",
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OpenRouterChatProvider,
        {
          provide: ConfigService,
          useValue: { get: (key: string) => configValues[key] },
        },
      ],
    }).compile();

    provider = module.get(OpenRouterChatProvider);
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("parsea el content de chat/completions", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        model: "meta-llama/llama-3.2-3b-instruct:free",
        choices: [{ message: { content: "  Hola, el precio es $10  " } }],
      }),
    });

    const result = await provider.complete({
      messages: [{ role: "user", content: "precio?" }],
    });

    expect(result.content).toBe("Hola, el precio es $10");
    expect(global.fetch).toHaveBeenCalledWith(
      "https://openrouter.ai/api/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer sk-or-test",
          "HTTP-Referer": "http://localhost:3000",
        }),
      }),
    );
  });

  it("falla si no hay API key", async () => {
    configValues.OPENROUTER_API_KEY = "";
    await expect(
      provider.complete({ messages: [{ role: "user", content: "hola" }] }),
    ).rejects.toThrow("OPENROUTER_API_KEY");
  });

  it("falla en errores HTTP", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => "rate limit",
    });

    await expect(
      provider.complete({ messages: [{ role: "user", content: "hola" }] }),
    ).rejects.toThrow("429");
  });
});
