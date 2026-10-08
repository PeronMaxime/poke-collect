import { useQueryClient } from '@tanstack/react-query';
import { authClient } from '../lib/auth-client';

export function SignOutButton({ className = 'btn-ghost' }: { className?: string }) {
  const queryClient = useQueryClient();
  return (
    <button
      className={className}
      onClick={async () => {
        await authClient.signOut();
        // `clear()` retirerait aussi `['admin-me']` sans prévenir son observateur : écran figé.
        queryClient.setQueryData(['admin-me'], { status: 'anonymous' });
        queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== 'admin-me' });
      }}
    >
      Se déconnecter
    </button>
  );
}
