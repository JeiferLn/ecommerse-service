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
const PAYMENT_METHODS = ["debit_card", "credit_card", "bank_transfer"] as const;

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

  @IsArray({ message: "Los métodos de pago deben ser una lista" })
  @ArrayUnique({ message: "Hay métodos de pago duplicados" })
  @IsIn(PAYMENT_METHODS, {
    each: true,
    message: "Método de pago inválido",
  })
  paymentMethods!: Array<(typeof PAYMENT_METHODS)[number]>;

  @IsArray({ message: "Las transportadoras deben ser una lista" })
  @ArrayUnique({ message: "Hay transportadoras duplicadas" })
  @ArrayMaxSize(20, { message: "Máximo 20 transportadoras" })
  @IsString({ each: true, message: "Cada transportadora debe ser texto" })
  @MaxLength(80, { each: true, message: "Cada transportadora máx. 80 caracteres" })
  shippingCarriers!: string[];

  @IsArray({ message: "Los bancos deben ser una lista" })
  @ArrayUnique({ message: "Hay bancos duplicados" })
  @ArrayMaxSize(20, { message: "Máximo 20 bancos" })
  @IsString({ each: true, message: "Cada banco debe ser texto" })
  @MaxLength(80, { each: true, message: "Cada banco máx. 80 caracteres" })
  banks!: string[];
}
