'use client';

import { useEffect } from 'react';
import { Button, Text, tokens } from '@fluentui/react-components';
import { ErrorCircleRegular } from '@fluentui/react-icons';

// Shown if a screen crashes while rendering (a bug, not a failed request — those show in place).
// Officers keep their place: "Try again" re-renders the screen without a full reload.
export default function ScreenError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div
      className="flex min-h-dvh flex-col items-center justify-center gap-3 p-4 text-center"
      style={{ backgroundColor: tokens.colorNeutralBackground3 }}
      role="alert"
    >
      <ErrorCircleRegular fontSize={40} style={{ color: tokens.colorPaletteRedForeground1 }} />
      <Text weight="semibold" size={500}>
        Something went wrong on this screen
      </Text>
      <Text size={300} style={{ color: tokens.colorNeutralForeground3, maxWidth: 480 }}>
        Nothing you sent or saved has been lost. Try again, and if it keeps happening, tell the system administrator
        what you were doing{error.digest ? ` (error ${error.digest})` : ''}.
      </Text>
      <div className="flex gap-2">
        <Button appearance="primary" onClick={reset}>
          Try again
        </Button>
        <Button onClick={() => window.location.assign('/')}>Go to enquiries</Button>
      </div>
    </div>
  );
}
