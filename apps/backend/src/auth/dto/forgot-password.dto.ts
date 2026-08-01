import { IsEmail } from "class-validator";

export class ForgotPasswordDto {
  @IsEmail({}, { message: "Ingresa un email válido" })
  email!: string;
}
