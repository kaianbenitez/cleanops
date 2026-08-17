import { Resend } from "resend";

const FROM_ADDRESS = "ServiceSpark <hello@getshimmer.app>";

/** Sends a plain-text email via Resend. Throws if RESEND_API_KEY is unset or the send fails. */
export async function sendEmail(params: { to: string; subject: string; text: string }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY is not configured");

  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from: FROM_ADDRESS,
    to: params.to,
    subject: params.subject,
    text: params.text,
  });
  if (error) throw new Error(error.message);
}
