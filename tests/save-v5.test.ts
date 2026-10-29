import { describe, expect, test } from 'vitest';
import { itemIndex } from '../src/data/itemIndex';
import { emptySave } from '../src/save/format';
import { restoreSave } from '../src/save/progress';

// Version 4 saves hold interview problems with no time fields. Version 5 adds them, and the migration fills them in as not recorded.
const v4Set = {
  id: 'set-1', startedAt: 1_000, limitMinutes: 10,
  problems: [{ id: 'int-01', passedAt: 2_000, failures: 1 }, { id: 'int-02', passedAt: null, failures: 0 }],
};
const v4Result = { id: 'set-0', startedAt: 500, endedAt: 900, limitMinutes: 10, expired: false, problems: [{ id: 'int-03', passedAt: 700, failures: 0 }] };
const v4Save = (interview: unknown, history: unknown[]) => ({ ...emptySave(), version: 4, interview, interviewHistory: history });

describe('version 4 to version 5 migration', () => {
  test('a running set migrates, and each problem starts with no time spent, no open workspace and no estimate', () => {
    const result = restoreSave(JSON.stringify(v4Save(v4Set, [v4Result])), itemIndex);
    expect(result.status).toBe('migrated');
    expect(result.save.version).toBe(6);
    expect(result.save.interview?.problems).toEqual([
      { id: 'int-01', passedAt: 2_000, failures: 1, spentMs: 0, openedAt: null, estimateMinutes: null },
      { id: 'int-02', passedAt: null, failures: 0, spentMs: 0, openedAt: null, estimateMinutes: null },
    ]);
  });

  test('a finished result migrates with its outcomes kept and its times recorded as not recorded', () => {
    const { save } = restoreSave(JSON.stringify(v4Save(null, [v4Result])), itemIndex);
    expect(save.interviewHistory).toEqual([{
      id: 'set-0', startedAt: 500, endedAt: 900, limitMinutes: 10, expired: false,
      problems: [{ id: 'int-03', passedAt: 700, failures: 0, spentMs: 0, openedAt: null, estimateMinutes: null }],
    }]);
  });

  test('no set running and no history migrates to an empty interview', () => {
    const { save } = restoreSave(JSON.stringify(v4Save(null, [])), itemIndex);
    expect(save.interview).toBeNull();
    expect(save.interviewHistory).toEqual([]);
  });
});

describe('version 5 validation', () => {
  const v5Set = (problem: Record<string, unknown>) => ({
    ...emptySave(),
    interview: { id: 'set-2', startedAt: 1_000, limitMinutes: 10, problems: [{ id: 'int-01', passedAt: null, failures: 0, spentMs: 90_000, openedAt: null, estimateMinutes: 5, ...problem }] },
  });

  test('a version 5 save with solve times migrates to version 6, keeping every time as written', () => {
    const { backup: _backup, ...v5 } = { ...v5Set({}), version: 5 };
    const result = restoreSave(JSON.stringify(v5), itemIndex);
    expect(result).toMatchObject({ status: 'migrated', writable: true });
    expect(result.save.version).toBe(6);
    expect(result.save.interview?.problems[0]).toEqual({ id: 'int-01', passedAt: null, failures: 0, spentMs: 90_000, openedAt: null, estimateMinutes: 5 });
  });

  test('a time that is negative, an estimate of zero, or an open marker of the wrong kind is corrupt', () => {
    expect(restoreSave(JSON.stringify(v5Set({ spentMs: -1 })), itemIndex)).toMatchObject({ status: 'corrupt', writable: false });
    expect(restoreSave(JSON.stringify(v5Set({ estimateMinutes: 0 })), itemIndex)).toMatchObject({ status: 'corrupt', writable: false });
    expect(restoreSave(JSON.stringify(v5Set({ openedAt: 'now' })), itemIndex)).toMatchObject({ status: 'corrupt', writable: false });
  });

  test('a time longer than the longest set is corrupt', () => {
    expect(restoreSave(JSON.stringify(v5Set({ spentMs: 241 * 60_000 })), itemIndex)).toMatchObject({ status: 'corrupt', writable: false });
  });

  test('a save from version 6 is never overwritten', () => {
    expect(restoreSave('{"version":7,"tickets":{}}', itemIndex)).toMatchObject({ status: 'future', writable: false });
  });
});
