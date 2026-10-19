import type { Metadata } from "next";
import {
  Bricolage_Grotesque,
  Instrument_Sans,
  JetBrains_Mono,
} from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { ThemeToaster } from "@/components/shell/theme-toaster";

const display = Bricolage_Grotesque({
  subsets: ["latin"],
  weight: ["400", "600", "700", "800"],
  variable: "--font-bricolage",
});

const sans = Instrument_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-instrument",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-jetbrains",
});

export const metadata: Metadata = {
  title: {
    default: "Muttu Hub",
    template: "%s · Muttu Hub",
  },
  description:
    "Plataforma integral de Muttu Innovación Social: aliados y clientes, tablero de tareas, repositorio documental y reportes.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="es"
      // The anti-FOUC script below mutates documentElement (class + color-scheme)
      // before hydration; suppress the expected attribute mismatch on this node.
      suppressHydrationWarning
      className={`${display.variable} ${sans.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        {/* Anti-FOUC: applies the theme class before first paint. Inline
            scripts are not hoisted, so this runs in place during parsing.
            Stored value wins; otherwise follow the system preference. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("muttu-theme");var d=t?t==="dark":window.matchMedia("(prefers-color-scheme: dark)").matches;var r=document.documentElement;if(d)r.classList.add("dark");r.style.colorScheme=d?"dark":"light";}catch(e){}})();`,
          }}
        />
        <Providers>
          {children}
          {/* Global sonner toasts (toast() from every module) */}
          <ThemeToaster />
        </Providers>
      </body>
    </html>
  );
}
