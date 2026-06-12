'use client';

import { useEffect } from "react";
import { initElevora } from "./index";

export interface ElevoraCommentsProps {
  /** Project key the invite codes were issued for (e.g. "hockeytime"). */
  project: string;
  /** Override the feedback backend. Defaults to Elevora's hosted API. */
  apiBase?: string;
}

/**
 * React wrapper for the Elevora widget. Renders nothing — mounts the widget
 * on the client and tears it down on unmount.
 */
export function ElevoraComments({ project, apiBase }: ElevoraCommentsProps): null {
  useEffect(() => {
    const handle = initElevora({ project, apiBase });
    return () => {
      handle.destroy();
    };
  }, [project, apiBase]);

  return null;
}
