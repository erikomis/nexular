"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const core_1 = require("../src/app/core");
(0, vitest_1.describe)('signals', () => {
    (0, vitest_1.it)('should update signal value', () => {
        const count = (0, core_1.signal)(1);
        count.set(2);
        (0, vitest_1.expect)(count()).toBe(2);
    });
    (0, vitest_1.it)('should compute derived values', () => {
        const name = (0, core_1.signal)('Nexular');
        const greeting = (0, core_1.computed)(() => `Hello ${name()}`);
        (0, vitest_1.expect)(greeting()).toBe('Hello Nexular');
        name.set('Framework');
        (0, vitest_1.expect)(greeting()).toBe('Hello Framework');
    });
});
