import { createContext, use } from 'react';

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: 'admin';
}

export const AdminUserContext = createContext<AdminUser | null>(null);

export function useAdminUser(): AdminUser {
  const user = use(AdminUserContext);
  if (!user) throw new Error('useAdminUser() hors de <AdminGate>');
  return user;
}
