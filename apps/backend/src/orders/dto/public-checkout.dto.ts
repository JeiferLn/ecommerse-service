import { Type } from "class-transformer";
import { IsBoolean, IsString, MaxLength, MinLength } from "class-validator";

export class CompletePublicCheckoutDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  shippingName!: string;

  @IsString()
  @MinLength(5)
  @MaxLength(40)
  shippingPhone!: string;

  @IsString()
  @MinLength(5)
  @MaxLength(240)
  shippingAddress!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(80)
  shippingCountry!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  shippingRegion!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  shippingCity!: string;

  /** Stub de pago (Fase 9: reemplazar por confirmación de pasarela). */
  @Type(() => Boolean)
  @IsBoolean()
  confirmPayment!: boolean;
}
