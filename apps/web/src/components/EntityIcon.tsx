"use client";

/**
 * EntityIcon — renders a game entity's icon by convention, with a graceful
 * CSS-placeholder fallback.
 *
 * Tries /icons/<kind>/<key>.png (served from public/). If the file is missing
 * (the default until the user drops real PNGs in), it shows a kind-colored tile
 * with the entity's initials instead — so the UI is fully functional with zero
 * art and improves automatically as icons are added.
 */

import { useState } from "react";
import {
  entityDisplayName,
  entityIconSrc,
  entityInitials,
  kindColor,
  parseEntityRef,
} from "@/lib/entities";

interface EntityIconProps {
  /** Canonical entity ref, e.g. "hero:far_seer". */
  entityRef: string;
  /** Pixel size (square). Default 28. */
  size?: number;
  /** Override tooltip; defaults to the humanized entity name. */
  title?: string;
}

export function EntityIcon({ entityRef, size = 28, title }: EntityIconProps) {
  const { kind, key } = parseEntityRef(entityRef);
  const [failed, setFailed] = useState(false);
  const label = title ?? entityDisplayName(key);

  return (
    <span
      className="entity-icon"
      title={label}
      style={{ width: size, height: size, fontSize: size * 0.36 }}
    >
      {failed ? (
        <span
          className="entity-icon__ph"
          style={{ background: kindColor(kind) }}
          aria-label={label}
        >
          {entityInitials(key)}
        </span>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- local convention asset, no next/image
        <img
          src={entityIconSrc(kind, key)}
          alt={label}
          width={size}
          height={size}
          onError={() => setFailed(true)}
        />
      )}

      <style>{`
        .entity-icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          border-radius: 4px;
          overflow: hidden;
          border: 1px solid var(--border-gold);
          background: var(--bg-void);
          box-shadow: inset 0 0 6px rgba(0,0,0,0.5);
          vertical-align: middle;
        }
        .entity-icon img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }
        .entity-icon__ph {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 100%;
          height: 100%;
          color: #fff;
          font-weight: 700;
          letter-spacing: 0.02em;
          text-shadow: 0 1px 2px rgba(0,0,0,0.6);
          line-height: 1;
        }
      `}</style>
    </span>
  );
}
