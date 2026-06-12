# Elevora — drop-in client feedback for your sites

A tiny, dependency-free widget that lets your client reviewers leave pinned comments directly on your site — Vercel-comments style. A reviewer enters their invite code once, toggles comment mode, clicks anywhere on the page, types a note, done. Comments are delivered to your configured backend.

- Zero runtime dependencies, renders in a Shadow DOM (your styles stay yours)
- Invite-code auth — no accounts, no OAuth
- Pins anchor to the clicked element via a generated CSS selector and survive reloads
- Works with SPAs (Next.js App Router client navigation included)

## Install

```sh
npm i @elevora/comments
```

## React / Next.js (App Router)

Add the component once in your root layout:

```tsx
// app/layout.tsx
import { ElevoraComments } from "@elevora/comments/react";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <ElevoraComments project="my-site" apiBase="https://feedback.example.com" />
      </body>
    </html>
  );
}
```

The component is a client component (`'use client'`) that renders nothing and mounts the widget on the client.

## Vanilla

```ts
import { initElevora } from "@elevora/comments";

const handle = initElevora({ project: "my-site", apiBase: "https://feedback.example.com" });
// later, if needed:
handle.destroy();
```

`initElevora` is idempotent per project and SSR-safe (no-op when `window` is undefined).

## How auth works

Each reviewer gets an invite code (e.g. `ELV-MAT-4821`) from whoever runs the project. They enter it once in the widget; it's exchanged for a token stored in `localStorage`. If the token is ever revoked or expires, the widget falls back to the code form automatically. Reviewers only ever see their own open comments.

## Options

| Option    | Type     | Default      | Description                          |
| --------- | -------- | ------------ | ------------------------------------ |
| `project` | `string` | — (required) | Project key invite codes belong to.  |
| `apiBase` | `string` | — (required) | Your deployment of the Elevora comments API. The package ships with no default backend. |

## License

MIT
