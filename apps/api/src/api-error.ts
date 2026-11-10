import { HttpException } from "@nestjs/common";
export class ApiError extends HttpException {
  constructor(
    status: number,
    public readonly code: string,
    message: string,
    public readonly fields: string[] = [],
    public readonly retryAfterSeconds?: number,
  ) {
    super(message, status);
  }
}
