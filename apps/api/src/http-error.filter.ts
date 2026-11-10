import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from "@nestjs/common";
import { ApiError } from "./api-error";
@Catch()
export class HttpErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpErrorFilter.name);
  catch(error: unknown, host: ArgumentsHost) {
    const parserType =
      error && typeof error === "object" && "type" in error ? error.type : null;
    const status =
      error instanceof HttpException
        ? error.getStatus()
        : parserType === "entity.parse.failed"
          ? 400
          : parserType === "entity.too.large"
            ? 413
            : 500;
    if (status === 500) this.logger.error("Unhandled application error");
    const safeMessages: Record<number, string> = {
      400: "Requisição inválida.",
      401: "Não autorizado.",
      403: "Acesso negado.",
      404: "Recurso não encontrado.",
      413: "Requisição muito grande.",
      429: "Muitas tentativas.",
      503: "Serviço temporariamente indisponível.",
    };
    const response = host.switchToHttp().getResponse();
    if (error instanceof ApiError && error.retryAfterSeconds)
      response.setHeader("Retry-After", String(error.retryAfterSeconds));
    response
      .status(status)
      .json({
        statusCode: status,
        code: error instanceof ApiError ? error.code : `HTTP_${status}`,
        fields: error instanceof ApiError ? error.fields : [],
        message:
          error instanceof ApiError
            ? error.message
            : (safeMessages[status] ?? "Erro interno do servidor."),
        timestamp: new Date().toISOString(),
      });
  }
}
