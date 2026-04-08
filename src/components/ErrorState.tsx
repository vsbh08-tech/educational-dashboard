export const ErrorState = ({ message }: { message: string }) => {
  return (
    <div className="notice">
      {message}
    </div>
  );
};
