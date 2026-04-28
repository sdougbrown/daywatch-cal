import { vi } from 'vitest';
import { snapToInterval, updateTimeSelection } from '../src/index.js';

describe('time selection helpers', () => {
  it('snaps times correctly for 15, 30, and 60 minute intervals', () => {
    expect(snapToInterval('14:17', 15)).toBe('14:15');
    expect(snapToInterval('09:50', 30)).toBe('09:30');
    expect(snapToInterval('12:59', 60)).toBe('12:00');
  });

  it('handles edge-case snap inputs', () => {
    expect(snapToInterval('00:00', 30)).toBe('00:00');
    expect(snapToInterval('23:59', 30)).toBe('23:30');
    expect(snapToInterval('12:00', 15)).toBe('12:00');
  });

  it('sets startTime on the first click after snapping', () => {
    const selection = updateTimeSelection(
      { date: '2026-03-10', startTime: null, endTime: null, preview: null },
      { type: 'click', time: '14:17' },
      { intervalMinutes: 15 },
    );

    expect(selection).toEqual({
      date: '2026-03-10',
      startTime: '14:15',
      endTime: null,
      preview: null,
    });
  });

  it('sets endTime on the second click after snapping', () => {
    const selection = updateTimeSelection(
      {
        date: '2026-03-10',
        startTime: '14:15',
        endTime: null,
        preview: '14:30',
      },
      { type: 'click', time: '15:02' },
      { intervalMinutes: 15 },
    );

    expect(selection).toEqual({
      date: '2026-03-10',
      startTime: '14:15',
      endTime: '15:00',
      preview: null,
    });
  });

  it('swaps startTime and endTime when the second click is earlier', () => {
    const selection = updateTimeSelection(
      { date: '2026-03-10', startTime: '14:00', endTime: null, preview: null },
      { type: 'click', time: '13:30' },
      { intervalMinutes: 30 },
    );

    expect(selection).toEqual({
      date: '2026-03-10',
      startTime: '13:30',
      endTime: '14:00',
      preview: null,
    });
  });

  it('resets the selection on the third click', () => {
    const selection = updateTimeSelection(
      {
        date: '2026-03-10',
        startTime: '14:00',
        endTime: '15:00',
        preview: null,
      },
      { type: 'click', time: '16:10' },
      { intervalMinutes: 30 },
    );

    expect(selection).toEqual({
      date: '2026-03-10',
      startTime: '16:00',
      endTime: null,
      preview: null,
    });
  });

  it('enforces minDuration by extending the endTime when needed', () => {
    const selection = updateTimeSelection(
      { date: '2026-03-10', startTime: '10:00', endTime: null, preview: null },
      { type: 'click', time: '10:05' },
      { intervalMinutes: 5, minDuration: 15 },
    );

    expect(selection).toEqual({
      date: '2026-03-10',
      startTime: '10:00',
      endTime: '10:15',
      preview: null,
    });
  });

  it('blocks clicks for unselectable times', () => {
    const selection = {
      date: '2026-03-10',
      startTime: null,
      endTime: null,
      preview: null,
    };
    const next = updateTimeSelection(
      selection,
      { type: 'click', time: '14:00' },
      { isTimeSelectable: () => false },
    );

    expect(next).toBe(selection);
  });

  it('blocks hover for unselectable times', () => {
    const selection = {
      date: '2026-03-10',
      startTime: '14:00',
      endTime: null,
      preview: null,
    };
    const next = updateTimeSelection(
      selection,
      { type: 'hover', time: '14:30' },
      { isTimeSelectable: () => false },
    );

    expect(next).toBe(selection);
  });

  it('updates preview only during an active selection', () => {
    const active = updateTimeSelection(
      { date: '2026-03-10', startTime: '14:00', endTime: null, preview: null },
      { type: 'hover', time: '14:17' },
      { intervalMinutes: 15 },
    );
    const inactive = {
      date: '2026-03-10',
      startTime: null,
      endTime: null,
      preview: null,
    };

    expect(active).toEqual({
      date: '2026-03-10',
      startTime: '14:00',
      endTime: null,
      preview: '14:15',
    });
    expect(updateTimeSelection(inactive, { type: 'hover', time: '14:17' })).toBe(inactive);
    expect(
      updateTimeSelection(
        {
          date: '2026-03-10',
          startTime: '14:00',
          endTime: '15:00',
          preview: null,
        },
        { type: 'hover', time: '14:17' },
      ),
    ).toEqual({
      date: '2026-03-10',
      startTime: '14:00',
      endTime: '15:00',
      preview: null,
    });
  });

  it('clamps selections to dayStart and dayEnd bounds', () => {
    const start = updateTimeSelection(
      { date: '2026-03-10', startTime: null, endTime: null, preview: null },
      { type: 'click', time: '08:10' },
      { intervalMinutes: 15, dayStart: '09:00', dayEnd: '17:00' },
    );
    const end = updateTimeSelection(
      start,
      { type: 'click', time: '18:20' },
      { intervalMinutes: 15, dayStart: '09:00', dayEnd: '17:00' },
    );

    expect(start).toEqual({
      date: '2026-03-10',
      startTime: '09:00',
      endTime: null,
      preview: null,
    });
    expect(end).toEqual({
      date: '2026-03-10',
      startTime: '09:00',
      endTime: '17:00',
      preview: null,
    });
  });

  it('preserves date when clearing times', () => {
    const selection = updateTimeSelection(
      {
        date: '2026-03-10',
        startTime: '14:00',
        endTime: '15:00',
        preview: '14:30',
      },
      { type: 'clear' },
    );

    expect(selection).toEqual({
      date: '2026-03-10',
      startTime: null,
      endTime: null,
      preview: null,
    });
  });

  it('returns the same reference for no-op actions', () => {
    const selection = {
      date: '2026-03-10',
      startTime: null,
      endTime: null,
      preview: null,
    };
    const next = updateTimeSelection(selection, { type: 'clear' });

    expect(next).toBe(selection);
  });

  it('snaps before running the selectability check', () => {
    const isTimeSelectable = vi.fn((time: string) => time === '14:00');

    const selection = updateTimeSelection(
      { date: '2026-03-10', startTime: null, endTime: null, preview: null },
      { type: 'click', time: '14:07' },
      { intervalMinutes: 15, isTimeSelectable },
    );

    expect(isTimeSelectable).toHaveBeenCalledWith('14:00');
    expect(selection).toEqual({
      date: '2026-03-10',
      startTime: '14:00',
      endTime: null,
      preview: null,
    });
  });
});
