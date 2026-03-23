export function verifySuperadmin(req, res, next) {
  const { adminSecret } = req.headers;

  if (!adminSecret || adminSecret !== process.env.SUPERADMIN_SECRET) {
    return res.status(403).json({ error: "Unauthorized" });
  }

  next();
}