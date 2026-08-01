import { IsString, MinLength } from "class-validator";

export class AcceptInvitationDto {
  @IsString()
  @MinLength(16, { message: "Token de invitación inválido" })
  token!: string;
}
