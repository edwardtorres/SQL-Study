import { describe, expect, test } from 'vitest';
import { competencyObjectives, curriculum } from '../src/data';

describe('typed competency curriculum', () => {
  test('all 13 chapters have unique IDs and valid prerequisites', () => {
    const ids = new Set(curriculum.map((chapter) => chapter.id));
    expect(ids.size).toBe(13);
    expect(curriculum).toHaveLength(13);
    for (const chapter of curriculum) {
      for (const required of chapter.prerequisites) expect(ids.has(required)).toBe(true);
      expect(chapter.plannedChallenges.guided).toBeGreaterThan(0);
      expect(chapter.plannedChallenges.independent).toBeGreaterThan(0);
      expect(chapter.plannedChallenges.boss).toBe(1);
    }
  });

  test('the prerequisite graph is acyclic and every chapter is reachable from chapter 1', () => {
    const visiting = new Set<number>();
    const visited = new Set<number>();
    function visit(id: number): void {
      expect(visiting.has(id), `cycle at chapter ${id}`).toBe(false);
      if (visited.has(id)) return;
      visiting.add(id);
      const chapter = curriculum.find((item) => item.id === id);
      expect(chapter).toBeDefined();
      for (const prerequisite of chapter!.prerequisites) visit(prerequisite);
      visiting.delete(id);
      visited.add(id);
    }
    curriculum.forEach((chapter) => visit(chapter.id));
    const unlocked = new Set([1]);
    for (let round = 0; round < curriculum.length; round += 1) {
      for (const chapter of curriculum) {
        if (chapter.prerequisites.every((id) => unlocked.has(id))) unlocked.add(chapter.id);
      }
    }
    expect(unlocked.size).toBe(curriculum.length);
    expect(curriculum.filter((chapter) => chapter.prerequisites.length === 0).map((chapter) => chapter.id)).toEqual([1]);
  });

  test('all competencies and every requested detailed objective are mapped exactly once', () => {
    const competencyIds = [...new Set(curriculum.flatMap((chapter) => chapter.competencies))].sort((a, b) => a - b);
    expect(competencyIds).toEqual(Array.from({ length: 13 }, (_, i) => i + 1));
    const objectives = curriculum.flatMap((chapter) => chapter.objectives);
    expect(new Set(objectives.map((item) => item.id)).size).toBe(objectives.length);
    for (const [competency, expected] of Object.entries(competencyObjectives)) {
      expect(objectives.filter((item) => item.competency === Number(competency)).map((item) => item.id).sort()).toEqual([...expected].sort());
    }
    expect(objectives.every((item) => item.title.length > 10)).toBe(true);
    // Guard against shrinking the independent competency checklist to make mapping pass.
    expect(objectives.length).toBeGreaterThanOrEqual(55);
    for (const required of ['anti-not-exists', 'moving-average-frames', 'scd-type-2', 'quality-duplicates-orphans-nulls-ranges', 'count-star-vs-column']) {
      expect(objectives.some((item) => item.id === required), required).toBe(true);
    }
  });

  test('each chapter includes official PostgreSQL sources and both dialect notes', () => {
    for (const chapter of curriculum) {
      expect(chapter.sources.every((source) => new URL(source.url).hostname === 'www.postgresql.org')).toBe(true);
      expect(chapter.dialectNotes.map((note) => note.dialect).sort()).toEqual(['Spark SQL', 'T-SQL']);
      expect(chapter.dialectNotes.every((note) => ['learn.microsoft.com', 'spark.apache.org', 'docs.databricks.com'].includes(new URL(note.source).hostname))).toBe(true);
    }
  });
});
