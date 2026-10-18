import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Margin — Gemma 4 AI Mathematics Notebook',
  description: 'A maths notebook. A tutor in the margin. Powered by Google DeepMind Gemma 4 with deterministic SymPy verification.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Caveat:wght@400..700&family=Inter:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased min-h-screen">
        {children}
      </body>
    </html>
  );
}
