import { useCallback, useState } from 'react';
import { crmWrite, type CrmWriteInput } from '../../data/crmWriteClient';
import { useToast } from '../Toast';

/**
 * Shared submit machinery for the write modals: awaits `crmWrite`, shows a
 * spinner via `loading`, toasts on success then closes, or surfaces the error
 * message inline (without closing) so the banker can retry.
 */
export function useCrmAction(onDone: () => void) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(
    async (input: CrmWriteInput, successTitle: string, successSub?: string) => {
      setLoading(true);
      setError(null);
      try {
        await crmWrite(input);
        toast(successTitle, successSub);
        onDone();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'CRM write failed');
      } finally {
        setLoading(false);
      }
    },
    [toast, onDone],
  );

  return { submit, loading, error };
}
