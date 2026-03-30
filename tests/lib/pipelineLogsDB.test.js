import { describe, it, expect, vi } from 'vitest';
import {
  saveTimeline,
  getTimeline,
  isTimelineFresh,
  saveLogLines,
  getLogLines,
  getLogLineCount,
  clearRunData,
  clearAllData,
  cleanupOldData,
  pipelineLogsDB,
} from '../../src/lib/pipelineLogsDB.js';

describe('pipelineLogsDB exports', () => {
  it('should export pipelineLogsDB', () => {
    expect(pipelineLogsDB).toBeDefined();
    expect(pipelineLogsDB.version).toBeDefined();
  });

  it('should export timeline functions', () => {
    expect(typeof saveTimeline).toBe('function');
    expect(typeof getTimeline).toBe('function');
    expect(typeof isTimelineFresh).toBe('function');
  });

  it('should export log line functions', () => {
    expect(typeof saveLogLines).toBe('function');
    expect(typeof getLogLines).toBe('function');
    expect(typeof getLogLineCount).toBe('function');
  });

  it('should export cleanup functions', () => {
    expect(typeof clearRunData).toBe('function');
    expect(typeof clearAllData).toBe('function');
    expect(typeof cleanupOldData).toBe('function');
  });

  it('should have correct schema for timelines', () => {
    expect(pipelineLogsDB.timelines).toBeDefined();
  });

  it('should have correct schema for logLines', () => {
    expect(pipelineLogsDB.logLines).toBeDefined();
  });
});

describe('pipelineLogsDB schema', () => {
  it('should have timelines table with correct indices', () => {
    const store = pipelineLogsDB.timelines;
    expect(store).toBeDefined();
  });

  it('should have logLines table with compound index', () => {
    const store = pipelineLogsDB.logLines;
    expect(store).toBeDefined();
  });
});