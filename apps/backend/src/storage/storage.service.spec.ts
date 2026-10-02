import { ConfigService } from "@nestjs/config";

import { StorageService } from "./storage.service";

const SAVED_WITH_TUNNEL =
  "https://old-tunnel.ngrok-free.dev/uploads/companies/c1/products/p1/foto.jpg";

function createService(values: Record<string, unknown>): StorageService {
  return new StorageService({ get: (key: string) => values[key] } as unknown as ConfigService);
}

describe("StorageService", () => {
  describe("en disco local", () => {
    const service = createService({
      NODE_ENV: "development",
      PORT: 4000,
      API_PUBLIC_URL: "https://new-tunnel.ngrok-free.dev/",
    });

    it("el admin siempre recibe la URL del API local aunque se guardara con otro túnel", () => {
      expect(service.browserUrl(SAVED_WITH_TUNNEL)).toBe(
        "http://localhost:4000/uploads/companies/c1/products/p1/foto.jpg",
      );
    });

    it("Twilio recibe el API_PUBLIC_URL actual", () => {
      expect(service.externalUrl(SAVED_WITH_TUNNEL)).toBe(
        "https://new-tunnel.ngrok-free.dev/uploads/companies/c1/products/p1/foto.jpg",
      );
    });

    it("no toca URLs que no son de /uploads", () => {
      expect(service.browserUrl("https://cdn.example.com/a.jpg")).toBe(
        "https://cdn.example.com/a.jpg",
      );
    });
  });

  it("con R2 deja la URL pública tal cual", () => {
    const service = createService({
      NODE_ENV: "development",
      R2_ACCOUNT_ID: "acc",
      R2_ACCESS_KEY_ID: "key",
      R2_SECRET_ACCESS_KEY: "secret",
      R2_BUCKET: "bucket",
      R2_PUBLIC_URL: "https://img.example.com",
    });
    const url = "https://img.example.com/uploads/companies/c1/x.jpg";
    expect(service.browserUrl(url)).toBe(url);
    expect(service.externalUrl(url)).toBe(url);
  });
});
