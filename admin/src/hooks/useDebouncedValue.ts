import { useEffect, useState } from "react";

// Returns a value that lags `value` by `ms`. Use for inputs whose change
// triggers a server query — keystroke-rate calls thrash the network.
// In-memory filters don't need this; they're fast enough that adding lag
// makes typing feel sluggish.
export function useDebouncedValue<T>(value: T, ms = 200): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);

  return debounced;
}
