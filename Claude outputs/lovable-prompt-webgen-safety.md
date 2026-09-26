WebGen AI output problem. A downloaded site was blocked by Windows Defender, and the generated HTML contains content the brief never supplied:
- `<form action="https://formsubmit.co/<contact email>">`: visitor data POSTed to a third-party service. A local HTML file with an external POST form is what phishing kits look like, and that's what triggered the virus block.
- `_next` pointing to `https://aaj-marketing.com/thank-you`, a made-up domain we don't own.
- `© 2024`: the model's training year, not the current year.

Please make two changes to `supabase/functions/generate-website/index.ts`.

**1. Tighten the prompt in `buildPrompt()`.** Add these rules to the instruction paragraph:

> Never invent facts about the business: no testimonials or quotes, no client or customer names or logos, no statistics or numbers, no awards, no prices, no team members, no addresses or phone numbers, and no URLs or domains other than those in the brief. Where the brief does not supply a link target, use "#". If a Testimonials, Team or Pricing section is requested, render clearly marked placeholders such as "[Add a real customer quote here]" rather than invented content.
> Contact: show the contact email as a mailto: link. If a Contact Form section is requested, the form must not submit to any external service. Give it action="#" and a small inline script that opens a mailto: link to the contact email with the fields prefilled.
> Do not load any external script. Google Fonts stylesheets are the only permitted external resource.
> Use ${new Date().getUTCFullYear()} for any copyright year.

**2. Add a sanitiser after `stripFences()` and before returning `{ html }`.** Prompts aren't guarantees, so enforce it in code:

```ts
function sanitizeGeneratedHtml(html: string): string {
  let out = html;
  // Forms must never POST to an external endpoint.
  out = out.replace(/(<form\b[^>]*?\baction\s*=\s*)(["'])\s*(?:https?:)?\/\/[^"']*\2/gi, '$1"#"');
  // Hidden fields used by third-party form services (formsubmit, etc.).
  out = out.replace(/<input\b[^>]*\bname\s*=\s*["']_(?:next|subject|honey|captcha|template|autoresponse|replyto|cc)["'][^>]*>/gi, "");
  // No external scripts or frames.
  out = out.replace(/<script\b[^>]*\bsrc\s*=\s*["'][^"']*["'][^>]*>\s*<\/script>/gi, "");
  out = out.replace(/<iframe\b[\s\S]*?<\/iframe>/gi, "");
  return out;
}
```

Call it as `html = sanitizeGeneratedHtml(html);`. Log how many substitutions were made (counts only, never the HTML) so we can see how often the model tries.

Deploy, then generate one test site with a Contact Form and a Testimonials section selected. Confirm:
- no `action="http` anywhere in the output
- testimonials are placeholders, not invented quotes
- the footer year is the current year

Push the change to GitHub so the repo matches what's deployed.
