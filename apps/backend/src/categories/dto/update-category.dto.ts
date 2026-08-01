import { IsString, MaxLength, MinLength } from "class-validator";

export class UpdateCategoryDto {
  @IsString()
  @MinLength(2, { message: "El nombre debe tener al menos 2 caracteres" })
  @MaxLength(100, { message: "El nombre no puede exceder 100 caracteres" })
  name!: string;
}
