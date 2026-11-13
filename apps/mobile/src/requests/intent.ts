import { cityLocation } from "@omini/shared";
import type { Href } from "expo-router";
import { isRequestId } from "./api";
export interface RequestIntent {
  requestProvider?: string;
  requestService?: string;
  requestCity?: string;
  requestState?: string;
  requestId?: string;
  requestSide?: "client" | "provider";
  requestReturn?: "sent" | "received";
}
export function requestIntent(params: Record<string, unknown>): RequestIntent {
  if (isRequestId(params.requestProvider)) {
    const location = cityLocation({
      city: params.requestCity,
      state: params.requestState,
    });
    return {
      ...(location
        ? { requestCity: location.city, requestState: location.state }
        : {}),
      requestProvider: params.requestProvider,
      ...(isRequestId(params.requestService)
        ? { requestService: params.requestService }
        : {}),
    };
  }
  if (
    isRequestId(params.requestId) &&
    (params.requestSide === "client" || params.requestSide === "provider")
  )
    return { requestId: params.requestId, requestSide: params.requestSide };
  if (params.requestReturn === "sent" || params.requestReturn === "received")
    return { requestReturn: params.requestReturn };
  return {};
}
export function requestAuthReturn(
  params: Record<string, unknown>,
): Href | null {
  const intent = requestIntent(params);
  if (intent.requestProvider)
    return {
      pathname: "/service-request/new",
      params: {
        providerId: intent.requestProvider,
        ...(intent.requestCity && intent.requestState
          ? { city: intent.requestCity, state: intent.requestState }
          : {}),
        ...(intent.requestService ? { serviceId: intent.requestService } : {}),
      },
    };
  if (intent.requestId || intent.requestReturn)
    return { pathname: "/service-request/resume", params: { ...intent } };
  return null;
}
