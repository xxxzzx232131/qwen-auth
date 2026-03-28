import { Router, type IRouter } from "express";
import healthRouter from "./health";
import qwenRouter from "./qwen";
import qwenRegisterRouter from "./qwen-register";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/qwen", qwenRouter);
router.use("/qwen", qwenRegisterRouter);

export default router;
