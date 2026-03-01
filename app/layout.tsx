import "./globals.css";

export const metadata = {
  title: "Felix CRM",
  description: "Lead generation + instant site + AI scripts",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
