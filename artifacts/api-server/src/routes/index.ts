import { Router, type IRouter } from "express";
import healthRouter from "./health";
import recipeDetailsRouter from "./recipeDetails";
import ghlIntakeRouter from "./ghlIntake";

const router: IRouter = Router();

router.use(healthRouter);
router.use(recipeDetailsRouter);
router.use(ghlIntakeRouter);

export default router;
