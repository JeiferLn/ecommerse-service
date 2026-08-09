import { COMPANY_COUNTRY_CODES, PLAN_CODES } from "@commerce-ai/types";
import { CompanyType } from "@prisma/client";
import { IsEmail, IsEnum, IsIn, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class RegisterDto {
  @IsString()
  @MinLength(2, { message: "El nombre debe tener al menos 2 caracteres" })
  @MaxLength(100, { message: "El nombre no puede exceder 100 caracteres" })
  name!: string;

  @IsEmail({}, { message: "Ingresa un email válido" })
  email!: string;

  @IsString()
  @MinLength(8, { message: "La contraseña debe tener al menos 8 caracteres" })
  @MaxLength(72, { message: "La contraseña no puede exceder 72 caracteres" })
  password!: string;

  @IsString()
  @MinLength(2, { message: "El nombre de la empresa debe tener al menos 2 caracteres" })
  @MaxLength(100, { message: "El nombre de la empresa no puede exceder 100 caracteres" })
  companyName!: string;

  @IsEnum(CompanyType, { message: "Selecciona un tipo de empresa válido" })
  companyType!: CompanyType;

  @IsString()
  @IsIn([...COMPANY_COUNTRY_CODES], {
    message: "Selecciona un país con soporte de Mercado Pago",
  })
  countryCode!: string;

  /** Plan deseado tras el trial (free | pro | business). Siempre empieza en trial Free. */
  @IsOptional()
  @IsIn([...PLAN_CODES], { message: "Plan inválido" })
  planCode?: (typeof PLAN_CODES)[number];
}
