import type { ReactNode } from 'react'

export interface LandingTemplateProps {
  /** Absolute URL to the OG background image. */
  backgroundUrl?: string
  /** Absolute URL (or data URI) to the dojofoo wordmark. */
  logoUrl?: string
}

/**
 * 1200x630 landing-page OG card — wordmark centered over the
 * cherry-blossom background.
 */
export default function LandingTemplate({
  backgroundUrl,
  logoUrl,
}: LandingTemplateProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        height: '100%',
        backgroundColor: '#0a0a0a',
        color: 'white',
        backgroundImage: backgroundUrl ? `url(${backgroundUrl})` : undefined,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        padding: '64px',
        gap: '32px',
        position: 'relative',
      }}
    >
      {/* Dark scrim — keeps the wordmark legible on bright florals. */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          backgroundImage:
            'linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.7) 100%)',
        }}
      />

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
        }}
      >
        {logoUrl ? (
          <img
            src={logoUrl}
            alt="dojofoo"
            style={{ width: 800, height: 'auto' }}
          />
        ) : (
          <span
            style={{
              fontSize: 200,
              fontWeight: 800,
              letterSpacing: '-0.02em',
              lineHeight: 1,
              color: 'white',
              textShadow: '0 4px 24px rgba(0,0,0,0.6)',
            }}
          >
            dojofoo
          </span>
        )}
      </div>
    </div>
  )
}
