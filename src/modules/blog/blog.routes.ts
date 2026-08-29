import { Router } from 'express';
import { getPublicBlogs, getPublicBlogBySlug, getPublicBlogCategories } from './blog.controller';

export const blogRouter = Router();

blogRouter.get('/', getPublicBlogs);
blogRouter.get('/categories', getPublicBlogCategories);
blogRouter.get('/:slug', getPublicBlogBySlug);
