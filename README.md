# Media Pulse

A lightweight media intelligence tool. Choose a message type, fill in the
fields, set a priority, choose who should receive it, and send. No build
step, no framework — just static files, backed entirely by n8n.

## What it does

1. You choose a message type: **News**, **Text**, **Link**, or **File**.
2. You fill in the fields for that type:
   - **News** — paste a URL, Media Pulse fetches the headline automatically
     (via Microlink, with an OpenGraph fallback), and you can edit it.
   - **Text** — write an editorial summary in a large textarea. Line breaks
     are preserved exactly as typed.
   - **Link** — paste a URL, with an optional title and description.
   - **File** — choose a PDF, Word, Excel, PowerPoint, image, or video file,
     with an optional caption.
3. You pick a priority (Urgent / Important / Normal) and a target
   (All Clients / Sector / Client). Clients and sectors are loaded from n8n
   when the app starts.
4. You see a live preview of exactly what the message will look like.
5. Pressing **Send pulse** posts the payload to your n8n webhook — as JSON
   for News/Text/Link, or as `multipart/form-data` for File (since it
   carries binary file data).

## Project structure

```
MediaPulse/
├── index.html      Markup for the single-page app
├── style.css        Dark, glassmorphism SaaS styling
├── app.js           All application logic (vanilla ES6)
├── config.js         Your n8n webhook URLs
├── README.md
└── assets/
    ├── logo.svg
    └── favicon.png
```

## Setup

1. Open `config.js` and fill in:

   ```js
   WEBHOOK_URL: "https://your-n8n-instance.com/webhook/media-pulse",
   FORM_DATA_URL: "https://your-n8n-instance.com/webhook/media-pulse-form-data",
   ```

   - `WEBHOOK_URL` — a single n8n webhook that receives every send:
     JSON bodies for News/Text/Link, and `multipart/form-data` for File.
   - `FORM_DATA_URL` — an n8n webhook (GET) that returns the clients and
     sectors used to populate the recipient pickers, in this shape:

     ```json
     {
       "success": true,
       "clients": [{ "id": "CLI-001", "name": "Client Name" }],
       "sectors": [{ "id": "SEC-001", "name": "Sector Name" }]
     }
     ```

2. Open `index.html` in a browser, or serve the folder with any static file
   host (GitHub Pages, Netlify, Vercel, S3, nginx, etc.). No build step is
   required.

## Webhook payload

On send, Media Pulse builds one unified payload shape and POSTs it to
`CONFIG.WEBHOOK_URL`:

```json
{
  "type": "news",
  "url": "",
  "title": "",
  "description": "",
  "message": "",
  "caption": "",
  "priority": "urgent",
  "mode": "sector",
  "sector_ids": ["..."],
  "client_ids": []
}
```

- `type` is one of `"news"`, `"text"`, `"link"`, `"file"`.
- `priority` is always sent lowercase: `"urgent"`, `"important"`, or
  `"normal"` — even though the buttons in the UI read "Urgent",
  "Important", and "Normal".
- `mode` is one of `"all"`, `"sector"`, `"client"`.
- `sector_ids` is populated only when `mode` is `"sector"`.
- `client_ids` is populated only when `mode` is `"client"`.

Which fields are filled in depends on `type`:

| Type   | Fields used                            |
|--------|------------------------------------------|
| `news` | `url`, `title`                          |
| `text` | `message`                                |
| `link` | `url`, `title`, `description`            |
| `file` | `caption` + an attached `file`           |

For `file`, the same fields (`type`, `caption`, `priority`, `mode`, and
`sector_ids`/`client_ids` as JSON-encoded strings) are sent as
`multipart/form-data` form fields — alongside a `file` field containing the
actual binary upload — to the same `CONFIG.WEBHOOK_URL`. The browser sets
the multipart boundary automatically; the app never sets `Content-Type`
manually for this request.

Every send is treated as successful only when the HTTP response is 2xx
**and**, if the response body is JSON, its `success` field is not `false`.

## Notes on title fetching

- The primary source is the [Microlink API](https://microlink.io), which
  requires no API key for light usage.
- If Microlink can't resolve a title, Media Pulse falls back to reading the
  page's OpenGraph/`<title>` tags through a public read-only proxy.
- If both fail, the title field simply stays empty and editable — type the
  headline in by hand.

## Browser support

Built with standard HTML5, CSS3, and ES6 — works in all current versions of
Chrome, Safari, Firefox, and Edge, on desktop, tablet, Android, and iPhone.
