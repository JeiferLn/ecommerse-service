import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateIf,
} from "class-validator";

const SHIPPING_SCOPES = ["local", "national", "international"] as const;

export class UpdateCompanyCommerceDto {
  @IsOptional()
  @ValidateIf((_, value) => value != null && value !== "")
  @IsString()
  @Matches(/^[A-Z]{2}$/, { message: "Selecciona un país válido" })
  countryCode?: string | null;

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
