import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";
import { InStorePaymentMethod } from "@prisma/client";

export class InStoreSaleItemDto {
  @IsString()
  variantId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number;
}

export class CreateInStoreSaleDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => InStoreSaleItemDto)
  items!: InStoreSaleItemDto[];

  @IsEnum(InStorePaymentMethod, { message: "Método de pago inválido" })
  paymentMethod!: InStorePaymentMethod;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  customerName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  customerPhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
