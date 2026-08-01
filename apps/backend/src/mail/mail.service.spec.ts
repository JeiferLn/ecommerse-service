import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";

import { MailService } from "./mail.service";

describe("MailService", () => {
  describe("sin SMTP configurado (modo preview)", () => {
    let service: MailService;

    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          MailService,
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn((key: string) => {
                const values: Record<string, unknown> = {
                  SMTP_HOST: "",
                  SMTP_PORT: undefined,
                  SMTP_USER: "",
                  SMTP_PASS: "",
                  MAIL_FROM: "no-reply@test.com",
                };
                return values[key];
              }),
            },
          },
        ],
      }).compile();

      service = module.get(MailService);
    });

    it("no lanza errores y entra en modo preview", async () => {
      const spy = jest.spyOn(service["logger"], "log").mockImplementation(() => undefined);

      await expect(
        service.sendPasswordReset({
          to: "user@test.com",
          resetUrl: "http://localhost:3000/reset-password?token=abc",
        }),
      ).resolves.toBeUndefined();

      expect(spy).toHaveBeenCalledWith(expect.stringContaining("[Preview] Para: user@test.com"));
    });
  });
});
