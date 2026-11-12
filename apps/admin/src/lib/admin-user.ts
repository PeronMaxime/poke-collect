/** Administrateur connecté, fourni par `AdminGate` à toutes les pages. */
import { createContext, use } from 'react';

/** Compte administrateur, tel que le rend `/api/admin/me`. */
export interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: 'admin';
}

/** Administrateur connecté ; `null` hors de `AdminGate`. */
export const AdminUserContext = createContext<AdminUser | null>(null);

/** Administrateur connecté ; lève une erreur hors de `AdminGate`. */
export function useAdminUser(): AdminUser {
  const user = use(AdminUserContext);
  if (!user) throw new Error('useAdminUser() hors de <AdminGate>');
  return user;
}
