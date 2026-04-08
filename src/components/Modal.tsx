import React from 'react';

interface ModalProps {
  title: string;
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

export const Modal = ({ title, open, onClose, children }: ModalProps) => {
  if (!open) return null;
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(6, 10, 20, 0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 30
      }}
      onClick={onClose}
    >
      <div
        className="panel"
        style={{ width: 'min(900px, 92vw)', maxHeight: '80vh', overflow: 'auto' }}
        onClick={(event) => event.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>{title}</h3>
          <button className="btn" type="button" onClick={onClose}>Закрыть</button>
        </div>
        {children}
      </div>
    </div>
  );
};
