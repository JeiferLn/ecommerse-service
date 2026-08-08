import { COMPANY_COUNTRY_CODES } from "@commerce-ai/types";
import { CompanyType } from "@prisma/client";
import { IsEnum, IsIn, IsString, MaxLength, MinLength } from "class-validator";

export class CreateCompanyDto {
  @IsString()
  @MinLength(2, { message: "El nombre de la empresa debe tener al menos 2 caracteres" })
  @MaxLength(100, { message: "El nombre de la empresa no puede exceder 100 caracteres" })
  name!: string;

  @IsEnum(CompanyType, { message: "Selecciona un tipo de empresa válido" })
  companyType!: CompanyType;

  @IsString()
  @IsIn([...COMPANY_COUNTRY_CODES], {
    message: "Selecciona un país con soporte de Mercado Pago",
  })
  countryCode!: string;
}
