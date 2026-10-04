/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Authorization, RBAC Matrix, and Standardized HTTP Error Classes
 */

export type UserRole = 'citizen' | 'crew_leader' | 'coordinator' | 'admin';
export type SubscriptionPlan = 'pilot' | 'standard' | 'enterprise';

export interface AuthContext {
  userId: string;
  organizationId: string;
  role: UserRole;
  subscriptionPlan: SubscriptionPlan;
}

/** An error the API reports to the client as-is: status, machine-readable code, and message. */
export class HttpError extends Error {
  statusCode: number;
  code: string;
  details: unknown[];

  constructor(statusCode: number, code: string, message: string, details: unknown[] = []) {
    super(message);
    this.name = 'HttpError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export class ForbiddenError extends HttpError {
  constructor(message = 'Access forbidden for your current role or tenant.') {
    super(403, 'FORBIDDEN', message);
  }
}

export class NotFoundError extends HttpError {
  constructor(message = 'Resource not found.') {
    super(404, 'NOT_FOUND', message);
  }
}

export type Action =
  | 'missions:list'
  | 'missions:read'
  | 'missions:create'
  | 'missions:update'
  | 'missions:delete'
  | 'missions:claim'
  | 'reaches:adopt'
  | 'incidents:manage'
  | 'fhir:approve'
  | 'billing:manage'
  | 'users:manage'
  | 'jobs:read';

/**
 * Checks whether the authenticated user has permission to perform an action on a resource.
 */
export function can(auth: AuthContext, action: Action, resource?: { organizationId?: string }): boolean {
  // 1. Strict Tenant Boundary Check
  if (resource?.organizationId && resource.organizationId !== auth.organizationId) {
    return false;
  }

  // 2. Action RBAC Rules
  switch (action) {
    case 'missions:list':
    case 'missions:read':
      return true; // Any authenticated tenant user

    case 'missions:claim':
      return auth.role === 'citizen' || auth.role === 'crew_leader';

    case 'missions:create':
    case 'missions:update':
    case 'missions:delete':
    case 'incidents:manage':
    case 'fhir:approve':
    case 'users:manage':
    case 'jobs:read':
      return auth.role === 'coordinator' || auth.role === 'admin';

    case 'reaches:adopt':
      return auth.role === 'crew_leader' || auth.role === 'coordinator' || auth.role === 'admin';

    case 'billing:manage':
      return auth.role === 'admin';

    default:
      return false;
  }
}
