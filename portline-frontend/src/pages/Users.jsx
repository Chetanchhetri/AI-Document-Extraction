import { useCallback, useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { Navigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { arr } from '../normalize.js';
import { Modal, PageHead, useToast } from '../ui.jsx';

const ROLES = ['executive', 'manager', 'super_admin'];
const blank = { email: '', password: '', full_name: '', role: 'executive' };
export default function UsersPage() {
  const { isAdmin, user } = useAuth(); const toast = useToast();
  const [rows, setRows] = useState([]); const [open, setOpen] = useState(false); const [f, setF] = useState(blank);
  const load = useCallback(() => api.users(0, 50).then((r) => setRows(arr(r))).catch((e) => toast(e.message, 'err')), [toast]);
  useEffect(() => { if (isAdmin) load(); }, [isAdmin, load]);
  if (!isAdmin) return <Navigate to="/" replace />;
  const patch = async (u, body) => { try { await api.patchUser(u.id, body); toast('User updated.'); load(); } catch (e) { toast(e.message, 'err'); } };
  const create = async (e) => { e.preventDefault(); try { await api.createUser(f); toast('User created. They must verify with the code emailed to them before signing in.'); setOpen(false); setF(blank); load(); } catch (err) { toast(err.message, 'err'); } };
  return (
    <>
      <PageHead title="Team access" sub="Provision accounts and manage roles."><button className="primary" onClick={() => setOpen(true)}><Plus size={14} />Add user</button></PageHead>
      <div className="card"><table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Verified</th><th>Active</th></tr></thead>
        <tbody>{rows.map((u) => <tr key={u.id}><td>{u.full_name}</td><td className="mut">{u.email}</td>
          <td><select value={u.role} disabled={u.id === user.id} onChange={(e) => patch(u, { role: e.target.value })}>{ROLES.map((r) => <option key={r}>{r}</option>)}</select></td>
          <td>{u.is_verified ? 'Yes' : 'Pending'}</td><td><label className="switch"><input type="checkbox" checked={!!u.is_active} disabled={u.id === user.id} onChange={(e) => patch(u, { is_active: e.target.checked })} /><span>{u.is_active ? 'Active' : 'Deactivated'}</span></label></td></tr>)}</tbody></table></div>
      {open && <Modal title="Add user" onClose={() => setOpen(false)}><form onSubmit={create}>
        <label>Full name<input required value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} /></label>
        <label>Email<input type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></label>
        <label>Temporary password<input type="password" required minLength={8} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></label>
        <label>Role<select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>{ROLES.map((r) => <option key={r}>{r}</option>)}</select></label>
        <button className="primary wide">Create user</button></form></Modal>}
    </>
  );
}
