import { IsBoolean, IsOptional, IsString, MinLength, ValidateIf } from "class-validator";

export class UpsertWhatsAppConnectionDto {
  @IsString()
  @MinLength(1, { message: "phoneNumberId es obligatorio" })
  phoneNumberId!: string;

  /** Obligatorio al crear; opcional al actualizar (se conserva el existente). */
  @IsOptional()
  @ValidateIf((_, value) => value !== undefined && value !== null && value !== "")
  @IsString()
  @MinLength(1, { message: "accessToken es obligatorio" })
  accessToken?: string;

  @IsOptional()
  @IsString()
  wabaId?: string;

  @IsOptional()
  @IsString()
  displayPhoneNumber?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
