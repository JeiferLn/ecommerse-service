import { Test, TestingModule } from "@nestjs/testing";

import { HealthController } from "./health.controller";
import { HealthService } from "./health.service";

describe("HealthController", () => {
  let controller: HealthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: HealthService,
          useValue: {
            check: jest.fn().mockResolvedValue({ status: "ok", database: "up" }),
          },
        },
      ],
    }).compile();

    controller = module.get(HealthController);
  });

  it("debe devolver una ApiResponse con el estado de salud", async () => {
    const result = await controller.check();

    expect(result).toEqual({
      status: "success",
      data: { status: "ok", database: "up" },
    });
  });
});
