import { Type } from "class-transformer";
import { IsInt, IsNumber, IsOptional, IsString, MaxLength, Min, MinLength } from "class-validator";

export class UpdateVariantDto {
  @IsOptional()
  @IsString()
  @MinLength(1, { message: "El SKU es obligatorio" })
  @MaxLength(64, { message: "El SKU no puede exceder 64 caracteres" })
  sku?: string;

  @IsOptional()
  @IsString()
  @MinLength(1, { message: "El nombre de la variante es obligatorio" })
  @MaxLength(120, { message: "El nombre de la variante no puede exceder 120 caracteres" })
  name?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: "El precio debe ser un número válido" })
  @Min(0, { message: "El precio no puede ser negativo" })
  price?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: "El precio comparado debe ser un número válido" })
  @Min(0, { message: "El precio comparado no puede ser negativo" })
  compareAtPrice?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: "El stock debe ser un entero" })
  @Min(0, { message: "El stock no puede ser negativo" })
  stock?: number;
}
