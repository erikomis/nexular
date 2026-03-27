module.exports = {
  name: "role-header",
  register(service) {
    service.register({
      name: "role-header",
      authorize(ctx, options) {
        const requiredRole = String((options && options.role) || "admin");
        const role =
          (ctx.request &&
            ctx.request.headers &&
            ctx.request.headers["x-role"]) ||
          "";

        if (role !== requiredRole) {
          return { ok: false, reason: "Required role not present" };
        }

        return { ok: true };
      },
    });
  },
};
