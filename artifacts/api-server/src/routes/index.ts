import { Router, type IRouter } from "express";
import healthRouter from "./health";
import generateRouter from "./generate";
import projectsRouter from "./projects";
import projectChatRouter from "./project-chat";
import authRouter from "./auth";
import storageRouter from "./storage";
import projectVersionsRouter from "./project-versions";
import projectAttachmentsRouter from "./project-attachments";
import projectToolsRouter from "./project-tools";
import projectMemoryRouter from "./project-memory";
import projectSecretsRouter from "./project-secrets";

const router: IRouter = Router();

router.use(healthRouter);
router.use(generateRouter);
router.use(projectsRouter);
router.use(projectChatRouter);
router.use(authRouter);
router.use(storageRouter);
router.use(projectVersionsRouter);
router.use(projectAttachmentsRouter);
router.use(projectToolsRouter);
router.use(projectMemoryRouter);
router.use(projectSecretsRouter);

export default router;
