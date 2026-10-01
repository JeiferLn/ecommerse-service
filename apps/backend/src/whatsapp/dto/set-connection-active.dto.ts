import { IsBoolean } from "class-validator";

export class SetConnectionActiveDto {
  @IsBoolean()
  isActive!: boolean;
}
