import { ProductStatus } from "@prisma/client";
import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class UpdateProductDto {
  @IsOptional()
  @IsString()
  @MinLength(2, { message: "El nombre debe tener al menos 2 caracteres" })
  @MaxLength(200, { message: "El nombre no puede exceder 200 caracteres" })
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000, { message: "La descripción no puede exceder 5000 caracteres" })
  description?: string | null;

  @IsOptional()
  @IsString()
  categoryId?: string | null;

  @IsOptional()
  @IsEnum(ProductStatus, { message: "Estado de producto inválido" })
  status?: ProductStatus;
}
