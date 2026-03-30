import { useEffect, useMemo, useState } from 'react';
import type { DateRange } from '@neo-reckoning/core';
import type { DateSelection, TimeSelection } from '@neo-reckoning/models';
import { useCalendarEvents } from '@neo-reckoning/react';
import { DatePicker } from '../../react/DatePicker.js';
import { RangePicker } from '../../react/RangePicker.js';
import { TimePicker } from '../../react/TimePicker.js';

type DemoTab = 'date' | 'time' | 'range';

const sampleRanges: DateRange[] = [
  {
    id: 'weekly-sync',
    label: 'Weekly Sync',
    fromDate: '2026-03-30',
    toDate: '2026-05-29',
    everyWeekday: [2],
    startTime: '10:00',
    endTime: '11:00',
  },
  {
    id: 'vacation-block',
    label: 'Vacation',
    fromDate: '2026-04-13',
    toDate: '2026-04-17',
  },
  {
    id: 'client-demo',
    label: 'Client Demo',
    fromDate: '2026-04-07',
    toDate: '2026-04-07',
    startTime: '14:00',
    endTime: '15:30',
  },
];

function emptyDateSelection(): DateSelection {
  return {
    start: null,
    end: null,
    preview: null,
  };
}

function emptyTimeSelection(date: string): TimeSelection {
  return {
    date,
    startTime: null,
    endTime: null,
    preview: null,
  };
}

function startOfDay(date: string): Date {
  return new Date(`${date}T00:00:00`);
}

function endOfDay(date: string): Date {
  return new Date(`${date}T23:59:59`);
}

function formatRange(range: DateRange): string {
  const dates = [range.fromDate, range.toDate].filter(Boolean).join(' -> ');
  const times = [range.startTime, range.endTime].filter(Boolean).join(' - ');

  if (dates && times) {
    return `${dates} | ${times}`;
  }

  return dates || times || range.label;
}

export function App() {
  const [activeTab, setActiveTab] = useState<DemoTab>('date');
  const [dateSelection, setDateSelection] = useState<DateSelection>(emptyDateSelection);
  const [timeDemoDate, setTimeDemoDate] = useState('2026-04-07');
  const [timeSelection, setTimeSelection] = useState<TimeSelection>(() => emptyTimeSelection('2026-04-07'));
  const [createdRanges, setCreatedRanges] = useState<DateRange[]>([]);

  useEffect(() => {
    setTimeSelection(emptyTimeSelection(timeDemoDate));
  }, [timeDemoDate]);

  const timeEvents = useCalendarEvents({
    ranges: sampleRanges,
    importedEvents: [],
    from: startOfDay(timeDemoDate),
    to: endOfDay(timeDemoDate),
  });

  const rangeDemoRanges = useMemo(
    () => [...sampleRanges, ...createdRanges],
    [createdRanges],
  );

  return (
    <main className="sandbox">
      <header className="sandbox__header">
        <h1>neo-reckoning sandbox</h1>
        <p>Reference implementations for date selection, time selection, and full range composition.</p>
      </header>

      <nav className="sandbox__tabs" aria-label="Examples">
        {(['date', 'time', 'range'] as DemoTab[]).map(tab => (
          <button
            key={tab}
            type="button"
            className="sandbox__tab"
            data-active={activeTab === tab ? '' : undefined}
            onClick={() => setActiveTab(tab)}
          >
            {tab === 'date' ? 'Date Picker' : null}
            {tab === 'time' ? 'Time Picker' : null}
            {tab === 'range' ? 'Range Picker' : null}
          </button>
        ))}
      </nav>

      {activeTab === 'date' ? (
        <section className="sandbox__panel">
          <h2>Date Picker</h2>
          <DatePicker
            blockedRanges={sampleRanges}
            onSelectionChange={setDateSelection}
            ranges={sampleRanges}
            selection={dateSelection}
          />
          <pre className="sandbox__debug">{JSON.stringify(dateSelection, null, 2)}</pre>
        </section>
      ) : null}

      {activeTab === 'time' ? (
        <section className="sandbox__panel">
          <div className="sandbox__controls">
            <label>
              Date
              <input
                type="date"
                value={timeDemoDate}
                onChange={event => setTimeDemoDate(event.currentTarget.value)}
              />
            </label>
          </div>

          <TimePicker
            availabilityRanges={sampleRanges}
            date={timeDemoDate}
            events={timeEvents}
            intervalMinutes={30}
            minDuration={30}
            onSelectionChange={setTimeSelection}
            selection={timeSelection}
            startHour={8}
            endHour={18}
          />
          <pre className="sandbox__debug">{JSON.stringify(timeSelection, null, 2)}</pre>
        </section>
      ) : null}

      {activeTab === 'range' ? (
        <section className="sandbox__panel">
          <RangePicker
            onRangeCreated={range => {
              setCreatedRanges(current => [...current, range]);
            }}
            ranges={rangeDemoRanges}
          />

          <div className="sandbox__stack">
            <h2>Created ranges</h2>
            <ul className="sandbox__list">
              {createdRanges.length === 0 ? (
                <li>No ranges created yet.</li>
              ) : (
                createdRanges.map(range => (
                  <li key={range.id}>
                    <strong>{range.label || range.id}</strong>
                    <span>{formatRange(range)}</span>
                  </li>
                ))
              )}
            </ul>
          </div>
        </section>
      ) : null}
    </main>
  );
}
