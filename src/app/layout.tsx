import type { Metadata, Viewport } from "next"
import { Inter } from "next/font/google"
import { AuthProvider } from "@/components/auth-provider"
import { PwaRegister } from "@/components/pwa-register"
import { BUILD_STAMP } from "@/lib/build-stamp"
import "./globals.css"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "BioPulse",
  description: "Your AI-powered study platform",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "BioPulse",
  },
}

export const viewport: Viewport = {
  themeColor: "#0A1F1A",
  width: "device-width",
  initialScale: 1,
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="dark" data-build={BUILD_STAMP}>
      <head>
        {/*
          Navigation watchdog.

          Pages are server-rendered and streamed, so a slow connection can stall the response
          halfway through. The document then never finishes parsing: the page is left at
          readyState "loading" with an empty body and no error, and nothing ever recovers it —
          the app looks permanently broken with no way out except force-closing it.

          This reloads once if that happens. It lives in <head> as an inline script so it runs
          before the stalled body does, and the sessionStorage guard stops it looping if the
          retry stalls too.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{
  var KEY="bp_nav_watchdog";
  var LIMIT=15000;
  function stuck(){
    if(document.readyState!=="loading")return false;
    var b=document.body;
    // A body with real content means the page rendered and only late assets are pending.
    return !b||b.childElementCount===0;
  }
  setTimeout(function(){
    if(!stuck())return;
    var n=Number(sessionStorage.getItem(KEY)||"0");
    if(n>=2){sessionStorage.removeItem(KEY);return;}
    sessionStorage.setItem(KEY,String(n+1));
    location.reload();
  },LIMIT);
  // Cleared as soon as the document is usable again.
  document.addEventListener("DOMContentLoaded",function(){sessionStorage.removeItem(KEY);});
}catch(e){}})();`,
          }}
        />
      </head>
      <body className={inter.className}>
        <PwaRegister />
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  )
}
