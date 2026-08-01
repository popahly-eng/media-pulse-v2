/**
 * Media Pulse — Configuration
 * n8n-only version (no Supabase required)
 */

const CONFIG = {
  // GET: returns { success, clients, sectors }
  FORM_DATA_URL: "https://popahly.app.n8n.cloud/webhook/media-pulse-form-data",

  // POST: sends the selected news item to n8n
  WEBHOOK_URL: "https://popahly.app.n8n.cloud/webhook/media-pulse-send",

  // Used to resolve article titles automatically
  MICROLINK_API: "https://api.microlink.io",
};
