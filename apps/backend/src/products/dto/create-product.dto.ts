import { ProductStatus } from "@prisma/client";
import { Type } from "class-transformer";
import {
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";

export class CreateVariantDto {
  @IsString()
  @MinLength(1, { message: "El SKU es obligatorio" })
  @MaxLength(64, { message: "El SKU no puede exceder 64 caracteres" })
  sku!: string;

  @IsString()
  @MinLength(1, { message: "El nombre de la variante es obligatorio" })
  @MaxLength(120, { message: "El nombre de la variante no puede exceder 120 caracteres" })
  name!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: "El precio debe ser un número válido" })
  @Min(0, { message: "El precio no puede ser negativo" })
  price!: number;

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

export class CreateProductDto {
  @IsString()
  @MinLength(2, { message: "El nombre debe tener al menos 2 caracteres" })
  @MaxLength(200, { message: "El nombre no puede exceder 200 caracteres" })
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000, { message: "La descripción no puede exceder 5000 caracteres" })
  description?: string;

  @IsOptional()
  @IsString()
  categoryId?: string | null;

  @IsOptional()
  @IsEnum(ProductStatus, { message: "Estado de producto inválido" })
  status?: ProductStatus;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateVariantDto)
  variants?: CreateVariantDto[];
}
