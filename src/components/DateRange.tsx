import { useEffect, useMemo, useRef, useState } from 'react';
import { addDays, addMonths, endOfMonth, endOfWeek, format, isSameDay, isSameMonth, isToday, parseISO, startOfMonth, startOfWeek } from 'date-fns';
import { ru } from 'date-fns/locale';

interface DateRangeProps {
  start: string;
  end: string;
  onChange: (next: { start: string; end: string }) => void;
}

interface DatePickerProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
}

const DatePicker = ({ label, value, onChange }: DatePickerProps) => {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => {
    const date = value ? parseISO(value) : new Date();
    return startOfMonth(date);
  });
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (value) {
      setMonth(startOfMonth(parseISO(value)));
    }
  }, [value]);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const selectedDate = value ? parseISO(value) : null;
  const weeks = useMemo(() => {
    const start = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });
    const days: Date[] = [];
    let cursor = start;
    while (cursor <= end) {
      days.push(cursor);
      cursor = addDays(cursor, 1);
    }
    const rows: Date[][] = [];
    for (let i = 0; i < days.length; i += 7) {
      rows.push(days.slice(i, i + 7));
    }
    return rows;
  }, [month]);

  return (
    <div className="datepicker" ref={containerRef}>
      <span className="label">{label}</span>
      <button
        type="button"
        className={`datepicker__button ${open ? 'is-open' : ''}`}
        onClick={() => setOpen((prev) => !prev)}
      >
        {selectedDate ? format(selectedDate, 'dd.MM.yyyy', { locale: ru }) : 'Выберите дату'}
      </button>
      {open && (
        <div className="datepicker__panel">
          <div className="datepicker__header">
            <button type="button" className="datepicker__nav" onClick={() => setMonth(addMonths(month, -1))}>
              ‹
            </button>
            <div className="datepicker__month">{format(month, 'LLLL yyyy', { locale: ru })}</div>
            <button type="button" className="datepicker__nav" onClick={() => setMonth(addMonths(month, 1))}>
              ›
            </button>
          </div>
          <div className="datepicker__weekdays">
            {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((day) => (
              <span key={day}>{day}</span>
            ))}
          </div>
          <div className="datepicker__grid">
            {weeks.map((week, idx) => (
              <div className="datepicker__row" key={idx}>
                {week.map((day) => {
                  const isOutside = !isSameMonth(day, month);
                  const isSelected = selectedDate ? isSameDay(day, selectedDate) : false;
                  return (
                    <button
                      type="button"
                      key={day.toISOString()}
                      className={`datepicker__day ${isOutside ? 'is-outside' : ''} ${isSelected ? 'is-selected' : ''} ${isToday(day) ? 'is-today' : ''}`}
                      onClick={() => {
                        onChange(format(day, 'yyyy-MM-dd'));
                        setOpen(false);
                      }}
                    >
                      {format(day, 'd')}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export const DateRange = ({ start, end, onChange }: DateRangeProps) => {
  return (
    <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
      <DatePicker
        label="Дата от"
        value={start}
        onChange={(value) => onChange({ start: value, end })}
      />
      <DatePicker
        label="Дата до"
        value={end}
        onChange={(value) => onChange({ start, end: value })}
      />
    </div>
  );
};
