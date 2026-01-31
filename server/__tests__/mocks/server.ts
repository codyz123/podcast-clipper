import { setupServer } from "msw/node";
import { handlers } from "./handlers.js";

/**
 * MSW server for intercepting HTTP requests during tests
 */
export const server = setupServer(...handlers);
