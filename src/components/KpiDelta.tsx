interface KpiDeltaProps {
  delta: number | null;
  format: (value: number) => string;
}

export const KpiDelta = ({ delta, format }: KpiDeltaProps) => {
  if (delta == null) return null;
  const status = delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat';
  const icon = delta > 0 ? '▲' : delta < 0 ? '▼' : '●';
  return (
    <div className={`kpi-meta kpi-meta--${status}`}>
      <span className="kpi-meta__icon">{icon}</span>
      <span>{format(Math.abs(delta))}</span>
    </div>
  );
};
