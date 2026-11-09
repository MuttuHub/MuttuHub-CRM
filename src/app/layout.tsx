import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { Providers } from "./providers";
import { ThemeToaster } from "@/components/shell/theme-toaster";

// Self-hosted (src/app/fonts/README.md): `next/font/google` fetched these at build time, and Next 16.3's
// Turbopack fails the whole build when Google answers with extensionless `/l/font?kit=…&skey=…` URLs
// (vercel/next.js#99114). Same families, latin subset, variable files that cover every weight in use.
// The constant names become the @font-face family names, so they stay unique (not «sans» or «mono»).
const bricolageGrotesque = localFont({
  src: "./fonts/bricolage-grotesque-latin.woff2",
  weight: "200 800",
  variable: "--font-bricolage",
});

const instrumentSans = localFont({
  src: "./fonts/instrument-sans-latin.woff2",
  weight: "400 700",
  variable: "--font-instrument",
});

const jetbrainsMono = localFont({
  src: "./fonts/jetbrains-mono-latin.woff2",
  weight: "100 800",
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
      className={`${bricolageGrotesque.variable} ${instrumentSans.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        {/* Anti-FOUC: applies the theme class before first paint. Inline
            scripts are not hoisted, so this runs in place during parsing.
            Stored value wins; otherwise LIGHT (the system preference is ignored, D6-5). */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("muttu-theme");var d=t==="dark";var r=document.documentElement;if(d)r.classList.add("dark");r.style.colorScheme=d?"dark":"light";}catch(e){}})();`,
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
