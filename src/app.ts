import express, { Request, Response } from "express";

const app = express();

app.use(express.json());

app.get("/", (_req: Request, res: Response) => {
  res.json({ message: "Hello from web4-service!" });
});

app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

export default app;
