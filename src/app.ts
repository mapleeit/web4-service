import express, { Request, Response } from "express";
import {
  buildAgentManifest,
  buildPaymentRequiredPayload,
  buildPaymentResponsePayload,
  getAgentServiceDescriptor,
  invokeAgentService,
  listAgentServices,
  PAYMENT_REQUIRED_HEADER,
  PAYMENT_RESPONSE_HEADER,
  PAYMENT_SIGNATURE_HEADER,
  toBase64Json,
  verifyPaymentSignature,
} from "./agentServices";

const app = express();

app.use(express.json());

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

app.get("/", (_req: Request, res: Response) => {
  res.json({ message: "Hello from web4-service!" });
});

app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

app.get("/agent/services", (_req: Request, res: Response) => {
  res.json({
    protocol: "x402-ready",
    services: listAgentServices(),
  });
});

app.get("/.well-known/agent-services", (req: Request, res: Response) => {
  res.json(buildAgentManifest(resolveBaseUrl(req)));
});

app.post("/agent/services/:serviceId/invoke", (req: Request, res: Response) => {
  const { serviceId } = req.params;
  const service = getAgentServiceDescriptor(serviceId);

  if (!service) {
    res.status(404).json({ error: "service_not_found", serviceId });
    return;
  }

  if (service.payment) {
    const paymentSignature = req.get(PAYMENT_SIGNATURE_HEADER) ?? "";
    if (!verifyPaymentSignature(paymentSignature)) {
      const paymentRequired = buildPaymentRequiredPayload(serviceId);
      if (paymentRequired) {
        res.setHeader(PAYMENT_REQUIRED_HEADER, toBase64Json(paymentRequired));
      }

      res.status(402).json({
        error: "payment_required",
        serviceId,
        payment: paymentRequired,
      });
      return;
    }

    const paymentResponse = buildPaymentResponsePayload(
      serviceId,
      paymentSignature
    );
    if (paymentResponse) {
      res.setHeader(PAYMENT_RESPONSE_HEADER, toBase64Json(paymentResponse));
    }
  }

  const output = invokeAgentService(serviceId, toInputPayload(req.body));
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
});

export default app;
