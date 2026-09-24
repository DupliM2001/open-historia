import { useEffect, useRef, useState } from "react";
import { getRuntimeSlice, subscribeRuntime } from "./runtimeStore.js";

// Reads one slice of a runtime document. The selector lives in a ref so an
// inline arrow does not tear the subscription down every render. Pass a
// primitive `depsKey` when the selector closes over something that can change
// without the document changing.
export const useRuntimeState = (key, select, depsKey) => {
  const selectRef = useRef(select);
  selectRef.current = select;

  // What this hook last handed React, so the subscription below can tell whether
  // anything moved in between.
  const seedRef = useRef(null);
  const [value, setValue] = useState(() => {
    seedRef.current = getRuntimeSlice(key, select);
    return seedRef.current;
  });

  useEffect(() => {
    const apply = (next) => {
      seedRef.current = next;
      setValue(next);
    };
    return subscribeRuntime(key, apply, {
      select: selectRef.current ? (doc) => selectRef.current(doc) : undefined,
      seed: seedRef.current,
    });
  }, [key, depsKey]);

  return value;
};
