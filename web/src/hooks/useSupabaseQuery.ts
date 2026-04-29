import { useState, useEffect } from "react";
import { PostgrestError } from "@supabase/supabase-js";
import { toast } from "sonner";

interface UseSupabaseQueryOptions<T> {
  queryFn: () => Promise<{ data: T | null; error: PostgrestError | null }>;
  onSuccess?: (data: T) => void;
  onError?: (error: PostgrestError) => void;
  enabled?: boolean;
  errorMessage?: string;
}

export function useSupabaseQuery<T>({
  queryFn,
  onSuccess,
  onError,
  enabled = true,
  errorMessage = "Failed to load data",
}: UseSupabaseQueryOptions<T>) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<PostgrestError | null>(null);
  const [loading, setLoading] = useState(false);

  const execute = async () => {
    if (!enabled) return;
    
    setLoading(true);
    setError(null);

    try {
      const result = await queryFn();

      if (result.error) {
        setError(result.error);
        toast.error(errorMessage);
        onError?.(result.error);
      } else if (result.data) {
        setData(result.data);
        onSuccess?.(result.data);
      }
    } catch (err) {
      const error = err as PostgrestError;
      setError(error);
      toast.error(errorMessage);
      onError?.(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    execute();
  }, [enabled]);

  return {
    data,
    error,
    loading,
    refetch: execute,
  };
}
