import {
  HTTPFacilitatorClient,
  type RouteConfig,
  type RoutesConfig,
} from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import type { RequestHandler } from "express";
import type { PaidRouteDefinition } from "./agentServices";

interface CreateX402MiddlewareOptions {
  syncFacilitatorOnStart?: boolean;
}

const toRoutesConfig = (
  paidRoutes: PaidRouteDefinition[],
  network: string
): RoutesConfig =>
  paidRoutes.reduce<Record<string, RouteConfig>>((accumulator, route) => {
    const routeKey = `${route.method} ${route.path}`;
    accumulator[routeKey] = {
      accepts: {
        scheme: route.payment.scheme,
        network: route.payment.network,
        payTo: route.payment.payTo,
        price: route.payment.price,
      },
      description: route.description,
      unpaidResponseBody: () => ({
        contentType: "application/json",
        body: {
          error: "payment_required",
          note: "This endpoint uses x402. Pay and retry the same request.",
          network,
          price: route.payment.price,
          payTo: route.payment.payTo,
        },
      }),
    };
    return accumulator;
  }, {});

export const createX402PaymentMiddleware = (
  paidRoutes: PaidRouteDefinition[],
  options?: CreateX402MiddlewareOptions
): RequestHandler => {
  const network = (
    process.env.X402_NETWORK ?? "eip155:84532"
  ) as `${string}:${string}`;
  const facilitatorUrl =
    process.env.X402_FACILITATOR_URL ?? "https://x402.org/facilitator";

  const facilitatorClient = new HTTPFacilitatorClient({
    url: facilitatorUrl,
  });

  const server = new x402ResourceServer(facilitatorClient).register(
    network,
    new ExactEvmScheme()
  );

  return paymentMiddleware(
    toRoutesConfig(paidRoutes, network),
    server,
    undefined,
    undefined,
    options?.syncFacilitatorOnStart ?? true
  );
};
