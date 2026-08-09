import { Type } from "class-transformer";
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from "class-validator";
import { OrderChannel, OrderStatus } from "@prisma/client";

export class ListOrdersQueryDto {
  @IsOptional()
  @IsEnum(OrderStatus, { message: "Estado de pedido inválido" })
  status?: OrderStatus;

  @IsOptional()
  @IsEnum(OrderChannel, { message: "Canal de pedido inválido" })
  channel?: OrderChannel;

  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsString()
  conversationId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  perPage?: number = 20;
}
