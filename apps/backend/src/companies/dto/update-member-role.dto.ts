import { IsIn } from "class-validator";

export class UpdateMemberRoleDto {
  @IsIn(["user", "manager"], {
    message: "El rol debe ser usuario o manager",
  })
  role!: "user" | "manager";
}
