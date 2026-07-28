import { Router, type IRouter } from "express";
import healthRouter from "./health";
import recipeDetailsRouter from "./recipeDetails";

const router: IRouter = Router();

router.use(healthRouter);
router.use(recipeDetailsRouter);

export default router;
