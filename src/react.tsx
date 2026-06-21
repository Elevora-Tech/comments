'use client';

import { useEffect, useRef } from "react";
import type { SessionUser } from "./api";
import { initElevora, type ElevoraHandle } from "./index";

export interface ElevoraCommentsProps {
  /** Project key the invite codes were issued for (e.g. "my-site"). */
  project: string;
  /**
   * Feedback backend the widget talks to (your deployment of the Elevora
   * comments API). Required — the package ships with no default backend.
   */
  apiBase: string;
  /**
   * Attributes of the user logged into your site. Optional. Pass the current
   * persona here; the widget re-identifies whenever its contents change, so a
   * role switch is reflected on the next comment.
   */
  user?: SessionUser;
}

/**
 * React wrapper for the Elevora widget. Renders nothing — mounts the widget
 * on the client and tears it down on unmount.
 */
export function ElevoraComments({ project, apiBase, user }: ElevoraCommentsProps): null {
  const handleRef = useRef<ElevoraHandle | null>(null);

  useEffect(() => {
    const handle = initElevora({ project, apiBase, user });
    handleRef.current = handle;
    return () => {
      handleRef.current = null;
      handle.destroy();
    };
    // `user` is intentionally omitted — it must not re-mount the widget. The
    // effect below re-identifies in place when it changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project, apiBase]);

  // Re-identify only when the user's contents actually change (the prop is a
  // fresh object reference every render).
  const userKey = user ? JSON.stringify(user) : null;
  useEffect(() => {
    handleRef.current?.identify(userKey ? (JSON.parse(userKey) as SessionUser) : null);
  }, [userKey]);

  return null;
}
