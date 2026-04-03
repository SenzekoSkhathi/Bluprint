import { ScrollViewStyleReset } from "expo-router/html";
import type { PropsWithChildren } from "react";

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no"
        />
        <ScrollViewStyleReset />
        <title>Bluprint</title>

        {/* PWA */}
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#1a73e8" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Bluprint" />
        <link rel="icon" href="/Bluprint%20favicon.png" />
        <link rel="apple-touch-icon" href="/Bluprint%20favicon.png" />

        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function () {
                if (!('serviceWorker' in navigator)) return;

                const host = window.location.hostname;
                const isLocalhost = host === 'localhost' || host === '127.0.0.1' || host === '::1';
                if (isLocalhost) return;

                window.addEventListener('load', function () {
                  fetch('/sw.js', { method: 'HEAD' })
                    .then(function (response) {
                      if (!response.ok) return;
                      return navigator.serviceWorker.register('/sw.js');
                    })
                    .catch(function () {
                      // Ignore registration failures to avoid blocking app startup.
                    });
                });
              })();
            `,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
