import { describe, expect, test } from 'vitest';
import { LearnerTransaction, LearnerTransactionError } from '../src/engine/learner-transaction';
import { notAllowedMessage, readPolicy } from '../src/grader/policy';

describe('learner transaction control', () => {
  test('BEGIN opens one block; a second BEGIN does nothing, as in PostgreSQL', () => {
    const tx = new LearnerTransaction();
    expect(tx.begin()).toEqual(['SAVEPOINT desk_learner_block']);
    expect(tx.begin()).toEqual([]);
    expect(tx.isOpen()).toBe(true);
  });

  test('COMMIT releases the block and keeps changes inside the wrapper; ROLLBACK undoes them', () => {
    const tx = new LearnerTransaction();
    tx.begin();
    expect(tx.commit()).toEqual(['RELEASE SAVEPOINT desk_learner_block']);
    expect(tx.isOpen()).toBe(false);
    tx.begin();
    expect(tx.rollback()).toEqual(['ROLLBACK TO SAVEPOINT desk_learner_block', 'RELEASE SAVEPOINT desk_learner_block']);
  });

  test('COMMIT and ROLLBACK outside a block do nothing', () => {
    const tx = new LearnerTransaction();
    expect(tx.commit()).toEqual([]);
    expect(tx.rollback()).toEqual([]);
  });

  test('savepoints need a block and are named apart from the wrapper savepoints', () => {
    const tx = new LearnerTransaction();
    expect(() => tx.savepoint('a')).toThrow(LearnerTransactionError);
    tx.begin();
    expect(tx.savepoint('a')).toEqual(['SAVEPOINT desk_user_a']);
    expect(tx.rollbackTo('a')).toEqual(['ROLLBACK TO SAVEPOINT desk_user_a']);
    expect(tx.release('a')).toEqual(['RELEASE SAVEPOINT desk_user_a']);
    expect(() => tx.rollbackTo('a')).toThrow(/does not exist/);
  });

  test('a failed statement aborts the block: later commands are refused until ROLLBACK, and COMMIT then rolls back', () => {
    const tx = new LearnerTransaction();
    tx.begin();
    tx.savepoint('a');
    expect(tx.fail()).toEqual(['ROLLBACK TO SAVEPOINT desk_user_a']);
    expect(() => tx.requireNotAborted()).toThrow(expect.objectContaining({ sqlstate: '25P02' }));
    expect(() => tx.savepoint('b')).toThrow(/aborted/);
    // ROLLBACK TO an existing savepoint is the way out of an aborted block, as in PostgreSQL.
    expect(tx.rollbackTo('a')).toEqual(['ROLLBACK TO SAVEPOINT desk_user_a']);
    expect(() => tx.requireNotAborted()).not.toThrow();
    tx.fail();
    expect(tx.commit()).toEqual(['ROLLBACK TO SAVEPOINT desk_learner_block', 'RELEASE SAVEPOINT desk_learner_block']);
  });

  test('a failure with no open block does not change state, so the grader stops the run as before', () => {
    const tx = new LearnerTransaction();
    expect(tx.fail()).toEqual([]);
    expect(tx.isOpen()).toBe(false);
  });
});

describe('statement policy', () => {
  test('read tickets allow SELECT only', () => {
    expect(readPolicy.allow).toEqual(['SelectStmt']);
  });

  test('session escapes get a specific learner-facing reason', () => {
    expect(notAllowedMessage('VariableSetStmt')).toMatch(/session settings/);
    expect(notAllowedMessage('DoStmt')).toMatch(/procedural code/);
    expect(notAllowedMessage('CopyStmt')).toMatch(/files/);
    expect(notAllowedMessage('CreateRoleStmt')).toMatch(/Roles/);
  });

  test('other kinds get a generic sentence', () => {
    expect(notAllowedMessage('CallStmt')).toBe('call statements are not allowed in this ticket.');
  });
});
