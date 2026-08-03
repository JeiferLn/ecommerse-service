import { IsString, MinLength } from "class-validator";

export class SendMessageDto {
  @IsString()
  @MinLength(1, { message: "El mensaje no puede estar vacío" })
  text!: string;
}
