export const LoadingState = ({ label = 'Загрузка данных…' }: { label?: string }) => {
  return (
    <div className="panel" style={{ textAlign: 'center' }}>
      <p style={{ margin: 0 }}>{label}</p>
    </div>
  );
};
