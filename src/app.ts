import path from "path";
import express, { Request, Response } from "express";
import {
  AgentServiceInputError,
  getAgentServiceDescriptor,
  invokeAgentService,
  listAgentServices,
  listPaidRouteDefinitions,
} from "./agentServices";
import {
  MissingPerplexityApiKeyError,
  PerplexityApiRequestError,
} from "./perplexitySearch";
import { createX402PaymentMiddleware } from "./x402Middleware";

export interface CreateAppOptions {
  enableX402?: boolean;
  syncFacilitatorOnStart?: boolean;
}

export const createApp = (options: CreateAppOptions = {}) => {
  const app = express();

  app.use(express.json());

  const services = listAgentServices();
  const paidRoutes = listPaidRouteDefinitions();

  const x402Enabled = options.enableX402 ?? process.env.X402_ENABLED !== "false";
  if (x402Enabled) {
    app.use(
      createX402PaymentMiddleware(paidRoutes, {
        syncFacilitatorOnStart: options.syncFacilitatorOnStart,
      })
    );
  }

  const toInputPayload = (body: unknown): Record<string, unknown> => {
    if (typeof body === "object" && body !== null && !Array.isArray(body)) {
      return body as Record<string, unknown>;
    }

    return { value: body };
  };

  const resolveBaseUrl = (req: Request): string => {
    const host = req.get("host");
    if (!host) {
      return "http://localhost:3000";
    }

    return `${req.protocol}://${host}`;
  };

  const frontendDist = path.join(__dirname, "../frontend/dist");
  app.use(express.static(frontendDist));

  app.get("/health", (_req: Request, res: Response) => {
    res.json({ status: "ok", uptime: process.uptime() });
  });

  app.get("/agent/services", (_req: Request, res: Response) => {
    res.json({
      protocol: "x402-ready",
      x402Enabled,
      services,
    });
  });

  app.get("/.well-known/agent-services", (req: Request, res: Response) => {
    const normalizedBaseUrl = resolveBaseUrl(req).replace(/\/$/, "");
    res.json({
      name: "web4-service-agent-catalog",
      protocols: ["http", "x402"],
      services: services.map((service) => ({
        ...service,
        endpoint: `${normalizedBaseUrl}${service.endpoint}`,
      })),
    });
  });

  app.post(
    "/agent/services/:serviceId/invoke",
    async (req: Request, res: Response) => {
      const rawServiceId = req.params.serviceId;
      const serviceId = Array.isArray(rawServiceId)
        ? rawServiceId[0]
        : rawServiceId;
      if (!serviceId) {
        res.status(400).json({ error: "invalid_service_id" });
        return;
      }

      const service = getAgentServiceDescriptor(serviceId);

      if (!service) {
        res.status(404).json({ error: "service_not_found", serviceId });
        return;
      }

      try {
        const output = await invokeAgentService(serviceId, toInputPayload(req.body));
        if (!output) {
          res.status(500).json({
            error: "service_execution_error",
            serviceId,
          });
          return;
        }

        res.json({
          serviceId,
          output,
        });
      } catch (error) {
        if (error instanceof AgentServiceInputError) {
          res.status(400).json({
            error: "invalid_service_input",
            serviceId,
            message: error.message,
          });
          return;
        }

        if (error instanceof MissingPerplexityApiKeyError) {
          res.status(503).json({
            error: "service_unavailable",
            serviceId,
            message: error.message,
          });
          return;
        }

        if (error instanceof PerplexityApiRequestError) {
          res.status(502).json({
            error: "upstream_request_failed",
            serviceId,
            upstreamStatusCode: error.statusCode,
          });
          return;
        }

        res.status(500).json({
          error: "service_execution_error",
          serviceId,
        });
      }
    }
  );

  app.get("{*path}", (_req: Request, res: Response) => {
    const indexPath = path.join(frontendDist, "index.html");
    res.sendFile(indexPath, (err) => {
      if (err) {
        res.status(404).json({ error: "not_found" });
      }
    });
  });

  return app;
};
