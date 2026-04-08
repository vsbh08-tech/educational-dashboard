import { useEffect, useRef, useState } from 'react';

interface SelectProps {
  label: string;
  value: string;
  options: string[];
  allLabel: string;
  onChange: (value: string) => void;
}

export const Select = ({ label, value, options, allLabel, onChange }: SelectProps) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

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

  const items = ['', ...options];

  return (
    <div className="select" ref={containerRef}>
      <span className="label">{label}</span>
      <button
        type="button"
        className={`select__button ${open ? 'is-open' : ''}`}
        onClick={() => setOpen((prev) => !prev)}
      >
        {value || allLabel}
      </button>
      {open && (
        <div className="select__menu">
          {items.map((item) => (
            <button
              type="button"
              key={item || 'all'}
              className={`select__option ${item === value ? 'is-selected' : ''}`}
              onClick={() => {
                onChange(item);
                setOpen(false);
              }}
            >
              {item || allLabel}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
