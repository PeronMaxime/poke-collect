import { useQueryClient } from '@tanstack/react-query';
import { authClient } from '../lib/auth-client';

export function SignOutButton({ className = 'btn-ghost' }: { className?: string }) {
  const queryClient = useQueryClient();
  return (
    <button
      className={className}
      onClick={async () => {
        await authClient.signOut();
        queryClient.clear();
        await queryClient.invalidateQueries({ queryKey: ['admin-me'] });
      }}
    >
      Se déconnecter
    </button>
  );
}
