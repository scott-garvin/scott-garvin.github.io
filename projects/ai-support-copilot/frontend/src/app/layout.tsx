import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Harbor — Support workspace",
  description:
    "An evidence-first support copilot. Explore document retrieval, account lookups, and reviewed replies using fictional business data.",
  robots: { index: false, follow: false },
};
export default function Layout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
