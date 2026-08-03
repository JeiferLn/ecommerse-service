import { IsOptional, IsString, MinLength } from "class-validator";

export class SimulateInboundDto {
  @IsString()
  @MinLength(1, { message: "from es obligatorio" })
  from!: string;

  @IsString()
  @MinLength(1, { message: "text es obligatorio" })
  text!: string;

  @IsOptional()
  @IsString()
  customerName?: string;
}
