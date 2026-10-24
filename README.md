# Asyntai AI Chatbot for Builder.io

Add the [Asyntai](https://asyntai.com) AI chatbot to your Builder.io pages with one click, and send your page content to its knowledge base. The assistant answers your visitors from your own content, in more than 80 languages, day and night.

Full guide: [asyntai.com/documentation/integrations/builderio/](https://asyntai.com/documentation/integrations/builderio/)

## Install

1. In Builder.io, open **Settings > Plugins** and add:

   ```
   @asyntai/builder-plugin-ai-chatbot
   ```

2. Paste your **Asyntai widget ID** (Asyntai dashboard > Install, it starts with `asyntai_`) and click **Save Asyntai settings**.
3. Optional: paste your **Asyntai API key** from [asyntai.com/settings/api/](https://asyntai.com/settings/api/) to send pages to the knowledge base.

No account yet? [Create one free](https://asyntai.com/register/).

## Use

Open the **...** menu of a page or section:

- **Add Asyntai AI Chatbot here** adds a small Custom Code block that loads the chat widget. Publish, and the chat bubble is on your site.
- **Remove Asyntai AI Chatbot** takes it out again.
- **Add to Asyntai knowledge base** reads the text of the entry and adds it to your knowledge base. Run it again after a change: the earlier copy is replaced, not duplicated.

In the content list, select several entries and use **Add to Asyntai knowledge base** to send them all at once.

## Settings

| Setting | Required | What it does |
| --- | --- | --- |
| Asyntai widget ID | Yes | Which chatbot to show |
| Asyntai API key | No | Turns on the knowledge base actions. It stays in your Builder.io settings and is never put on your site |
| Asyntai website ID | No | Only for Asyntai accounts with more than one website |

The chatbot block is a standard Builder.io Custom Code block, so it works with every Builder.io SDK (React, Next.js, Vue, Svelte, Qwik and others) without code changes.

## Develop

```bash
npm install
npm test        # unit tests
npm run build   # dist/plugin.system.js
npm start       # serves http://localhost:1268/plugin.system.js
```

To load the local build, add `http://localhost:1268/plugin.system.js?pluginId=@asyntai/builder-plugin-ai-chatbot` in Builder.io **Settings > Plugins**.

## Support

[hello@asyntai.com](mailto:hello@asyntai.com) or the chat on [asyntai.com](https://asyntai.com).

## License

MIT
