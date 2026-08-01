import { IsString, MaxLength, MinLength } from "class-validator";

export class RegisterInvitedDto {
  @IsString()
  @MinLength(2, { message: "El nombre debe tener al menos 2 caracteres" })
  @MaxLength(100, { message: "El nombre no puede exceder 100 caracteres" })
  name!: string;

  @IsString()
  @MinLength(8, { message: "La contraseña debe tener al menos 8 caracteres" })
  @MaxLength(72, { message: "La contraseña no puede exceder 72 caracteres" })
  password!: string;

  @IsString()
  @MinLength(16, { message: "Token de invitación inválido" })
  token!: string;
}
