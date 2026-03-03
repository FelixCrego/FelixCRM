import "./globals.css";
import { GlobalChatWidget } from "@/components/GlobalChatWidget";

export const metadata = {
  title: "Felix CRM",
  description: "Lead generation + instant site + AI scripts",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-zinc-950 text-zinc-100 antialiased">
        {children}
        <GlobalChatWidget />
      </body>
    </html>
  );
}
