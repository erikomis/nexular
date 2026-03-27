"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const home_component_1 = require("../src/app/modules/home/home.component");
const core_1 = require("../src/app/core");
(0, vitest_1.describe)('HomeComponent', () => {
    (0, vitest_1.it)('should render title', () => {
        const comp = new home_component_1.HomeComponent();
        (0, vitest_1.expect)(comp.title()).toBe('Hello World');
    });
    (0, vitest_1.it)('should render template with interpolation', () => {
        const html = (0, core_1.renderComponent)(home_component_1.HomeComponent);
        (0, vitest_1.expect)(html).toContain('Hello World');
    });
});
