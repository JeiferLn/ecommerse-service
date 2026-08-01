import { CompanyType } from "@prisma/client";
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from "class-validator";

export class UpdateCompanyDto {
  @IsString()
  @MinLength(2, { message: "El nombre de la empresa debe tener al menos 2 caracteres" })
  @MaxLength(100, { message: "El nombre de la empresa no puede exceder 100 caracteres" })
  name!: string;

  @IsEnum(CompanyType, { message: "Selecciona un tipo de empresa válido" })
  companyType!: CompanyType;

  @IsOptional()
  @IsString({ message: "El teléfono debe ser texto" })
  @MaxLength(30, { message: "El teléfono no puede exceder 30 caracteres" })
  phone?: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== "" && value != null)
  @IsEmail({}, { message: "Ingresa un email de contacto válido" })
  @MaxLength(255, { message: "El email no puede exceder 255 caracteres" })
  contactEmail?: string;

  @IsOptional()
  @IsString({ message: "El sitio web debe ser texto" })
  @MaxLength(255, { message: "El sitio web no puede exceder 255 caracteres" })
  website?: string;

  @IsOptional()
  @IsString({ message: "La dirección debe ser texto" })
  @MaxLength(255, { message: "La dirección no puede exceder 255 caracteres" })
  address?: string;

  @IsOptional()
  @IsString({ message: "La descripción debe ser texto" })
  @MaxLength(1000, { message: "La descripción no puede exceder 1000 caracteres" })
  description?: string;
}
