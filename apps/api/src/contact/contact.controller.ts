import {
  Body,
  Controller,
  Get,
  Header,
  Inject,
  Param,
  Patch,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { AuthUser } from "@omini/shared";
import { AccessGuard, CurrentUser } from "../auth/auth.guard";
import { contactSchema, parseInput } from "../auth/auth.validation";
import { requestIdSchema } from "../requests/validation";
import { ContactService } from "./contact.service";
import { ContactRateGuard } from "./contact-rate.guard";
@ApiTags("contact")
@ApiBearerAuth()
@UseGuards(AccessGuard, ContactRateGuard)
@Controller()
export class ContactController {
  constructor(
    @Inject(ContactService) private readonly service: ContactService,
  ) {}
  @Get("me/contact")
  @Header("Cache-Control", "no-store")
  @ApiOperation({ summary: "Contato privado da própria conta" })
  own(@CurrentUser() user: AuthUser) {
    return this.service.own(user.id);
  }
  @Patch("me/contact")
  @Header("Cache-Control", "no-store")
  @ApiOperation({
    summary: "Atualizar celular e consentimento da própria conta",
  })
  @ApiBody({
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["phone", "hasWhatsapp", "shareContact"],
      properties: {
        phone: {
          type: "string",
          description: "Celular brasileiro com DDD; normalizado em E.164",
        },
        hasWhatsapp: { type: "boolean" },
        shareContact: {
          type: "boolean",
          description:
            "Contato liberado apenas ao prestador que aceitar, enquanto o atendimento estiver aberto.",
        },
      },
    },
  })
  update(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.service.update(user.id, parseInput(contactSchema, body));
  }
  @Get("requests/:id/contact")
  @Header("Cache-Control", "no-store")
  @ApiOperation({
    summary:
      "Apenas o prestador original; aceita/em andamento/aguardando confirmação; exige consentimento atual",
  })
  contact(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.request(user.id, parseInput(requestIdSchema, id));
  }
}
