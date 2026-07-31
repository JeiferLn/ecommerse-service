import { IsString, MaxLength, MinLength } from 'class-validator';

export class AcceptInviteDto {
  @IsString()
  @MinLength(20)
  token: string;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password: string;
}
