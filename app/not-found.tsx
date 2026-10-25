import Link from 'next/link';
import { webDarkTheme, webLightTheme } from '@fluentui/react-components';

const pageStyle = `
  .missing {
    background: ${webLightTheme.colorNeutralBackground3};
    color: ${webLightTheme.colorNeutralForeground1};
  }
  .missing a { color: ${webLightTheme.colorBrandForegroundLink}; }
  @media (prefers-color-scheme: dark) {
    .missing {
      background: ${webDarkTheme.colorNeutralBackground3};
      color: ${webDarkTheme.colorNeutralForeground1};
    }
    .missing a { color: ${webDarkTheme.colorBrandForegroundLink}; }
  }
`;

export default function NotFound() {
  return (
    <main
      className="missing flex min-h-dvh flex-col items-center justify-center gap-3 p-4 text-center"
      style={{ fontFamily: "'Segoe UI', system-ui, sans-serif" }}
    >
      <style>{pageStyle}</style>
      <strong style={{ fontSize: 20 }}>This page doesn&apos;t exist</strong>
      <Link href="/">Go to enquiries</Link>
    </main>
  );
}
