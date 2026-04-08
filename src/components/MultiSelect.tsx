interface MultiSelectProps {
  label: string;
  options: string[];
  value: string[];
  onChange: (value: string[]) => void;
}

export const MultiSelect = ({ label, options, value, onChange }: MultiSelectProps) => {
  return (
    <label className="field">
      <span className="label">{label}</span>
      <select
        className="select"
        multiple
        value={value}
        onChange={(event) => {
          const selected = Array.from(event.target.selectedOptions).map((opt) => opt.value);
          onChange(selected);
        }}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
};
