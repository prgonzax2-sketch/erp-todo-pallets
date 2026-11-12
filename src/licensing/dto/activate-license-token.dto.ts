import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class ActivateLicenseTokenDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(16000)
  licenseToken: string;
}
