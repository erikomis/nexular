"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const core_1 = require("../src/app/core");
const app_routes_1 = require("../src/app/app.routes");
(0, vitest_1.describe)('Router', () => {
    (0, vitest_1.it)('should navigate to home component', async () => {
        const router = new core_1.Router(app_routes_1.routes);
        const routeComponent = await router.navigate('/');
        (0, vitest_1.expect)(routeComponent).toBeDefined();
    });
    (0, vitest_1.it)('should lazy load module route', async () => {
        const router = new core_1.Router(app_routes_1.routes);
        const loaded = await router.navigate('/login');
        (0, vitest_1.expect)(loaded).toBeDefined();
    });
});
