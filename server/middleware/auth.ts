import { Request, Response, NextFunction } from "express";

export const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const accessCode = req.headers["x-access-code"] as string;
  const expectedCode = process.env.ACCESS_CODE;

  if (!expectedCode) {
    console.error("ACCESS_CODE environment variable not set");
    res.status(500).json({ error: "Server misconfigured" });
    return;
  }

  if (!accessCode) {
    res.status(401).json({ error: "Access code required" });
    return;
  }

  if (accessCode !== expectedCode) {
    res.status(403).json({ error: "Invalid access code" });
    return;
  }

  next();
};
