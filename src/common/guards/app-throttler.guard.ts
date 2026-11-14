import { ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ThrottlerGuard, type ThrottlerLimitDetail } from '@nestjs/throttler';

@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  protected async throwThrottlingException(
    context: ExecutionContext,
    throttlerLimitDetail: ThrottlerLimitDetail,
  ): Promise<void> {
    const retryAfter = Math.max(1, Number(throttlerLimitDetail?.timeToBlockExpire ?? throttlerLimitDetail?.timeToExpire ?? 60));
    const minutes = Math.ceil(retryAfter / 60);
    const waitLabel = minutes >= 5 ? '5 minutos' : minutes > 1 ? `${minutes} minutos` : `${retryAfter} segundos`;
    const message = `Demasiados intentos. Esperá ${waitLabel} para volver a intentar.`;
    throw new HttpException(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        error: 'Too Many Requests',
        message,
        retryAfter,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
