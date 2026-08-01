import { Type } from "class-transformer";
import { IsInt, IsOptional, Min } from "class-validator";

export class UpdateStockDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: "El stock debe ser un entero" })
  @Min(0, { message: "El stock no puede ser negativo" })
  stock?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: "El delta debe ser un entero" })
  delta?: number;
}
