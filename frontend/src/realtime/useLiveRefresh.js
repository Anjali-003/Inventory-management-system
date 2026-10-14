import { useEffect, useRef } from "react";
import { LIVE_EVENT } from "./LiveSync";

/*
  For screens that fetch with plain axios.
  useLiveRefresh(["production", "orders"], load)  -> load({ quiet: true }) runs when another
  super admin changes one of those resources. quiet = no loading skeleton, the table just updates.
*/
export default function useLiveRefresh(resources, reload) {
  const reloadRef = useRef(reload);
  reloadRef.current = reload;
  const key = resources.join(",");

  useEffect(() => {
    const wanted = key.split(",");
    const onChange = (e) => {
      if (e.detail.resources.some((r) => wanted.includes(r))) reloadRef.current({ quiet: true });
    };
    window.addEventListener(LIVE_EVENT, onChange);
    return () => window.removeEventListener(LIVE_EVENT, onChange);
  }, [key]);
}
