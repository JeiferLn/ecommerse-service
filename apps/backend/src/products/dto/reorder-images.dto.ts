import { ArrayMinSize, IsArray, IsString } from "class-validator";

export class ReorderImagesDto {
  @IsArray({ message: "Debes enviar un listado de imágenes" })
  @ArrayMinSize(1, { message: "Debes enviar al menos una imagen" })
  @IsString({ each: true, message: "Cada id de imagen debe ser texto" })
  imageIds!: string[];
}
