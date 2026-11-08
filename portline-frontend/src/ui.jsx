import { createContext, useContext, useState, useCallback } from 'react';
import { X } from 'lucide-react';
const T = createContext(() => {});
export const useToast = () => useContext(T);
export function ToastProvider({ children }) {
  const [list, set] = useState([]);
  const push = useCallback((msg, kind = 'ok') => {
    const id = Math.random();
    set((l) => [...l, { id, msg, kind }]);
    setTimeout(() => set((l) => l.filter((x) => x.id !== id)), 6000);
  }, []);
  return <T.Provider value={push}>{children}<div className="toasts" role="status">{list.map((t) => <div key={t.id} className={'toast ' + t.kind}>{t.msg}</div>)}</div></T.Provider>;
}
export const label = (s) => (s || 'unknown').replace(/_/g, ' ');
export const Badge = ({ status, children }) => <span className={'badge s-' + (status || 'none')}>{children ?? label(status)}</span>;
export function Modal({ title, onClose, children }) {
  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-label={title}>
        <header><h3>{title}</h3><button className="icon" onClick={onClose} aria-label="Close"><X size={16} /></button></header>
        {children}
      </div>
    </div>
  );
}
export const Empty = ({ title, hint, children }) => <div className="empty"><strong>{title}</strong>{hint && <p>{hint}</p>}{children}</div>;
export const PageHead = ({ title, sub, children }) => <div className="pagehead"><div><h1>{title}</h1><p>{sub}</p></div><div className="row">{children}</div></div>;
