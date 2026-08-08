import { Type } from "class-transformer";
import { IsInt, IsOptional, IsString, MaxLength, Min } from "class-validator";

export class AddCartItemDto {
  @IsString()
  variantId!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity?: number = 1;
}

export class UpdateCartItemDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  quantity!: number;
}

export class CheckoutCartDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  shippingName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  shippingPhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  shippingAddress?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  shippingCity?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
