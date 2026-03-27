import { continueRequest, type RouteMiddleware } from "../core/server-actions";

export const middleware: RouteMiddleware = () => continueRequest();
