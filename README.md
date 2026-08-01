# Media Pulse

نسخة تعمل مباشرة مع n8n بدون Supabase.

## التشغيل

1. فك الضغط.
2. افتح مجلد `MediaPulse` في VS Code.
3. شغّل `index.html` عبر **Open with Live Server**.
4. تأكد أن Workflowَي n8n التاليين منشوران:
   - `GET /webhook/media-pulse-form-data`
   - `POST /webhook/media-pulse-send`

## روابط n8n المستخدمة

- Form data: `https://popahly.app.n8n.cloud/webhook/media-pulse-form-data`
- Send news: `https://popahly.app.n8n.cloud/webhook/media-pulse-send`

## ملاحظة

إذا تغير اسم الـ n8n instance أو مسار الـ Webhook، عدّل القيم فقط داخل `config.js`.
