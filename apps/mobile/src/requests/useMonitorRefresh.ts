import { useCallback, useEffect, useRef } from "react";
import { useFocusEffect } from "expo-router";
// A single monitor drives automatic refreshes; retained Stack screens do no extra work.
export function useMonitorRefresh(
  reload: () => void,
  revision: number,
  enabled = true,
) {
  const focused = useRef(false),
    handled = useRef(revision),
    latest = useRef(revision);
  latest.current = revision;
  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      handled.current = latest.current;
      return () => {
        focused.current = false;
      };
    }, []),
  );
  useEffect(() => {
    if (enabled && focused.current && handled.current !== revision) {
      handled.current = revision;
      reload();
    }
  }, [reload, revision, enabled]);
}
