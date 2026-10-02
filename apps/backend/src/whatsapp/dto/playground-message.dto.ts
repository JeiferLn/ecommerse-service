import { IsOptional, IsString, Matches, MaxLength } from "class-validator";

import { SendMessageDto } from "./send-message.dto";

export class PlaygroundMessageDto extends SendMessageDto {
  /** Acción del botón u opción que tocó el cliente de prueba (ej. `cart:checkout`). */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Matches(/^[a-z]+:[a-z0-9_-]+$/i, { message: "Acción inválida" })
  actionId?: string;
}
