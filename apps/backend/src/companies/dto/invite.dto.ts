import { IsEmail } from "class-validator";

export class InviteDto {
  @IsEmail({}, { message: "Ingresa un email válido" })
  email!: string;
}
