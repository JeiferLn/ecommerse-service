import { IsNotEmpty, IsString } from "class-validator";

export class SwitchCompanyDto {
  @IsString()
  @IsNotEmpty({ message: "Selecciona una empresa" })
  companyId!: string;
}
