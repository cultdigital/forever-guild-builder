import { Router, type IRouter } from "express";
import healthRouter from "./health";
import rosterRouter from "./roster";

const router: IRouter = Router();

router.use(healthRouter);
router.use(rosterRouter);

export default router;
