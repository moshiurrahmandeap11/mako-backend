import { Router } from 'express';
import { submitContactInquiry } from './contact.controller';

export const contactRouter = Router();

contactRouter.post('/', submitContactInquiry);
