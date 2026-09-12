import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ActionMail — Turn documents into actions",
  description:
    "A private document inbox that finds deadlines, payments, and next steps.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased">{children}</body>
    </html>
  );
}
