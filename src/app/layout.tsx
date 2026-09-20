import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: 'Template Importer',
  description: 'Import a home inspection template from a Spectora export and edit it.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="topbar">
          <div className="inner">
            <Link href="/" className="mark" style={{ color: 'inherit' }}>
              Template Importer
            </Link>
            <span className="sub">home inspection templates</span>
          </div>
        </div>
        <main className="shell">{children}</main>
      </body>
    </html>
  );
}
