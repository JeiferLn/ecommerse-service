import { OrderStatus } from "@prisma/client";
import { IsEnum } from "class-validator";

export class UpdateOrderStatusDto {
  @IsEnum(OrderStatus, { message: "Estado de pedido inválido" })
  status!: OrderStatus;
}
