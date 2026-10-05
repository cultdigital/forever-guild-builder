import { Router } from "express";
// The imported validation and roster rules are kept intact.
// @ts-ignore imported JavaScript package
import { handle } from "@workspace/roster/server";
// @ts-ignore imported JavaScript package
import { handleSplits } from "@workspace/roster/splits";

const router = Router();

// Serialize local read/modify/write operations, as the original store uses JSON.
let pending: Promise<void> = Promise.resolve();
router.all(["/roster", "/roster/splits"], (req, res, next) => {
  const request = pending.then(async () => {
    const handler = req.path === "/roster/splits" ? handleSplits : handle;
    const out = await handler({
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