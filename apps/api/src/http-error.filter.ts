import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from "@nestjs/common";
@Catch()
export class HttpErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpErrorFilter.name);
  catch(error: unknown, host: ArgumentsHost) {
    const status = error instanceof HttpException ? error.getStatus() : 500;
    if (status === 500) this.logger.error("Unhandled application error");
    const response = host.switchToHttp().getResponse();
    response.status(status).json({
      statusCode: status,
      message:
        status === 500
          ? "Internal server error"
          : error instanceof HttpException
            ? error.message
            : "Request failed",
      timestamp: new Date().toISOString(),
    });
  }
}
