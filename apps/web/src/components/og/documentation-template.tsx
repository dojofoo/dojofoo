import type { ReactNode } from 'react'

export interface DocumentationTemplateProps {
  title: ReactNode
  /** Section label, e.g. "Docs" or "Dojos". */
  section?: ReactNode
  /** Short description shown beneath the title. */
  description?: ReactNode
  /** Absolute URL to the OG background image. */
  backgroundUrl?: string
  /** Absolute URL (or data URI) to the wordmark logo. */
  logoUrl?: string
}

/**
 * 1200x630 per-page OG card.
 *
 * Layout:
 *   ┌──────────────────────────────────────────┐
 *   │  [section pill]                          │  ← top-left
 *   │                                          │
 *   │  Page Title                              │  ← center
 *   │  Description                             │
 *   │                                          │
 *   │  dojocho                                 │  ← bottom-left wordmark
 *   └──────────────────────────────────────────┘
 */
export default function DocumentationTemplate({
  title,
  section,
  description,
  backgroundUrl,
  logoUrl,
}: DocumentationTemplateProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        backgroundColor: '#0a0a0a',
        color: 'white',
        backgroundImage: backgroundUrl ? `url(${backgroundUrl})` : undefined,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        padding: '64px',
        justifyContent: 'space-between',
        position: 'relative',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          backgroundImage:
            'linear-gradient(135deg, rgba(0,0,0,0.65) 0%, rgba(0,0,0,0.8) 100%)',
        }}
      />

      {section ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            position: 'relative',
          }}
        >
          <div
            style={{
              display: 'flex',
              backgroundColor: '#ff0056',
              color: 'white',
              padding: '8px 24px',
              borderRadius: '9999px',
              fontSize: 24,
              fontWeight: 600,
            }}
          >
            {section}
          </div>
        </div>
      ) : (
        <div />
      )}

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '24px',
          position: 'relative',
          textShadow: '0 4px 16px rgba(0,0,0,0.6)',
        }}
      >
        <h1
          style={{
            fontSize: 80,
            fontWeight: 800,
            lineHeight: 1.1,
            margin: 0,
          }}
        >
          {title}
        </h1>
        {description ? (
          <p
            style={{
              fontSize: 32,
              lineHeight: 1.35,
              margin: 0,
              color: '#e4e4e7',
            }}
          >
            {description}
          </p>
        ) : null}
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          position: 'relative',
        }}
      >
        {logoUrl ? (
          <img
            src={logoUrl}
            alt="dojofoo"
            style={{ height: 64, width: 'auto' }}
          />
        ) : (
          <span
            style={{
              fontSize: 56,
              fontWeight: 800,
              letterSpacing: '-0.02em',
              color: 'white',
              textShadow: '0 2px 8px rgba(0,0,0,0.6)',
            }}
          >
            dojofoo
          </span>
        )}
      </div>
    </div>
  )
}
