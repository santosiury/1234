import {
  Inject,
  Injectable,
  Logger,
  type OnModuleInit,
  type OnModuleDestroy,
} from "@nestjs/common";
import { ProtectedReviewsService } from "./protected-reviews.service";
@Injectable()
export class ReviewPublisher implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  private readonly logger = new Logger(ReviewPublisher.name);
  constructor(
    @Inject(ProtectedReviewsService)
    private readonly service: ProtectedReviewsService,
  ) {}
  onModuleInit() {
    if (!this.service.enabled) return;
    this.timer = setInterval(() => {
      void this.tick();
    }, 60000);
    this.timer.unref();
  }
  async tick() {
    if (this.running || !this.service.enabled) return;
    this.running = true;
    try {
      await this.service.publishDue();
    } catch {
      this.logger.error(
        "Publicação protegida temporariamente indisponível; nova tentativa agendada.",
      );
    } finally {
      this.running = false;
    }
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
}
