import { Router } from 'express';
import { submitBugReport } from './reports.controller';

export const reportsRouter = Router();

reportsRouter.post('/bug', submitBugReport);
