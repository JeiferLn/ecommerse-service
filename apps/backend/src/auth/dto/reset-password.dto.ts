import { IsString, MaxLength, MinLength } from "class-validator";

export class ResetPasswordDto {
  @IsString()
  @MinLength(64, { message: "El enlace es inválido" })
  @MaxLength(64, { message: "El enlace es inválido" })
  token!: string;

  @IsString()
  @MinLength(8, { message: "La contraseña debe tener al menos 8 caracteres" })
  @MaxLength(72, { message: "La contraseña no puede exceder 72 caracteres" })
  password!: string;
}
