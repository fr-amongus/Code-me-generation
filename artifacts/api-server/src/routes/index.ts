import { Router, type IRouter } from "express";
import healthRouter from "./health";
import generateRouter from "./generate";
import projectsRouter from "./projects";
import projectChatRouter from "./project-chat";

const router: IRouter = Router();

router.use(healthRouter);
router.use(generateRouter);
router.use(projectsRouter);
router.use(projectChatRouter);

export default router;
