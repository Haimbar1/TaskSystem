// Every tenant-scoped route runs after this: req.user is already set by
// passport, we just lift the right tenant_id onto the request. Normal users
// are always locked to their own tenant_id. A super admin can instead be
// "looking at" a different business — see routes/authRoutes.js's
// switch-tenant endpoint, which sets req.session.activeTenantId.
export function requireTenant(req, res, next) {
  if (!req.user?.tenant_id) {
    return res.status(401).json({ error: 'No tenant on user' });
  }
  req.tenantId =
    req.user.is_super_admin && req.session.activeTenantId
      ? req.session.activeTenantId
      : req.user.tenant_id;
  next();
}
