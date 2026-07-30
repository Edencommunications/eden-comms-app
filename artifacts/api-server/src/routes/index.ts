import { Router, type IRouter } from "express";
import healthRouter from "./health";
import recipeDetailsRouter from "./recipeDetails";
import ghlIntakeRouter from "./ghlIntake";
import authRouter from "./auth";
import bulkImportRouter from "./bulkImport";

const router: IRouter = Router();

router.use(healthRouter);
router.use(recipeDetailsRouter);
router.use(ghlIntakeRouter);
router.use(authRouter);
router.use(bulkImportRouter);

export default router;
