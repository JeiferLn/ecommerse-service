import { IsBoolean, IsOptional, IsString, Matches, MinLength } from "class-validator";

export class UpsertWhatsAppConnectionDto {
  /** E.164 con +: +14155238886 o +573001112233 */
  @IsString()
  @MinLength(8, { message: "Indica el número WhatsApp de Twilio" })
  @Matches(/^\+[1-9]\d{7,14}$/, {
    message: "Usa formato E.164 con +: +14155238886",
  })
  twilioWhatsAppNumber!: string;

  @IsOptional()
  @IsString()
  displayPhoneNumber?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
