import { IsIn } from "class-validator";

export class UpdateConversationHandlerDto {
  @IsIn(["bot", "human"], { message: "handler debe ser bot o human" })
  handler!: "bot" | "human";
}
