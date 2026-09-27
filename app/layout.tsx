import type { ReactNode } from "react";

export const metadata = {
  title: "Football Calendar",
  description: "Mehrere Fußballkalender in einem Feed bündeln."
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  );
}
