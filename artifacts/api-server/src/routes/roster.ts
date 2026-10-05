import { Router } from "express";
// The imported validation and roster rules are kept intact.
// @ts-ignore imported JavaScript package
import { handle } from "@workspace/roster/server";

const router = Router();

// Serialize local read/modify/write operations, as the original store uses JSON.
let pending: Promise<void> = Promise.resolve();
router.all("/roster", (req, res, next) => {
  const request = pending.then(async () => {
    const out = await handle({
      method: req.method,
      query: req.query,
      body: req.body,
    });
    res.setHeader("Cache-Control", "no-store");
    res.status(out.status).json(out.json);
  });
  pending = request.catch((err) => {
    req.log.error({ err }, "Roster request failed");
    next(err);
  });
});

export default router;