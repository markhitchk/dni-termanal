export const STAR_COMMS_API = Object.freeze({
  docsUrl: 'https://star-comms.org/api-docs.html',
  basePath: '/api/v1',
  auth: 'SERVER-SIDE OWNER BEARER KEY',
  endpoints: Object.freeze({
    openapi: { method: 'GET', path: '/api/v1/openapi.json', scope: 'none' },
    status: { method: 'GET', path: '/api/v1/status', scope: 'read:status' },
    roster: { method: 'GET', path: '/api/v1/roster', scope: 'read:roster' },
    assignments: { method: 'GET', path: '/api/v1/assignments', scope: 'read:assignments' },
    assignmentWrite: { method: 'POST', path: '/api/v1/assignments', scope: 'write:assignments' },
    netsCreate: { method: 'POST', path: '/api/v1/nets', scope: 'write:nets' },
    operation: { method: 'POST', path: '/api/v1/operation', scope: 'write:operation' },
    readyChecks: { method: 'GET', path: '/api/v1/ready-checks', scope: 'read:ready-checks' },
    readyCheckCreate: { method: 'POST', path: '/api/v1/ready-checks', scope: 'write:ready-checks' },
    readyCheckStart: { method: 'POST', path: '/api/v1/ready-checks/start', scope: 'write:ready-checks' },
    acars: { method: 'POST', path: '/api/v1/acars', scope: 'write:acars' },
    stream: { method: 'GET', path: '/api/v1/stream', scope: 'read:events', transport: 'SSE' },
    metrics: { method: 'GET', path: '/api/v1/metrics', scope: 'read:metrics' },
    publicToken: { method: 'GET', path: '/api/v1/public-token', scope: 'read:status' }
  })
});

export function buildAssignmentBody(userId, netUid, action = 'assign') {
  return { userId: String(userId), netUid: String(netUid), action };
}

export function buildNetCreateBody(name) {
  return { name: String(name).trim() };
}

export function buildReadyCheckTemplateBody(name = 'DNI Ready Check') {
  return {
    name,
    message: 'Report ready for DNI operations.',
    color: '#34CD84',
    target: { everyone: true }
  };
}

export function buildReadyCheckStartBody(templateId, initiatorName = 'DNI Ops') {
  return { templateId: String(templateId), initiatorName };
}

export function buildAcarsBody(text, senderName = 'DNI Ops') {
  return { text: String(text).trim(), senderName };
}
