import { IsBoolean, IsOptional, IsString, MinLength } from "class-validator";

export class UpsertMercadoPagoConnectionDto {
  @IsString()
  @MinLength(10, { message: "Access Token inválido" })
  accessToken!: string;

  @IsOptional()
  @IsString()
  publicKey?: string | null;
}

export class MercadoPagoOAuthStartDto {
  /** Reservado por si el cliente quiere forzar test_token en el futuro. */
  @IsOptional()
  @IsBoolean()
  testToken?: boolean;
}
