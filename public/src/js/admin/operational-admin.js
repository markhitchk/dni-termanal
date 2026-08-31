// Canonical implementation lives at ../operational-admin.js because the Rocky/LAMP
// build copies that source to public/dist/operational-admin.js. Keep this organized
// module as a thin compatibility entrypoint so the two admin source layouts cannot
// drift on security validation or clearance policy behavior.
import '../operational-admin.js';
