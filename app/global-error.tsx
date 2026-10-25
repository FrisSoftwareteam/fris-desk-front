'use client';

import { webDarkTheme, webLightTheme } from '@fluentui/react-components';

const pageStyle = `
  .crash {
    background: ${webLightTheme.colorNeutralBackground3};
    color: ${webLightTheme.colorNeutralForeground1};
  }
  .crash .hint { color: ${webLightTheme.colorNeutralForeground3}; }
  .crash button {
    background: ${webLightTheme.colorBrandBackground};
    color: ${webLightTheme.colorNeutralForegroundOnBrand};
  }
  @media (prefers-color-scheme: dark) {
    .crash {
      background: ${webDarkTheme.colorNeutralBackground3};
      color: ${webDarkTheme.colorNeutralForeground1};
    }
    .crash .hint { color: ${webDarkTheme.colorNeutralForeground3}; }
    .crash button {
      background: ${webDarkTheme.colorBrandBackground};
      color: ${webDarkTheme.colorNeutralForegroundOnBrand};
    }
  }
`;

// Last resort if the root layout itself fails: FluentProvider isn't available here, so this is plain HTML.
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en-GB">
      <body
        className="crash"
        style={{
          margin: 0,
          minHeight: '100dvh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
          fontFamily: "'Segoe UI', system-ui, sans-serif",
          textAlign: 'center',
          padding: 16,
        }}
      >
        <style>{pageStyle}</style>
        <strong style={{ fontSize: 20 }}>Registrar Desk couldn&apos;t start</strong>
        <span className="hint">Reload the page. If it keeps happening, contact the system administrator.</span>
        <button
          type="button"
          onClick={reset}
          style={{
            padding: '6px 16px',
            borderRadius: 4,
            border: 'none',
            font: 'inherit',
            cursor: 'pointer',
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
