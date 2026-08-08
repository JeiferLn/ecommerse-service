import { COMPANY_COUNTRY_CODES } from "@commerce-ai/types";
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from "class-validator";

const SHIPPING_SCOPES = ["local", "national", "international"] as const;

export class UpdateCompanyCommerceDto {
  @IsOptional()
  @ValidateIf((_, value) => value != null && value !== "")
  @IsString()
  @IsIn([...COMPANY_COUNTRY_CODES], {
    message: "Selecciona un país con soporte de Mercado Pago",
  })
  countryCode?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value != null && value !== "")
  @IsString()
  @MaxLength(120, { message: "Departamento máx. 120 caracteres" })
  shippingRegion?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value != null && value !== "")
  @IsString()
  @MaxLength(120, { message: "Municipio máx. 120 caracteres" })
  shippingCity?: string | null;

  @IsArray({ message: "Los alcances de envío deben ser una lista" })
  @ArrayUnique({ message: "Hay alcances de envío duplicados" })
  @IsIn(SHIPPING_SCOPES, {
    each: true,
    message: "Alcance de envío inválido",
  })
  shippingScopes!: Array<(typeof SHIPPING_SCOPES)[number]>;

  @IsArray({ message: "Las transportadoras deben ser una lista" })
  @ArrayUnique({ message: "Hay transportadoras duplicadas" })
  @ArrayMaxSize(20, { message: "Máximo 20 transportadoras" })
  @IsString({ each: true, message: "Cada transportadora debe ser texto" })
  @MaxLength(80, { each: true, message: "Cada transportadora máx. 80 caracteres" })
  shippingCarriers!: string[];
}
