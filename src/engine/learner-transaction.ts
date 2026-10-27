// Learner transaction control, translated onto savepoints inside the grader's own rolled-back transaction.
// The learner never reaches a real COMMIT or ROLLBACK of the grader's transaction, so nothing a learner
// does survives the run. Errors follow PostgreSQL: a failed statement aborts the learner's block until it
// ends, and only ROLLBACK, ROLLBACK TO, or the end of the block are accepted.

const BLOCK = 'desk_learner_block';
const userName = (name: string) => `desk_user_${name}`;

export class LearnerTransactionError extends Error {
  constructor(readonly sqlstate: string, message: string) {
    super(message);
  }
}

export class LearnerTransaction {
  private open = false;
  private aborted = false;
  // Innermost last. The block savepoint is never in this list; it is always BLOCK.
  private readonly stack: string[] = [];

  /** SQL to run for BEGIN. A second BEGIN inside a block does nothing, as in PostgreSQL. */
  begin(): string[] {
    if (this.open) return [];
    this.open = true;
    this.aborted = false;
    return [`SAVEPOINT ${BLOCK}`];
  }

  /** COMMIT keeps the block's changes inside the wrapper. In an aborted block, COMMIT rolls back, as in PostgreSQL. */
  commit(): string[] {
    if (!this.open) return [];
    const wasAborted = this.aborted;
    this.end();
    return wasAborted ? [`ROLLBACK TO SAVEPOINT ${BLOCK}`, `RELEASE SAVEPOINT ${BLOCK}`] : [`RELEASE SAVEPOINT ${BLOCK}`];
  }

  rollback(): string[] {
    if (!this.open) return [];
    this.end();
    return [`ROLLBACK TO SAVEPOINT ${BLOCK}`, `RELEASE SAVEPOINT ${BLOCK}`];
  }

  savepoint(name: string): string[] {
    this.requireBlock();
    this.requireNotAborted();
    this.stack.push(name);
    return [`SAVEPOINT ${userName(name)}`];
  }

  rollbackTo(name: string): string[] {
    this.requireBlock();
    const index = this.stack.lastIndexOf(name);
    if (index < 0) throw new LearnerTransactionError('3B001', `Savepoint "${name}" does not exist.`);
    this.stack.length = index + 1;
    this.aborted = false;
    return [`ROLLBACK TO SAVEPOINT ${userName(name)}`];
  }

  release(name: string): string[] {
    this.requireBlock();
    this.requireNotAborted();
    const index = this.stack.lastIndexOf(name);
    if (index < 0) throw new LearnerTransactionError('3B001', `Savepoint "${name}" does not exist.`);
    this.stack.length = index;
    return [`RELEASE SAVEPOINT ${userName(name)}`];
  }

  /**
   * Call after a learner statement fails. The grader must roll back to the innermost savepoint to keep its own
   * transaction usable, but that rollback keeps the savepoint, so ROLLBACK TO can still reach it later.
   */
  fail(): string[] {
    if (!this.open || this.aborted) return [];
    this.aborted = true;
    const innermost = this.stack.at(-1);
    return [`ROLLBACK TO SAVEPOINT ${innermost ? userName(innermost) : BLOCK}`];
  }

  /** Throws the error PostgreSQL gives for any statement, other than transaction control, in an aborted block. */
  requireNotAborted(): void {
    if (this.aborted) throw new LearnerTransactionError('25P02', 'The block is aborted. Commands are ignored until the end of the transaction block; use ROLLBACK to leave it.');
  }

  isOpen(): boolean {
    return this.open;
  }

  private requireBlock(): void {
    if (!this.open) throw new LearnerTransactionError('25P01', 'This command can only be used inside a transaction block (use BEGIN first).');
  }

  private end(): void {
    this.open = false;
    this.aborted = false;
    this.stack.length = 0;
  }
}
