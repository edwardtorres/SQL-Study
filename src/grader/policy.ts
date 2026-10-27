import type { Policy } from '../core/types';

export { statementKinds } from '../core/types';
export type { Policy, StatementKind } from '../core/types';

export const readPolicy: Policy = { allow: ['SelectStmt'] };

// Learner-facing reasons for kinds that no ticket may use. Other kinds get a generic sentence.
const reasons: Readonly<Record<string, string>> = {
  VariableSetStmt: 'SET changes session settings, which tickets do not allow.',
  VariableShowStmt: 'SHOW reads session settings, which tickets do not expose.',
  DoStmt: 'DO runs procedural code, which tickets do not allow.',
  CopyStmt: 'COPY reads or writes files, which tickets do not allow.',
  CreateRoleStmt: 'Roles belong to the server, not to a ticket.',
  GrantStmt: 'Permissions are not part of a ticket.',
  LockStmt: 'LOCK affects other sessions, and tickets run alone.',
  VacuumStmt: 'VACUUM maintains the server, which tickets do not control.',
  PrepareStmt: 'PREPARE keeps a statement in the session; tickets run each statement directly.',
  ExecuteStmt: 'EXECUTE runs a prepared statement from the session, which tickets do not keep.',
  ListenStmt: 'LISTEN needs a session that stays open, which tickets do not have.',
  NotifyStmt: 'NOTIFY needs a listening session, which tickets do not have.',
  ViewStmt: 'Views are not part of this ticket.',
  TransactionStmt: 'Transaction control (BEGIN, COMMIT, ROLLBACK, SAVEPOINT) is not part of this ticket.',
};

export function notAllowedMessage(kind: string): string {
  return reasons[kind] ?? `${kind.replace(/Stmt$/, '').toLowerCase()} statements are not allowed in this ticket.`;
}
