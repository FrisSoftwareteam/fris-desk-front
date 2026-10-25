/** First Registrars & Investor Services wordmark. `mark` is the transparent cutout used in the app bar; `full` is the original opaque logo. */
export function CompanyLogo({ className, variant = 'mark' }: { className?: string; variant?: 'mark' | 'full' }) {
  return (
    <img
      src={variant === 'full' ? '/brand/first-registrars-full.png' : '/brand/first-registrars.png'}
      alt="First Registrars & Investor Services"
      className={className}
    />
  );
}
