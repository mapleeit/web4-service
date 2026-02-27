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

const getRoutePaymentOptions = (
  route: PaidRouteDefinition
): PaidRouteDefinition["payment"][] =>
  route.paymentOptions && route.paymentOptions.length > 0
    ? route.paymentOptions
    : [route.payment];

const collectRegisteredNetworks = (
  paidRoutes: PaidRouteDefinition[]
): `${string}:${string}`[] => {
  const networks = new Set<`${string}:${string}`>();
  for (const route of paidRoutes) {
    for (const paymentOption of getRoutePaymentOptions(route)) {
      networks.add(paymentOption.network);
    }
  }

  return Array.from(networks);
};

const toRoutesConfig = (paidRoutes: PaidRouteDefinition[]): RoutesConfig =>
  paidRoutes.reduce<Record<string, RouteConfig>>((accumulator, route) => {
    const paymentOptions = getRoutePaymentOptions(route);
    const primaryPaymentOption = paymentOptions[0];
    const accepts = paymentOptions.map((paymentOption) => ({
      scheme: paymentOption.scheme,
      network: paymentOption.network,
      payTo: paymentOption.payTo,
      price: paymentOption.price,
    }));
    const routeKey = `${route.method} ${route.path}`;
    accumulator[routeKey] = {
      accepts: accepts.length === 1 ? accepts[0] : accepts,
      description: route.description,
      unpaidResponseBody: () => ({
        contentType: "application/json",
        body: {
          error: "payment_required",
          note: "This endpoint uses x402. Pay and retry the same request.",
          network: primaryPaymentOption.network,
          price: primaryPaymentOption.price,
          payTo: primaryPaymentOption.payTo,
          ...(paymentOptions.length > 1
            ? {
                paymentOptions: paymentOptions.map((option) => ({
                  network: option.network,
                  asset: option.asset,
                  price: option.price,
                  payTo: option.payTo,
                })),
              }
            : {}),
        },
      }),
    };
    return accumulator;
  }, {});

export const createX402PaymentMiddleware = (
  paidRoutes: PaidRouteDefinition[],
  options?: CreateX402MiddlewareOptions
): RequestHandler => {
  const networksToRegister = collectRegisteredNetworks(paidRoutes);
  const facilitatorUrl =
    process.env.X402_FACILITATOR_URL ??
    "https://api.cdp.coinbase.com/platform/v2/x402";

  const facilitatorClient = new HTTPFacilitatorClient({
    url: facilitatorUrl,
  });

  const server = new x402ResourceServer(facilitatorClient);
  for (const network of networksToRegister) {
    server.register(network, new ExactEvmScheme());
  }

  return paymentMiddleware(
    toRoutesConfig(paidRoutes),
    server,
    undefined,
    undefined,
    options?.syncFacilitatorOnStart ?? true
  );
};
