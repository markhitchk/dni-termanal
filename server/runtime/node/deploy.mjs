// Canonical DNI Node deployment bridge module.
// Re-export the protected legacy implementation so callers can migrate to the
// organized runtime path without changing behavior.
export { handleDeployRequest } from '../../dni-deploy.mjs';
